# Sign-in and sessions (A01 #145, A02 #146, A03 #147)

Email-code sign-in through Supabase Auth. There are no passwords, links or social logins. New and returning accounts use the same flow.

## Settings

| Setting | Local value (`supabase/config.toml`) | Hosted project (set when it exists) |
| --- | --- | --- |
| Code | 6 digits (`otp_length`) | Same |
| Validity | 10 minutes (`otp_expiry = 600`) | Same |
| Resend interval | 60 s (`max_frequency`), matched by `RESEND_SECONDS` in the UI | Same |
| Email template | `supabase/templates/email-code.html`: `{{ .Token }}` only, no link (magic-link and confirmation templates) | Paste the same template into the dashboard |
| Redirect allowlist | `http://localhost:5173`, `http://127.0.0.1:5173` | The deployed origins only |
| Email delivery | Mailpit at http://127.0.0.1:54324 (catches all mail) | Custom SMTP sender; the default Supabase SMTP is rate-limited and not for production |
| Send rate limit | Not applied locally (needs SMTP) | `auth.rate_limit.email_sent`, set per capacity (Q02 #187) |

Neither the client nor the app server logs codes or keys. The browser only receives `VITE_SUPABASE_URL` and the publishable key. The service-role key is server-only (F08).

## Flow

1. `/sign-in?returnTo=…` asks for an email. Every request gets the same neutral reply ("If … can receive email, a code is on its way"), so the page never reveals whether an account exists.
2. The code step accepts paste and one-time-code autofill, with spaces or dashes. A wrong, reused or expired code keeps the user on this step with one shared message, because Supabase reports all three as `otp_expired`. Resend is disabled during the 60-second countdown.
3. On success the browser goes to `safeReturnPath(returnTo)`. Only same-origin paths are accepted; absolute URLs, `//host`, backslashes, control characters and `/sign-in` itself fall back to `/create`.

Logic is in `src/lib/auth/` (`code-flow.ts`, `return-path.ts`, `session-store.ts`) and is unit-tested. The screen is `src/routes/sign-in.tsx`.

## Sessions

- `session-store.ts` is the single source of truth. It loads the stored session at boot and follows refresh, expiry and sign-out through `onAuthStateChange`.
- `accountEpoch` changes on every account change. Async work captures `accountGuard()` before it starts and discards its result if the account changed meanwhile, so a response for account A never fills account B's screen. Cloud calls (S03 #172) must use it.
- A different account signing in resets the editor. An explicit **Sign out** also resets it.
- Sign-out ends this browser's session only; other devices stay signed in. The refresh token and the API stop accepting it at once, but direct Supabase REST can read the owner's rows with the old access token until it expires, at most an hour (`docs/decisions.md`, 3 Nov).
- Expiry keeps the open design in memory and sends the browser to sign-in, so the same account can pick up where it left off.

## Sign-in required by default

Wherever Supabase is configured, `/create` and `/studio` require a session (A05 #149):
- After sign-in the browser goes to **My Studio** (`/studio`). Signed-in `/create` without `cloud=` or a board remix (`design=`) redirects there.
- Publishing refuses without a session, and a cloud design can only publish once it shows **Saved privately**.
- `VITE_FLP_REQUIRE_AUTH=false` opts out, for a guest-only demo build.
- Deploys without Supabase env vars, such as today's Vercel production, keep the guest studio.

## Terms of use (P1)

- `/terms` holds the terms; the version in force is `TERMS_VERSION` in `src/lib/terms.ts`, the date they took effect.
- Before My Studio or the studio opens, `TermsGate` (inside `RequireSession`) reads `GET /api/flp/profile`. If `termsVersion` isn't the current one, it shows the terms gate: a link to `/terms`, **Accept and continue**, and **Not now**, which signs out. New accounts meet it straight after their first sign-in; accounts from before the terms (null in the database) meet it the next time they open either page. Pages outside the studio (landing, `/terms`, `/privacy`, shared designs) never ask.
- `POST /api/flp/terms` `{ version }` records only the current version (anything else is 409, so a page left open across a change reloads first). Accepting the same version again keeps the first time. Stored in `profiles.terms_version` and `terms_accepted_at`, so other devices don't ask again.
- **Changing the terms:** edit `src/routes/terms.tsx`, set a new `TERMS_VERSION` and `TERMS_UPDATED`. Every account is then asked once more.
- e2e: `signIn` accepts the gate for the test (`acceptTerms: false` leaves it); a test that signs in by hand calls `passTermsGate`. `e2e/account.spec.ts` tests the gate itself.

## Deleting an account (P1)

- **Self-serve:** My Studio → Delete account (at the bottom) → type the account's email → Delete my account. `DELETE /api/flp/account` `{ confirmEmail }` checks the email against the session's account (case and outer spaces ignored), then runs `src/lib/flp-api/account-deletion.mjs`: the account's files first, then the account, whose rows go by cascade (designs, history, publications, renders, uploads, profile and terms, rate limits), then one more sweep for an upload that was in flight. A failure part-way leaves the account in place and answers 500; trying again finishes it.
- The browser then forgets that account's local copies (snapshots, unsaved recovery), goes to `/account-deleted` and signs out locally. Other devices' sessions stop at the API at once (the account no longer exists); direct Supabase REST sees no rows.
- **Operator:** `scripts/delete-account.mjs <email> [--confirm]` runs the same module, for requests by email.

## Known gaps (tracked)

- **Snapshots are owner-scoped** (#147). Cloud designs recover per owner (S05 #174, see `docs/data-model.md`), and the guest draft `flv:draft:current` is only used while signed out. Snapshots (`design-snapshots.ts`) are stored under `flv:draft:mornings:<userId>` while signed in; signed-out guests keep `flv:draft:mornings`. The list refreshes on every account change.
- **A signed-in publish still goes to the legacy guest board.** F09 #144 retires that path; P03 #181 publishes owned versions.
- **No hosted project yet.** "Codes arrive on the deployed domain" (#145) is verified once one exists.

## Local check

```bash
supabase start
cp .env.example .env.local
VITE_FLP_REQUIRE_AUTH=true pnpm dev
```

Copy `PUBLISHABLE_KEY` from `supabase start` into `.env.local` before starting the dev server. Open `/studio` and you are sent to sign-in. Request a code, then read it in Mailpit at http://127.0.0.1:54324.

**Run the Supabase CLI only from the main checkout.** If `supabase start`, `db reset` or `test db` runs from another worktree, Kong serves the email templates from that folder. Once the folder is gone, sign-in emails silently fall back to the default **magic link**. To fix it, run `supabase stop && supabase start` from the main checkout.
