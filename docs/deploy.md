# Staging and production deploy (Q01 #186)

How to stand up a hosted environment for the alpha once a Supabase project exists, and how to check it. Everything below already runs locally (`supabase start`, `pnpm dev`, `pnpm e2e`), so the hosted steps only swap the local stack for a hosted one.

Run every Supabase CLI command from the **main checkout** (see [auth.md](auth.md#local-check)).

## Where staging is now

Staging is the Vercel project's **Production** environment at `https://3d-playground-vert.vercel.app`, on the Supabase project "Fashion Leader Vote Staging" (`docs/decisions.md`, 3 Nov). Where this page says Preview for staging, that deployment uses Production instead. Every merge to master deploys there, so a merge with a new migration also needs `supabase db push`. A real production later gets its own Supabase project and these variables move.

Custom SMTP is set, and staging sends 6-digit sign-in codes. Latest record: `docs/evidence/hosted-2026-11-09.md`, which skipped the browser journey because the run had no way to read sign-in codes (section 5 lists the ways to read them). Last full run, journey included: `docs/evidence/hosted-2026-11-04.md`.

To target staging without linking the CLI, use `--db-url` with the session pooler connection string, for example `supabase db push --db-url "$STAGING_DB_URL"`.

## Bring up staging in 30 minutes

The short path for the owner. Sections 1–5 below have the detail behind each step.

1. **Create the Supabase project** (about 5 min). Dashboard → New project, name `flp-staging`, the region nearest the demo audience. Save the database password in the team password manager. From Settings → API, note the project URL (`https://<ref>.supabase.co`), the publishable (anon) key and the secret key.
2. **Link it and push the migrations** (about 5 min), from the main checkout:
   ```bash
   supabase link --project-ref <ref>
   ```
   ```bash
   supabase db push
   ```
   ```bash
   supabase test db --linked
   ```
   The last command must report **Result: PASS**. Then confirm that the `design-assets` bucket is private (section 1).
3. **Set up SMTP and the redirect URLs** (about 10 min). Dashboard → Authentication, using the table in section 2: email only with "Confirm email" on, a 6-digit code that expires after 600 s, 60 s resend, `supabase/templates/email-code.html` in both the Magic link and Confirm signup templates, custom SMTP, and the Site URL and Redirect URLs set to the staging origin only. For the automated journey, point staging SMTP at a mail catcher with a Mailpit-compatible API. `e2e/helpers.ts` reads codes from it through `MAILPIT_URL`.
4. **Set the Vercel environment variables** (about 5 min) for **Preview** from the table in section 3, then redeploy. Give staging a hostname with a `staging` label (for example `staging.<domain>`), or use its `*.vercel.app` preview URL. `hosted:check` refuses any other host.
5. **Run `pnpm hosted:check`** (about 5 min, plus the e2e suite):
   ```bash
   E2E_BASE_URL=https://staging.<domain> SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=… SUPABASE_SECRET_KEY=… SUPABASE_ACCESS_TOKEN=… MAILPIT_URL=… pnpm hosted:check
   ```
   It prints PASS, FAIL or SKIP for each check, then runs `pnpm e2e` against staging. It writes the record to `docs/evidence/hosted-<date>.md`. Commit that file and link it on #186. Exit code 0 means nothing failed. A SKIP names the missing variable, so supply it and rerun for a full record.

**What the variables unlock.** `E2E_BASE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required. Without the others, the checks that need them are skipped, not passed:
- `SUPABASE_SECRET_KEY` enables the checks that write. They use only `it-*@example.test` and `e2e-*@example.test` accounts that the run creates, and remove them with their files at the end (`deleteAccounts`). It's sent only to `SUPABASE_URL`.
- `SUPABASE_ACCESS_TOKEN` is a personal access token (Account → Access Tokens). It lets the check read the project's auth config from the Management API.
- `MAILPIT_URL` lets the e2e suite read sign-in codes.

**Flags.**
- `--production-readonly` runs against a host without a staging label. It runs only the header and anonymous checks, which write nothing.
- `--allow-local` permits `localhost`, for testing the kit against `pnpm build && pnpm preview`. That run writes `hosted-<date>-local.md`, which is gitignored.
- `--skip-e2e` skips the browser suite. `--e2e-args "journey security"` limits it to the named specs.

**What each check re-verifies.** These issues were closed after passing on local Supabase. The check is their "passes against the deployed backend" step (the list on #186).

| Check | Re-verifies | What it asserts |
| --- | --- | --- |
| `security-headers` | #187 | `/`, `/sign-in`, `/s/:slug` and `/api/flp/public/:slug` send exactly the headers in `src/lib/security-headers.ts`: CSP, nosniff, referrer, `X-Frame-Options` and permissions |
| `csp-supabase` | #187 | The header's `connect-src` and `img-src` allow this Supabase project and no local host. The page's `<meta>` policy narrows them to exactly this project, so the build's `VITE_SUPABASE_URL` is right |
| `bundle-secrets` | #186, #188 | The served entry and preloaded scripts contain no `service_role`, `sb_secret_…` or `SUPABASE_SECRET_KEY` value |
| `anonymous-routes` | #188, #148, #187, #183 | The route table from #251 (`src/lib/flp-api/route-table.ts`), signed out: every private route returns 401, an unknown public slug returns 404 no-store, and every mutation from another origin returns 403 `cross_origin` |
| `events-allowlist` | #193, #187 | `/api/events` returns 400 for unknown names, extra fields, unknown timing buckets and non-JSON. Nothing is counted |
| `auth-providers` | #145, #147 | Supabase Auth allows email only, with "Confirm email" on and sign-up open, so a first sign-in creates the account |
| `email-code-config` | #145, #146 | Site URL and the redirect allowlist are the staging origin only. The code is 6 digits with 600 s expiry, resend waits 60 s, SMTP is custom, and both templates send the code with no link. Config only: delivery is the e2e sign-in plus one real-inbox sign-in (section 5) |
| `owner-isolation` | #148, #188, #149, #170 | Another account gets 404 on every owner route in the table, without leaking ids, and the owner's design, publication and asset don't change |
| `render-hash` | #180, #179, #182 | All five published views are served through the image route with the SHA-256 recorded at upload. A view replaced in storage returns 404 |
| `public-no-store` | #183, #182 | The public payload, the images and `/s/:slug` are `no-store`, and none of them come from the CDN cache |
| `unpublish-404` | #183, #181 | After unpublishing, the payload and every image URL return 404 no-store, and the share page loses the title |
| `e2e` | #189, #146, #149, #152, #172, #174, #175, #176, #177, #181, #187, #190 | `pnpm e2e` with `E2E_BASE_URL` covers the four-panel journey, isolation, CSP and XSS, the failure matrix, publish review and the rest of `e2e/` |

**Still manual** (from #186): `supabase test db --linked` for #143 and #148 (step 2), a dry run of `scripts/cleanup-orphans.mjs` for #178 (section 7), required status checks for #188 and #192, the rights sign-off for #142 (#138), and one real-inbox sign-in for #145 and #146.

For a release candidate, `node scripts/release-record.mjs --hosted docs/evidence/hosted-<date>.md` adds this record to the release record (see [release.md](release.md)).

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

The functions run in `dub1` (`vercel.json`), next to the Supabase project in `eu-west-1`. A project in another region should change this: every API call makes several database calls, so a long way between them adds up (found on 4 Nov, when they ran in `iad1`).

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
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Server only | Optional. Used by the waitlist and the aggregate usage counts (`api/events.ts`); without them the counts aren't kept. How to read them and the proposed alerts: [operations.md](operations.md). |

The functions in `vercel.json` (`api/flp.ts`, `api/og-share.ts`, …) include `src/lib/**`, so no extra build step is needed. Redeploy after changing any variable.

## 4. Security headers (Q02 #187)

Every route, including the API and the crawler pages, gets the headers in `vercel.json` → `headers`: a Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a `Permissions-Policy` that turns off camera, microphone, location, payment, sensors and the rest.

The source is `src/lib/security-headers.ts`. `vercel.json` can't import code, so it holds a generated copy: after changing the policy run `node scripts/security-headers.mjs`. `pnpm test` fails while the two differ. The Vite dev and preview servers send the same headers from the same file, so `pnpm e2e` runs under the enforced policy and fails on any violation.

What the policy allows, and why:

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Everything is served from the app's origin |
| `script-src` | `'self' 'wasm-unsafe-eval'` | The Draco decoder for the compressed garments is WebAssembly. No `'unsafe-eval'` (three.js and R3F don't need it) and no inline script |
| `style-src` | `'self'` | Tailwind builds to a file. React `style` props are set through the DOM, which CSP doesn't block |
| `img-src` | `'self' data: blob:` + Supabase | Data and blob URLs for uploads, captures and textures; signed render URLs from Supabase Storage |
| `connect-src` | `'self' blob:` + Supabase | The API, Supabase Auth and Storage; three's GLTFLoader fetches embedded textures from blob URLs |
| `worker-src` | `'self' blob:` | drei runs the Draco decoder in blob-URL workers |
| `font-src` | `'self' data:` | Bundled fonts |
| `object-src` / `frame-ancestors` | `'none'` | No plugins; the site can't be framed |
| `base-uri` / `form-action` | `'self'` | |

**Supabase per environment.** `vercel.json` is shared by Preview and Production, which point at different projects, so the header allows `https://*.supabase.co`. At build time Vite adds a `<meta http-equiv="Content-Security-Policy">` to `index.html` that narrows `connect-src` and `img-src` to the build's `VITE_SUPABASE_URL`. Browsers enforce both policies, so each deployment can only reach its own project. Nothing to set beyond `VITE_SUPABASE_URL` (section 3). If a project ever moves to a custom domain, add it to `DEPLOYED_SUPABASE_SOURCE` and regenerate `vercel.json`.

In dev, the header names the local stack (`http://127.0.0.1:54321`) exactly. It adds a per-start nonce for the React refresh preamble and the CSS that Vite's dev client injects inline. Nothing else differs from production.

**Origin policy.** `/api/flp` refuses `POST`, `PATCH` and `DELETE` whose `Origin` isn't the deployment's own origin (`403 cross_origin`, see [data-model.md](data-model.md#trust-boundary)). It compares against the URL the function receives, which on Vercel is the public `https://` host. If saving fails on a new environment with `cross_origin`, a proxy in front is rewriting the host.

## 5. Smoke checks (about 10 minutes)

On the deployed URL:

1. `/sign-in`: request a code and sign in. You land on **My Studio**.
2. Create a T-shirt, draw on the front, and type on the back. The status goes **Saved to cloud**. Reload, and the work is still there.
3. History → Save checkpoint → edit → Restore. A new "restore" version appears.
4. Publish → open the link in a private window. You see five views (front, three-quarter, back, then both sleeves), plus the title and public name.
5. Paste the link into Slack or a link previewer. The OG title and image appear.
6. Unpublish. The private window, reloaded, shows "This design is not available".
7. Delete the design from My Studio.
8. `/privacy` shows the contact address, and "Report this design" opens an email.
9. `curl -sI https://staging.<domain>/` shows the `Content-Security-Policy` and the other headers from section 4. On any page, the DevTools console shows no "Content Security Policy" errors.
10. A mutation from another origin is refused:
    ```bash
    curl -s -X DELETE -H 'Origin: https://example.com' https://staging.<domain>/api/flp/designs/00000000-0000-0000-0000-000000000000
    ```
    returns `403` with `cross_origin`.

Then run the automated journey against the environment. This needs a way to get sign-in codes: point `MAILPIT_URL` at a staging mail catcher, or set `E2E_CODE_SOURCE=admin` and `E2E_EMAIL_DOMAIN` to read them from the auth admin API, with mail going to a domain that accepts it. The second way doesn't prove delivery, so also sign in once with a real inbox. Each sign-in sends a real email, so raise "emails sent per hour" for the run and put it back afterwards.

```bash
E2E_BASE_URL=https://staging.<domain> SUPABASE_URL=… SUPABASE_SECRET_KEY=… pnpm e2e
```

The suite creates `e2e-*@example.test` accounts and deletes them afterwards with the admin API. On staging, use a mail catcher (custom SMTP pointed at it) so codes are readable. Never run it against production.

## 6. Rollback

- **App:** in Vercel → Deployments, promote the previous deployment. Nothing else depends on the deployment version.
- **Database:** migrations only add things. To undo one, write a new forward migration; don't edit an applied file. Before any risky migration, take a backup (Dashboard → Database → Backups, or `supabase db dump --linked -f backup.sql`). Database plus storage backup and the restore check are in [backup-restore.md](backup-restore.md) (Q09 #194).
- **Leaked secret:** rotate the secret key in Supabase (Settings → API), update `SUPABASE_SECRET_KEY` in Vercel, and redeploy. The publishable key is public by design.

## 7. Operations

- **Orphaned uploads:** run the cleanup weekly, dry run first.
  ```bash
  SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/cleanup-orphans.mjs
  ```
  Add `--delete` once the listing looks right (see [data-model.md](data-model.md#quotas-retention-and-rate-limits-s09-178-q02-187)).
- **Account deletion request:** check the request came from the account's own address, then run:
  ```bash
  SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs someone@example.com
  SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/delete-account.mjs someone@example.com --confirm
  ```
  The first command is a dry run that reports the designs and stored files. The second removes the account's files, then the account; its designs, versions, publications and upload rows go with it through the database cascades. **Don't delete accounts from the Dashboard alone:** that leaves their files (including uploaded images) in storage. If it happens, the weekly cleanup below removes them.
- **Reported design:** open the link from the report. If it breaks the rules, unpublish it by setting its publication to revoked (`select public.flp_revoke_publication(owner_id, design_id)` in the SQL editor), then reply to the reporter.
