# Alerts: crashes, health and the beta check (O1)

Three signals tell someone the hosted site is broken without a tester having to say so. Usage counts and timing thresholds are in [operations.md](operations.md).

| Signal | Where it shows | Who hears |
| --- | --- | --- |
| A browser or API error | Sentry, once `SENTRY_DSN` is set | Sentry's alert email (set up below) |
| Beta is down, unhealthy or misrouted | A `synthetic-alert` issue in this repository | The repository owner (assigned), and anyone watching the repository |
| A deploy can't reach Supabase | `GET /api/health` answers 503, so the beta check fails | As above |

## Error tracking

**Provider: Sentry** (free Developer plan is enough for the alpha). There is no Sentry SDK in the bundle: the site's own reporter (`src/lib/error-reporter.ts`, a few hundred bytes) sends a small report to `POST /api/errors` on the same site, and the function forwards it to Sentry's envelope endpoint (`src/lib/error-tunnel.ts`). So:

- the Content-Security-Policy needs no new host (`connect-src` stays `'self' blob:` + Supabase), and ad blockers that block Sentry don't drop reports;
- the DSN is server-only, and Sentry only ever sees Vercel's address, never a visitor's;
- the server decides exactly what is sent: error type, message, stack, a scrubbed page path (`/s/:slug`, `/api/flp/designs/:id`), the mechanism, the commit (`release`) and `VERCEL_ENV` (`environment`). Emails, tokens, Supabase keys, UUIDs and query strings are removed (`scrubText`). No user, cookies, headers or breadcrumbs. `/privacy` says this under "Error reports".

What is reported:

- **Browser** (production builds only): errors a route's error boundary caught ("Something went wrong"), errors that unmounted the app, uncaught `error` events and unhandled promise rejections. Router redirects and not-founds, `ResizeObserver` noise, cross-origin "Script error.", extension stacks and aborted fetches are skipped. At most 5 distinct errors per page load; `/api/errors` takes 10 a minute per client.
- **API**: every function in `api/` is wrapped by `withErrorReporting`. A throw becomes a reported 500; a 5xx the handler returned itself (for example `/api/flp`'s own `internal` errors) is reported as `ServerErrorResponse` with the method and route.

Without `SENTRY_DSN` everything still runs and reports are dropped. `GET /api/health` shows `"errorTracking": "on"` once it is set.

### What the owner must set up

1. Create a Sentry account and organisation, **EU data region** (the Supabase project is in `eu-west-1`).
2. Create a project, platform **JavaScript** (Browser), named e.g. `fashion-leader-vote`. Copy its DSN (Settings → Client Keys).
3. In the project's Settings → Security & Privacy, turn on **Prevent Storing of IP Addresses** and keep **Data Scrubber** on. Belt and braces: the reports carry no visitor address anyway.
4. Add `SENTRY_DSN` to the Vercel project (Production, which is beta, and Preview), then redeploy.
5. Alerts → Create Alert → Issues: "A new issue is created" → email the named operator. Add a second rule, "Number of events in an issue is more than 20 in 1 hour", for a crash loop.
6. Check it: `curl -s https://beta.fashionleadervote.com/api/health` shows `"errorTracking":"on"`. To see a report arrive, run in the browser console on beta: `fetch('/api/errors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'browser',type:'Error',message:'O1 test report',mechanism:'manual'})})`, then resolve the issue in Sentry.

Stacks point at minified files; source maps aren't uploaded yet (a follow-up, needs a Sentry auth token in the build).

## Health endpoint

`GET /api/health` (`src/lib/health.ts`), never cached:

```json
{ "ok": true, "version": "0.9.0-rc.6", "commit": "afc7e94…", "environment": "production", "supabase": "ok", "errorTracking": "on" }
```

`supabase` is `ok`, `unreachable` (then the response is **503**) or `not_configured` (local and CI). The check is Supabase Auth's `/auth/v1/health` with the publishable key and a 3 s timeout: it touches no table. `version` is `package.json`'s, `commit` is the first 12 characters of `VERCEL_GIT_COMMIT_SHA`, so it answers "which build is live?".

## Scheduled check of beta

`.github/workflows/synthetic.yml` runs `scripts/synthetic-check.mjs` four times an hour (at :07, :22, :37, :52; GitHub may start a scheduled run several minutes late). Three read-only GETs, no sign-in and no writes, so it fits the rule that only read-only checks run against beta:

| Check | Passes when |
| --- | --- |
| Home page `/` | 200 HTML with the app shell and the security headers (`frame-ancestors 'none'`) |
| `/api/health` | 200, `ok: true`, `supabase: "ok"`, `Cache-Control: no-store` |
| Share API 404 | `/api/flp/public/synthetic-missing-<random>` answers 404 `not_found` |

A failing check is retried once after 20 s. If it still fails, the run fails and opens one issue labelled `synthetic-alert`, assigned to the repository owner (GitHub emails the assignee), or comments on the open one. The first passing run closes it with "Recovered". Each run's table is in its job summary.

Run it by hand: Actions → Synthetic check → Run workflow (it takes another `base_url`), or locally:

```bash
SYNTHETIC_BASE_URL=https://beta.fashionleadervote.com node scripts/synthetic-check.mjs
```

**Caveats.** Scheduled workflows only run from `master`, so the check starts once this is merged; until the merge deploys, `/api/health` is a 404 and the first run will alert. GitHub turns off scheduled workflows after 60 days without a commit to the repository: re-enable it on the Actions tab if that happens. Make sure the owner's GitHub notification settings email them for issues assigned to them.

## When an alert fires

1. **Home page fails:** check the Vercel deployment status and the latest deploy; roll back from the Vercel dashboard ([deploy.md](deploy.md) §6) if the last merge broke it.
2. **Health 503 / `supabase unreachable`:** check status.supabase.com and the project's dashboard (paused project, region incident).
3. **Share API not 404** (5xx or 200): look at `api/flp.ts` function logs in Vercel and the matching Sentry issue.
4. **A new Sentry issue:** the `route` and `mechanism` tags say where; the `release` tag is the commit.

**Owner:** the same named operator as [operations.md](operations.md#owner), not set yet.
