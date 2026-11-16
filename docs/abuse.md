# Abuse and moderation (P2)

How the beta limits what one caller can do, what happens when the limiter itself breaks, and how an operator takes a reported design down.

Migration: `supabase/migrations/20261116090000_flp_abuse_moderation.sql` (additive: two tables, new functions, one trigger). Tests: `supabase/tests/flp_abuse_moderation.test.sql`, `src/lib/rate-limit.test.ts`, `src/lib/flp-api/abuse.test.ts`, `src/lib/flp-api/abuse.integration.test.ts`.

## Request limits

Every count lives in Postgres, so all serverless instances share it. Before this, signed-out limits were counted in each instance's memory and reset on every cold start or second instance.

- **Signed in**: `flp_take_token`, table `rate_limits`, per account (`src/lib/flp-api/server.ts`, `RATE_LIMITS`).
- **Signed out**: `flp_take_request_token`, table `request_limits`, per caller (`src/lib/rate-limit.ts`, `PUBLIC_LIMITS`). The caller is an HMAC-SHA-256 of their address keyed with `SUPABASE_SECRET_KEY`, cut to 32 hex characters. The address is never sent to the database, and the hash can't be reversed by trying every IPv4 address without the key. A caller's rows go when their next window starts, and every row goes within a day (`flp_prune_request_limits`, run with each request).

Both use fixed windows. A refused request gets a 429 with `Retry-After`. The address is the first `x-forwarded-for` entry, which Vercel sets itself.

Signed-out limits apply on Vercel deployments (`VERCEL_ENV` set) or where `FLP_REQUEST_LIMITS=on`. Locally every request comes from one address, so the browser tests and a dev server would trip limits meant for many people. Account limits apply everywhere, as before.

| Bucket | Limit | Covers | If the limiter fails |
| --- | --- | --- | --- |
| `waitlist` | 8 per 15 min per address | `POST /api/waitlist` | **Refuse** (503). It stores email addresses, and volume is the abuse. A person sees "The list is busy. Try again shortly." |
| `events` | 40 per min per address | `POST /api/events` | **Refuse** (503). Inflating a count is the only gain, and a lost count costs nothing. |
| `errors` | 10 per min per address | `POST /api/errors` | **Allow**. An outage is when error reports matter most, and Sentry limits what it accepts on its side. |
| `share_page` | 60 per min per address | `/s/:slug` (`api/og-share.ts`) | **Allow**. A shared link must keep working through a limiter outage. |
| `public_read` | 360 per min per address | `/api/flp/public/:slug`, `/image` and `/vote` | **Allow**, for the same reason. One page is the design plus up to five views. Unknown links count too, so guessing costs the same as reading. |
| `save` | 120 per min per account | create, save, restore | **Allow**. Blocking a save loses work; the account quotas still cap storage. |
| `upload` | 20 per min per account | uploads | **Allow**. The 100 MB per-account quota is enforced in the database regardless. |
| `publish` | 10 per min per account | renders, publish, unpublish | **Refuse** (503). Publishing puts content in front of the public; a refused publish loses nothing and can be retried. |
| `details` | 30 per min per account | rename, delete, public name | **Allow**. Cheap, and blocking a rename or delete helps no one. |
| `vote` | 30 per min per account | cast or retract a vote (V1) | **Allow**. A vote is one per account and can be taken back, so a missed limit costs little. |
| `report` | 5 per min and 30 per day per account | `POST /api/flp/public/:slug/report` | **Allow**. One open report per account and design (or comment) caps what a missed limit can store. |
| `comment` | 6 per min and 60 per day per account | `POST /api/flp/public/:slug/comments` (community) | **Refuse** (503). A comment is public text, like a publish. |
| `follow` | 30 per min per account | follow or unfollow (community) | **Allow**. One row per pair, and it can be undone. |

"Fails" means the database returned an error, gave no answer within 1.5 s twice in a row, or (signed out, on a deployment) the server has no Supabase settings. A call that gets no answer (a timeout or a dropped connection) is tried once more before the policy applies, so one slow moment doesn't refuse a publish; an error the database answers with isn't retried. A refused publish shows "This isn't available right now", and the studio doesn't retry it on its own. Each failure is logged as `flp request limit check failed` or `flp rate limit check failed`.

The shared limits are generous on purpose: people behind one address (an office, a phone network's NAT) share a count. Over the limit, the share page comes back as a 429 with the plain app and no design embedded; the app then asks the public API itself and shows "This design can't load right now" if that is limited too, which never reads as the design being taken down.

A new bucket must choose its policy: `RATE_OUTAGE_POLICY` is typed over every account bucket, and `src/lib/rate-limit.test.ts` pins every choice, so changing one is a visible decision. Update this table with it.

## Vote rules

Set in the database (`20261122090000_flp_rankings_profiles_reports.sql`), so the share page, the board and profiles always agree:

- **One vote per account and design**, as before.
- **No votes on your own design.** The API answers 409 `own_design`, and the button says "You can't vote for your own design."
- **Voting takes the current terms of use.** The share page offers "Accept and vote" the first time; reading counts never needs them.
- **A new account's vote counts once the account is a day old.** The vote is kept from the start and starts counting by itself; the button tells the voter when. Nobody is refused for being new. The age lives in `vote_rules.min_account_age` (24 hours), the same on local and CI databases. Tests age their accounts instead: `setAccountAge` in `src/lib/flp-api/integration-harness.ts` (accounts are two days old unless a test asks for a young one) and `localSql` in the e2e helpers.
- Rankings count votes cast this week (7 days), this month (30 days) or ever, through `flp_counted_votes`, with the rules above.

### Reviewing votes

When a design climbs suspiciously fast, or a report says votes are arranged:

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs votes <slug or link>
```

It lists the design's voters that show signs worth a look: three or more accounts made within the same hour, accounts that voted for no other owner, and votes cast within ten minutes of signing up. These are signs, not proof. Look up the accounts before acting. To remove arranged votes, delete those rows from `publication_votes` (or the accounts, under the terms' "votes are your own" rule), and note what you did and why.

## Reports

Signed in, "Report this design" on a share page records a report (`publication_reports`): the design, a reason (`copyright`, `offensive`, `spam`, `other`), an optional note of up to 500 characters, and the reporter's account. Reporting the same design again while a report is open changes nothing. Only the service role reads reports; the owner never learns who reported. Signed out, the link is an email to `VITE_FLP_CONTACT_EMAIL` with the share link in the body, as before, so someone without an account (a rights holder, say) can still report.

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs reports
```

lists open reports, oldest first. Close each one after deciding:

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs dismiss <report id> --by "<your name>"
```

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs action <report id> --by "<your name>"
```

`action` is for a report that led to a takedown or a word with the owner. Take the design down with the commands below first.

## Comments (community)

Off until `VITE_COMMUNITY` and `FLP_COMMUNITY` are on (`docs/deploy.md`). Then, signed in and with the current terms, anyone can comment on a shared design (1–500 characters). The author can delete their comment and the design's owner can hide any comment on their design. Signed-in readers can report a comment, which lands in the same queue as design reports (`reports` shows `comment <id>`). To hide one for everyone:

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs hide-comment <comment id> --by "<your name>"
```

Hidden comments are kept, with who hid them, and are removed with the design or the author's account. Follows show only a count: nobody can see who follows whom, and only public profiles can be followed.

## Takedowns

Reports arrive from the share page (see Reports above), with the share link or slug.

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs status https://beta.fashionleadervote.com/s/<slug>
```

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs takedown <slug or link> --reason "Reported: <what and by whom>" --by "<your name>" --confirm
```

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs clear <slug or link> --by "<your name>" --confirm
```

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs list
```

`takedown` and `clear` are dry runs without `--confirm`.

What a takedown does (`flp_take_down_publication`, one transaction):

- The publication is revoked at once, as if the owner had unpublished. The share page, its JSON, its images and its votes all answer "not available" (404) straight away; nothing public is cached.
- A hold is recorded in `moderation_holds` against the slug, with the reason, the operator and the time.
- While the hold stands, the trigger `publications_moderation_hold` refuses to make that publication live by any path. The owner's publish gets 403 `taken_down`: "This design was taken down after a report, so it can't be published. Your design itself is kept. Contact us if you think this is a mistake."
- The owner keeps the design, its history and its pictures. Nothing is deleted.
- A design the owner already unpublished can still be held, so a report can be acted on whatever they did meanwhile.

`clear` lifts the hold. It doesn't republish: the owner publishes again when they choose, under the same link.

Only the service role can read or change holds; there is no HTTP route. Deleting the owner's account removes their publications and with them the holds.
