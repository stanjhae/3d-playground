# Reports and data requests (Q10 #195)

What to do with each kind of message that reaches the alpha contact address. The privacy page (`/privacy`) promises all of this, so each step here is what makes a sentence there true.

## Who handles them

- **Contact address:** `VITE_FLP_CONTACT_EMAIL`, shown on `/privacy` and behind every share page's "Report this design" link. On beta it is `tech@fashionleadervote.com`. A deployed build refuses to build without it (`src/lib/build-env.ts`).
- **Accountable person: owner decision, not set yet.** Someone named, plus a backup, who reads that inbox and acts on it. Until then, the owner is.
- **Proposed response time:** reply within 3 working days, and act on a report of illegal or harmful content the same day. To be confirmed by the owner.
- **Keep a record** of each request: date, what was asked, what was done, when. Don't copy design content or anything beyond the email address into it.

The operator commands below need the deployment's secrets. Never paste them into a ticket, chat or email.

## A design is reported

From the "Report this design" link, or any message naming a `/s/<slug>` link.

1. Open the link signed out and look at what's public. You see what the reporter saw: the published version only, never the owner's drafts or history.
2. Decide against the terms (`/terms`). If unsure, take it down first: a takedown loses nothing and can be reversed.
3. Take it down (details in [abuse.md](abuse.md#takedowns)):
   ```bash
   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/moderation.mjs takedown <slug or link> --reason "Reported: <what and by whom>" --by "<your name>"
   ```
   That's a dry run. Add `--confirm` to do it. The link, its pictures and its votes stop working at once. The owner keeps the design but can't publish it again while the hold stands.
4. Reply to the reporter that it has been dealt with, without details about the owner.
5. If the owner writes in to dispute it and you agree, lift the hold with `moderation.mjs clear <slug> --by "<your name>" --confirm`. That doesn't republish: the owner publishes again themselves.

## Someone wants their account deleted

1. Point them to **Delete account** at the bottom of My Studio. It asks them to type their email, removes everything at once and signs them out. That's the normal route.
2. If they can't sign in, check the request came **from the account's own address**. If it didn't, reply to that address asking them to confirm from it. Then:
   ```bash
   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs someone@example.com
   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs someone@example.com --confirm
   ```
   The first command lists what would go: designs and stored files. The second removes the files, then the account. Its designs, history, publications, uploads and votes go with it. It's safe to rerun if interrupted. Don't delete accounts from the Supabase Dashboard: that leaves their files behind.
3. Tell them it's done, and that copies in encrypted backups are deleted within 30 days (`BACKUP_RETENTION_DAYS`, [backup-restore.md](backup-restore.md)).

## Someone wants to leave the waitlist

The waitlist isn't linked to accounts, so deleting an account doesn't remove it.

1. Check the request came from the address on the list.
2. Remove it:
   ```bash
   KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/waitlist.mjs remove someone@example.com
   KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/waitlist.mjs remove someone@example.com --confirm
   ```
   The first command says whether the address is there. The second removes it and prints how many remain.

## Someone asks what is stored about them

Everything tied to an account is visible to its owner in My Studio: their designs, every saved version, uploads, the public name and what is published. Point them there, and to `/privacy` for the full list. If they want more:

- Their email and when they accepted the terms are on their `profiles` row and in Supabase Auth.
- Their votes are rows in `publication_votes` with their user id.
- Usage counts, timings and error reports carry no account, so there is nothing to look up ([operations.md](operations.md), [alerts.md](alerts.md)).
- The request-limit record holds a keyed hash of a network address, deleted within a day ([abuse.md](abuse.md)), so it can't be matched to a person.

There is no export tool yet. Answer by email, and offer deletion if that's what they want.

## Anything else

A question about the alpha, a bug report or press: reply from the same inbox. Security reports go to the owner straight away.
