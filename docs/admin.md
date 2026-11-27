# Internal admin (`apps/admin`)

The admin is its own app: its own Vercel project and domain, its own sign-in, and its own server functions. Nothing of it ships in the public site's bundle, and the public API has no admin routes.

## Access

- **Sign-in:** the same Supabase accounts as the site, by email code. The admin never creates an account (`shouldCreateUser: false`), and its session is stored apart from the site's (`flv-admin-auth`).
- **Who is an admin:** an account with a row in `public.admins` (migration `20261128130000_flp_admins.sql`). The admin's server functions check that row with the service role on every request. Anyone else gets 401 (not signed in) or 403 (not an admin), and no data. If the check itself fails, the answer is 503, never access.
- **Granting access:** in the Supabase SQL editor for the project:

  ```sql
  insert into public.admins (user_id, note)
  select id, 'founder' from auth.users where email = '<their email>';
  ```

  To remove someone: `delete from public.admins where user_id = '<id>';`. The account must exist first, so sign in to the site once.

## Panels and routes

Every route is admin-only and `Cache-Control: no-store` (`apps/admin/src/server/handlers.ts`; the reads and actions are in `panels.ts`). Writes are POST with a JSON body, and a cross-origin `Origin` is refused. A route not listed is 404; a method not listed is 405, before any sign-in check.

| Panel | Route | Answers or does |
| --- | --- | --- |
| (access check) | `GET /api/me` | The admin's email, and the site and PostHog URLs the panels link to. |
| Overview | `GET /api/overview` | Accounts, designs, published designs, open reports, and a link to PostHog (`FLV_POSTHOG_URL`). |
| Users | `GET /api/users?q=` | Accounts newest first, matching email, name, handle or id: sign-up date, last sign-in, design count. Reads the first 1,000 accounts and shows 50. |
| Designs | `GET /api/designs?q=&published=1` | Designs last changed first, by title or design id: owner, state, publication and any moderation hold, with a link to the share page. 50 at most. |
| | `POST /api/designs` `{ action: "unpublish", designId }` | Unpublishes now, as the owner could (`flp_revoke_publication`). The owner can publish again; use a report's **Hide content** to stop that. |
| Reports | `GET /api/reports` | The open queue, oldest first (`packages/moderation`, shared with `apps/web/scripts/moderation.mjs`). |
| | `POST /api/reports` `{ id, action }` | `dismiss`: nothing wrong. `action` (Resolve): handled another way. `hide`: hides the reported comment, or takes the design down and holds its link, then closes the report as actioned. The records name the operator as `admin: <email>`. |
| Health | `GET /api/health` | The site's own `/api/health` (read from the server at `FLV_SITE_URL`) and the latest committed hosted-check record. |
| Flags | `GET /api/flags` | `VITE_PATTERN_BETA`, `VITE_AI_ASSIST` and `FLP_AI_ASSIST` as the site's `/api/health` reports them (on or off only), read-only. Unknown until the site runs a build that reports them. |

New panels add a route there, behind the same `requireAdmin` gate, and add it to `EVERY_ROUTE` in `handlers.test.ts`, which checks that a non-admin gets 403 on every route with nothing read or changed.

**Hosted-check record.** `pnpm --filter @flv/admin summary` (run by the admin's `dev` and `build`) bakes the newest `docs/evidence/hosted-<date>.md` into `apps/admin/src/server/hosted-summary.gen.json`, without the Supabase URL. So the panel shows the latest record committed when the admin was deployed; redeploy the admin after committing a new one.

## Deploy (one-time, in Vercel)

1. Create a second Vercel project from this repository, with **Root Directory** `apps/admin`. Framework preset: Vite.
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser), `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server only, never `VITE_`). Optional, server only: `FLV_SITE_URL` (the site's origin, e.g. `https://fashionleadervote.com`, for Health, Flags and the share-page links) and `FLV_POSTHOG_URL` (a PostHog dashboard to link to).
3. A domain, for example `admin.fashionleadervote.com`. The app sends `X-Robots-Tag: noindex` and a strict content policy (`apps/admin/vercel.json`).
4. Apply migration `20261128130000_flp_admins.sql` to the project's database, then grant access as above.

Only `master` deploys, as for the site.

## Develop

```bash
pnpm dev:admin
```

It runs on port 5180 against the Supabase in the root `.env.local`; `api/*` is served by the dev server the way Vercel serves it.
