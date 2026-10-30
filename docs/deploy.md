# Staging and production deploy (Q01 #186)

How to stand up a hosted environment for the alpha once a Supabase project exists, and how to check it. Everything below already runs locally (`supabase start`, `pnpm dev`, `pnpm e2e`), so the hosted steps only swap the local stack for a hosted one.

Run every Supabase CLI command from the **main checkout** (see [auth.md](auth.md#local-check)).

## 1. Supabase project

1. Create the project (one per environment: `flp-staging`, later `flp-prod`). Choose the region nearest the demo audience, and save the database password in the team password manager.
2. Link and push the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   `db push` applies every file in `supabase/migrations/` in order. It's safe to rerun: already-applied migrations are skipped.
3. Check that the schema is what the tests expect:
   ```bash
   supabase test db --linked
   ```
   It should report **Result: PASS**. The pgTAP tests run inside a transaction and roll back, so they leave no data behind.
4. **Storage:** `design-assets` should exist and be **private**, with a 10 MB file limit and PNG/JPEG only. The isolation migration creates it, but confirm it in Dashboard → Storage.

## 2. Auth

Dashboard → Authentication. The values must match the local `supabase/config.toml` and [auth.md](auth.md#settings):

| Setting | Value |
| --- | --- |
| Providers | Email only, with "Confirm email" on. Every other provider is off. |
| Email OTP length / expiry | 6 digits / 600 s |
| Resend interval | 60 s |
| Templates: Magic link **and** Confirm signup | Paste `supabase/templates/email-code.html` into both (it shows the code only, with no link) |
| Site URL | The environment's origin, e.g. `https://staging.<domain>` |
| Redirect URLs | That origin only. No localhost on staging or production. |
| SMTP | A custom sender, e.g. `noreply@<domain>`. The built-in Supabase SMTP is rate-limited and only for testing. |
| Rate limits | Set "emails sent per hour" to match expected testers (Q02 #187) |

Check it by signing in once on the deployed site with a real inbox. The email must contain a 6-digit code and **no link**.

## 3. Vercel environment variables

Set these per environment (Preview = staging, Production = production). **Never prefix a secret with `VITE_`**: every `VITE_` value ships to the browser.

| Variable | Exposure | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Project publishable (anon) key |
| `VITE_FLP_REQUIRE_AUTH` | Browser and server | `true`. `api/designs.ts` also reads it: with Supabase configured, the legacy guest board refuses new looks and votes unless this is `false` (#144). |
| `VITE_FLP_CONCEPT` | Browser | `false` (non-tee concept features stay off) |
| `VITE_FLP_CONTACT_EMAIL` | Browser | The alpha contact address. It's shown on `/privacy` and in "Report this design". |
| `SUPABASE_URL` | Server only | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | Server only | Same publishable key |
| `SUPABASE_SECRET_KEY` | Server only | The project secret (service-role) key. Used only by `api/flp.ts` and `api/og-share.ts`. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Server only | Optional. Used by the waitlist and the aggregate usage counts (`api/events.ts`); without them the counts aren't kept. |

The functions in `vercel.json` (`api/flp.ts`, `api/og-share.ts`, …) include `src/lib/**`, so no extra build step is needed. Redeploy after changing any variable.

## 4. Smoke checks (about 10 minutes)

On the deployed URL:

1. `/sign-in`: request a code and sign in. You land on **My Studio**.
2. Create a T-shirt, draw on the front, and type on the back. The status goes **Saved to cloud**. Reload, and the work is still there.
3. History → Save checkpoint → edit → Restore. A new "restore" version appears.
4. Publish → open the link in a private window. You see three views, plus the title and public name.
5. Paste the link into Slack or a link previewer. The OG title and image appear.
6. Unpublish. The private window, reloaded, shows "This design is not available".
7. Delete the design from My Studio.
8. `/privacy` shows the contact address, and "Report this design" opens an email.

Then run the automated journey against the environment. This needs a test inbox the suite can read: point `MAILPIT_URL` at a staging mail catcher, or run only the signed-out checks.

```bash
E2E_BASE_URL=https://staging.<domain> SUPABASE_URL=… SUPABASE_SECRET_KEY=… pnpm e2e
```

The suite creates `e2e-*@example.test` accounts and deletes them afterwards with the admin API. On staging, use a mail catcher (custom SMTP pointed at it) so codes are readable. Never run it against production.

## 5. Rollback

- **App:** in Vercel → Deployments, promote the previous deployment. Nothing else depends on the deployment version.
- **Database:** migrations only add things. To undo one, write a new forward migration; don't edit an applied file. Before any risky migration, take a backup (Dashboard → Database → Backups, or `supabase db dump --linked -f backup.sql`). Restore-from-backup is drilled under Q09 #194.
- **Leaked secret:** rotate the secret key in Supabase (Settings → API), update `SUPABASE_SECRET_KEY` in Vercel, and redeploy. The publishable key is public by design.

## 6. Operations

- **Orphaned uploads:** run the cleanup weekly, dry run first.
  ```bash
  SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/cleanup-orphans.mjs
  ```
  Add `--delete` once the listing looks right (see [data-model.md](data-model.md#quotas-retention-and-rate-limits-s09-178-q02-187)).
- **Account deletion request:** check the request came from the account's own address, then delete the user in Dashboard → Authentication. Their designs, versions, publications and uploads go with it ([auth.md](auth.md)).
- **Reported design:** open the link from the report. If it breaks the rules, unpublish it by setting its publication to revoked (`select public.flp_revoke_publication(owner_id, design_id)` in the SQL editor), then reply to the reporter.
