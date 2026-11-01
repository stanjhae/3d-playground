<!-- Sample record from `pnpm hosted:check --allow-local` against `pnpm build && pnpm preview` and the local Supabase stack (1 Nov 2026). The hosted run writes docs/evidence/hosted-<date>.md in this shape. -->

# Hosted check: PASS (with skips)

> **Local run** (`--allow-local`): not hosted evidence. It shows the kit works; the hosted record comes from staging.

| | |
| --- | --- |
| Target | http://localhost:5183 (local) |
| Supabase | http://127.0.0.1:54321 |
| App | `0.9.0-rc.1` at `e67e6c3` (uncommitted changes) |
| Run | 2026-11-01T19:20:51.679Z |
| Result | 11 passed, 0 failed, 1 skipped |

| Check | Re-verifies | Result |
| --- | --- | --- |
| `security-headers` | #187 | PASS |
| `csp-supabase` | #187 | PASS |
| `bundle-secrets` | #186, #188 | PASS |
| `anonymous-routes` | #188, #148, #187, #183 | PASS |
| `events-allowlist` | #193, #187 | PASS |
| `auth-providers` | #145, #147 | PASS |
| `email-code-config` | #145, #146 | SKIP: a local stack has no Management API; its auth settings are supabase/config.toml |
| `owner-isolation` | #148, #188, #149, #170 | PASS |
| `render-hash` | #180, #179, #182 | PASS |
| `public-no-store` | #183, #182 | PASS |
| `unpublish-404` | #183, #181 | PASS |
| `e2e` | #189, #146, #149, #152, #172, #174, #175, #176, #177, #181, #187, #190 | PASS |

## Details

### `security-headers`: PASS (0.1 s)

Every page and API route sends the security headers from src/lib/security-headers.ts. Re-verifies #187.
- `/`: CSP, nosniff, referrer, frame and permissions policies match
- `/sign-in`: CSP, nosniff, referrer, frame and permissions policies match
- `/s/0000000000000000`: CSP, nosniff, referrer, frame and permissions policies match
- `/api/flp/public/0000000000000000`: CSP, nosniff, referrer, frame and permissions policies match

### `csp-supabase`: PASS (0.0 s)

The CSP's connect-src and img-src reach this Supabase project, and the page narrows them to it. Re-verifies #187.
- header `connect-src`: 'self' blob: http://127.0.0.1:54321
- `<meta>` policy: img-src 'self' data: blob: http://127.0.0.1:54321; connect-src 'self' blob: http://127.0.0.1:54321

### `bundle-secrets`: PASS (0.1 s)

The served entry and preloaded scripts carry no server secret. Re-verifies #186, #188.
- 8 scripts scanned (the full `dist/` scan is `build-secrets.test.ts` in CI)

### `anonymous-routes`: PASS (0.1 s)

Signed out: every /api/flp route is 401 or 404, and other origins get 403 (route table from #251). Re-verifies #188, #148, #187, #183.


| Route | Caller | Answer |
| --- | --- | --- |
| `GET /designs` | none | 401 unauthenticated |
| `POST /designs` | none | 401 unauthenticated |
| `GET /designs/:id` | none | 401 unauthenticated |
| `PATCH /designs/:id` | none | 401 unauthenticated |
| `DELETE /designs/:id` | none | 401 unauthenticated |
| `GET /designs/:id/versions` | none | 401 unauthenticated |
| `POST /designs/:id/versions` | none | 401 unauthenticated |
| `GET /designs/:id/versions/1` | none | 401 unauthenticated |
| `POST /designs/:id/restore` | none | 401 unauthenticated |
| `POST /designs/:id/renders` | none | 401 unauthenticated |
| `GET /designs/:id/publication` | none | 401 unauthenticated |
| `POST /designs/:id/publication` | none | 401 unauthenticated |
| `DELETE /designs/:id/publication` | none | 401 unauthenticated |
| `POST /assets` | none | 401 unauthenticated |
| `GET /assets/:asset` | none | 401 unauthenticated |
| `POST /assets/:asset/finalize` | none | 401 unauthenticated |
| `GET /profile` | none | 401 unauthenticated |
| `POST /profile` | none | 401 unauthenticated |
| `GET /public/:slug` | none | 404, no-store |
| `GET /public/:slug/image?kind=view_front` | none | 404, no-store |
| `POST /designs` | Origin https://example.com | 403 cross_origin |
| `PATCH /designs/:id` | Origin https://example.com | 403 cross_origin |
| `DELETE /designs/:id` | Origin https://example.com | 403 cross_origin |
| `POST /designs/:id/versions` | Origin https://example.com | 403 cross_origin |
| `POST /designs/:id/restore` | Origin https://example.com | 403 cross_origin |
| `POST /designs/:id/renders` | Origin https://example.com | 403 cross_origin |
| `POST /designs/:id/publication` | Origin https://example.com | 403 cross_origin |
| `DELETE /designs/:id/publication` | Origin https://example.com | 403 cross_origin |
| `POST /assets` | Origin https://example.com | 403 cross_origin |
| `POST /assets/:asset/finalize` | Origin https://example.com | 403 cross_origin |
| `POST /profile` | Origin https://example.com | 403 cross_origin |

### `events-allowlist`: PASS (0.0 s)

/api/events refuses unknown events and extra fields. Re-verifies #193, #187.
- an unknown name: 400
- a known name with an extra field: 400
- a timing with an unknown bucket: 400
- a non-JSON body: 400

### `auth-providers`: PASS (0.0 s)

Supabase Auth: email only, confirmation on, sign-up open for first sign-in. Re-verifies #145, #147.
- external: email only; disable_signup false; mailer_autoconfirm true (local stack, not checked)

### `email-code-config`: SKIP (0.0 s)

Email-code config: redirect allowlist, Site URL, 6-digit code, 600 s expiry, 60 s resend, custom SMTP, code-only templates. Re-verifies #145, #146.

**Skipped:** a local stack has no Management API; its auth settings are supabase/config.toml


### `owner-isolation`: PASS (1.5 s)

Another account gets 404 on every owner route, and the owner's design, publication and asset don't move. Re-verifies #148, #188, #149, #170.


| Route | Caller | Answer |
| --- | --- | --- |
| `GET /designs/:id` | another account | 404, nothing changed |
| `PATCH /designs/:id` | another account | 404, nothing changed |
| `DELETE /designs/:id` | another account | 404, nothing changed |
| `GET /designs/:id/versions` | another account | 404, nothing changed |
| `POST /designs/:id/versions` | another account | 404, nothing changed |
| `GET /designs/:id/versions/1` | another account | 404, nothing changed |
| `POST /designs/:id/restore` | another account | 404, nothing changed |
| `POST /designs/:id/renders` | another account | 404, nothing changed |
| `GET /designs/:id/publication` | another account | 404, nothing changed |
| `POST /designs/:id/publication` | another account | 404, nothing changed |
| `DELETE /designs/:id/publication` | another account | 404, nothing changed |
| `GET /assets/:asset` | another account | 404, nothing changed |
| `POST /assets/:asset/finalize` | another account | 404, nothing changed |

### `render-hash`: PASS (0.1 s)

Every published view is served through the image route only with the hash recorded at upload. Re-verifies #180, #179, #182.
- view_front: 200, sha256 01b7fdcf4d12… matches render_artifacts
- view_three_quarter: 200, sha256 01b7fdcf4d12… matches render_artifacts
- view_back: 200, sha256 01b7fdcf4d12… matches render_artifacts
- view_left: 200, sha256 01b7fdcf4d12… matches render_artifacts
- view_right: 200, sha256 01b7fdcf4d12… matches render_artifacts
- view_back replaced in storage: 404

### `public-no-store`: PASS (0.0 s)

Public JSON, images and the share page are no-store. Re-verifies #183, #182.
- `/api/flp/public/:slug`: 200, no-store
- `/api/flp/public/:slug/image`: 200, no-store
- `/api/flp/public/:slug/image?view=view_front&seq=1`: 200, no-store
- `/s/:slug`: 200, no-store

### `unpublish-404`: PASS (0.1 s)

Unpublishing takes the page, payload and every image down at once. Re-verifies #183, #181.
- payload and 6 image URLs: 404, no-store
- share page: no title or image after unpublishing

### `e2e`: PASS (370.4 s)

`pnpm e2e` against the deployment (journey, isolation, security, failure matrix, …). Re-verifies #189, #146, #149, #152, #172, #174, #175, #176, #177, #181, #187, #190.
- `pnpm e2e`: 5 skipped, 24 passed (6.2m)

## e2e output (last 40 lines)

```
$ playwright test

Running 29 tests using 1 worker

  ✓   1 [chromium] › e2e/accessibility.spec.ts:32:1 › sign-in, My Studio, studio, shared page and privacy have no serious violations (14.8s)
  ✓   2 [chromium] › e2e/accessibility.spec.ts:66:1 › long names and messages never push the page sideways (#163) (4.5s)
  ✓   3 [chromium] › e2e/failures.spec.ts:172:1 › offline mid-save keeps the work and saves it once back online (18.6s)
  ✓   4 [chromium] › e2e/failures.spec.ts:199:1 › 429 pauses saving and retries the same save after Retry-After (13.2s)
  ✓   5 [chromium] › e2e/failures.spec.ts:217:1 › 500s on save show the failure, keep the work and retry the same save by themselves (22.2s)
  ✓   6 [chromium] › e2e/failures.spec.ts:237:1 › a reload during a slow save offers the local copy instead of losing it (15.3s)
  ✓   7 [chromium] › e2e/failures.spec.ts:264:1 › a reload after the server took a slow save shows it saved, with no stale prompt (10.7s)
  ✓   8 [chromium] › e2e/failures.spec.ts:289:1 › a stale save from a second tab shows "Changed elsewhere"; opening the cloud version keeps both edits reachable (17.6s)
  ✓   9 [chromium] › e2e/failures.spec.ts:320:1 › a save in one tab never drops another tab’s unsaved local copy (26.7s)
  ✓  10 [chromium] › e2e/failures.spec.ts:355:1 › "Save mine as a copy" makes exactly one copy despite a lost answer and a double click (15.9s)
  ✓  11 [chromium] › e2e/failures.spec.ts:412:1 › a full local store shows the storage warning and still saves to the cloud (11.0s)
  ✓  12 [chromium] › e2e/failures.spec.ts:441:1 › a session that expires mid-edit sends the creator to sign-in and offers the local copy after (1.1m)
  ✓  13 [chromium] › e2e/isolation.spec.ts:13:1 › another account can neither open a design nor see its unsaved local copy (9.2s)
  ✓  14 [chromium] › e2e/journey.spec.ts:27:1 › create → edit → save → publish → view signed out → unpublish → delete (21.7s)
  -  15 [chromium] › e2e/landing-import.spec.ts:45:1 › preview, then create: the landing image is uploaded and saved by its real id
  -  16 [chromium] › e2e/landing-import.spec.ts:75:1 › a failed image upload stops before saving, and the design can be created without it
  -  17 [chromium] › e2e/measure.spec.ts:21:1 › save acknowledgement and public first image
  ✓  18 [chromium] › e2e/panel-clear.spec.ts:33:1 › Cancel leaves the document byte-identical; Clear then Undo restores identical marks (17.0s)
publish review: 0/5 failed
  ✓  19 [chromium] › e2e/publish-review.spec.ts:34:1 › "Publish…" opens the review (5×) (28.2s)
  ✓  20 [chromium] › e2e/publish-review.spec.ts:55:1 › "Publish…" opens the review when the 3D preview starts mid-click (14.1s)
  ✓  21 [chromium] › e2e/render-idle.spec.ts:31:1 › an idle studio requests no frames, and an edit still redraws (11.1s)
  ✓  22 [chromium] › e2e/security.spec.ts:18:1 › every page gets the security headers (80ms)
  ✓  23 [chromium] › e2e/security.spec.ts:31:1 › the policy blocks injected script, and the watcher sees it (112ms)
  ✓  24 [chromium] › e2e/security.spec.ts:43:1 › signed-out pages load with no CSP violations (11.6s)
  ✓  25 [chromium] › e2e/security.spec.ts:56:1 › a published title and public name show as text (164ms)
  ✓  26 [chromium] › e2e/security.spec.ts:86:1 › a design title and words show as text in the editor and My Studio (6.2s)
  ✓  27 [chromium] › e2e/transform-fields.spec.ts:18:1 › typed, stepped and dragged placement are one undo step each (9.5s)
  -  28 [chromium] › e2e/visual-matrix.spec.ts:157:1 › visual and browser matrix
  -  29 [chromium] › e2e/demo-recording.spec.ts:28:1 › demo fallback recording

  5 skipped
  24 passed (6.2m)
```
