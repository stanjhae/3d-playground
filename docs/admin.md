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

## Routes

All are GET, admin-only, and `Cache-Control: no-store` (`apps/admin/src/server/handlers.ts`):

| Route | Answers |
| --- | --- |
| `/api/me` | The admin's email: the app's access check. |
| `/api/overview` | Accounts, designs, published designs, open reports. |

New panels add a route there, behind the same `requireAdmin` gate, with a test in `handlers.test.ts` that a non-admin gets 403.

## Deploy (one-time, in Vercel)

1. Create a second Vercel project from this repository, with **Root Directory** `apps/admin`. Framework preset: Vite.
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser), `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server only, never `VITE_`).
3. A domain, for example `admin.fashionleadervote.com`. The app sends `X-Robots-Tag: noindex` and a strict content policy (`apps/admin/vercel.json`).
4. Apply migration `20261128130000_flp_admins.sql` to the project's database, then grant access as above.

Only `master` deploys, as for the site.

## Develop

```bash
pnpm dev:admin
```

It runs on port 5180 against the Supabase in the root `.env.local`; `api/*` is served by the dev server the way Vercel serves it.
