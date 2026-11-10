# Browser tests: projects and local runs (Q2)

`pnpm e2e` runs the Playwright suite in `e2e/` against the local Supabase stack. Export the stack's values first (as CI does):

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY|MAILPIT_URL)=')"
export SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_SECRET_KEY="$SECRET_KEY"
export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" MAILPIT_URL="$MAILPIT_URL"
```

Set `E2E_PORT` if another checkout already uses 5199.

## Which server

| Flag | Server | Use |
| --- | --- | --- |
| none | `pnpm dev` | Day-to-day: fast start, the default locally |
| `E2E_SERVER=preview` | `pnpm build`, then `pnpm preview` | What CI runs: the production bundle under the production CSP. A dev server also starts on `E2E_PORT + 1` for the tests tagged `@dev-server` |
| `E2E_BASE_URL=…` | none | A deployed environment (see [deploy.md](deploy.md)) |

Tests that import `/src/...` inside the page only work on the dev server. Tag them `{ tag: '@dev-server' }`; with `E2E_SERVER=preview` they run in the `dev-modules` project instead of `chromium`.

## Projects

| Project | What runs | Device |
| --- | --- | --- |
| `chromium` | Everything except `touch.spec.ts` | Desktop Chrome, 1280×800 |
| `chromium-touch` | `touch.spec.ts`, `smoke.spec.ts` | Pixel 7: touch, coarse pointer, phone width |
| `ipad` | `touch.spec.ts`, `smoke.spec.ts` | Chromium at iPad Pro 11 size with touch |
| `dev-modules` | `@dev-server` tests (preview runs only) | Desktop Chrome |
| `webkit-smoke` | `smoke.spec.ts` (only with `E2E_WEBKIT=1`) | Desktop Safari engine |

Touch input goes through CDP (`touchStroke` in `e2e/helpers.ts`), so the browser makes real touch and pointer events. It needs Chromium.

```bash
pnpm e2e --project=chromium-touch --project=ipad
```

```bash
E2E_SERVER=preview pnpm e2e
```

```bash
pnpm exec playwright install webkit && E2E_WEBKIT=1 pnpm e2e --project=webkit-smoke
```

In CI, WebKit smoke is its own job and never blocks a merge: a failure is a warning on a passing job. Make it blocking once it has passed on Linux for a while (WebGL2 in WebKit there is unproven).

## Visual baselines

`e2e/visual.spec.ts` compares the studio chrome and the share page with baselines in `e2e/__screenshots__/<platform>/`. Every `<canvas>` (3D view, paint panels), the account email and the publish date are masked. CI compares the `linux` baselines; a Mac run uses `darwin` ones.

After a deliberate UI change, update the Mac baselines locally:

```bash
pnpm e2e --project=chromium visual.spec --update-snapshots
```

Linux baselines come from CI. Delete the old `e2e/__screenshots__/linux/…` file and push. The run writes a new one, fails the "Visual baselines are committed" step, and uploads it in the `playwright-report-<shard>` artifact under `e2e/__screenshots__/`. Check the picture, commit it and push again.
