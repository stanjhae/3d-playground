# Product analytics (PostHog)

To learn which features people use and where they struggle, the site sends anonymous events to **PostHog EU cloud**. The internal admin (`apps/admin`) links to the PostHog dashboards. The anonymous totals in `/api/events` (KV `flv:assumptions`, [operations.md](operations.md)) keep working exactly as before.

## Privacy rules (what the code enforces)

| Rule | Where |
| --- | --- |
| Off unless `VITE_POSTHOG_KEY` is set: PostHog isn't even downloaded, and every call is a no-op | `analyticsConfig`, `startAnalytics` in `apps/web/src/lib/analytics.ts` |
| Off when the browser sends Do Not Track or Global Privacy Control | `prefersNoTracking`, and `respect_dnt: true` |
| Cookieless: `persistence: 'memory'`. Each page load is a new visitor with a random ID held in memory only | `posthogOptions` |
| Anonymous: `person_profiles: 'never'`, `identify` is never called, `$set` / `$set_once` are stripped | `posthogOptions`, `scrubEvent` |
| Properties are an allowlist of names (`tool`, `step`, `garment`, `fabric`, …) with short id-like values only. An email, a title, a word, a colour or anything with a space or `@` is dropped | `cleanProperties` |
| URLs are reduced to their route: `/s/:slug`, `/look/:lookId`, `/u/:handle`; no query or hash. Referrers and IP are dropped | `routeOfPath`, `scrubEvent` (`before_send`) |
| Autocapture keeps the clicked element's path, with no text and no attributes (`mask_all_text`, `mask_all_element_attributes`) | `posthogOptions` |
| Replay masks every input and all text (`maskAllInputs`, `maskTextSelector: '*'`); canvas (the 3D view and drawing) isn't recorded; no network headers or bodies | `posthogOptions` |
| No external scripts: the recorder is bundled, `disable_external_dependency_loading` | `loadPosthog` |
| Only `https://eu.i.posthog.com` and `https://eu-assets.i.posthog.com` are allowed by the CSP | `POSTHOG_SOURCES` in `security-headers.ts` |

Unit tests: `analytics.test.ts` (the no-key no-op, the `track()` fan-out, the PII filters and options) and `studio-analytics.test.ts`.

## How events are sent

Every event goes through `track({ name, properties })` in `apps/web/src/lib/assumption-events.ts`. It sends the event to PostHog and, when the name is one of the assumption counts (`ASSUMPTION_EVENTS`), also to `/api/events` by name only, as before. Timings and Web Vitals also go to PostHog as `timing_save_ack` / `timing_edit_render` (`bucket`) and `vital_lcp` / `vital_inp` / `vital_cls` (`rating`).

Studio events come from one wrapper over the editor store's actions (`installStudioAnalytics`, `STUDIO_ACTION_EVENTS` in `studio-analytics.ts`), so a new button that calls an existing action is tracked with no extra code. Busy actions (drags, sliders, strokes, colour pickers) are throttled to one event every 1–5 s.

## Events

| Area | Events (properties) |
| --- | --- |
| Pages | `$pageview`, `$pageleave` (`route`), `$autocapture` clicks |
| Create | `design_created`, `signed_in`, `recovery_offered`, `recovery_used` |
| Steps | `step_viewed` (`step`: select, color, design, share), `view_changed` (`view`), `camera_preset` (`preset`), `mode_changed` |
| Garment | `garment_picked` (`garment`), `neck_picked` (`neck`), `shape_edited`, `avatar_picked`, `avatar_measured` |
| Colour and fabric | `fabric_applied` (`fabric`), `colour_applied`, `pattern_picked` (`pattern`), `finish_picked` (`finish`), `surface_picked` (`surface`), `section_fill_added`, `section_fill_edited` |
| Design tools | `tool_opened` (`tool`: draw, text, graphics, upload), `paint_tool_picked` (`tool`), `paint_colour_changed`, `stroke_drawn`, `ink_cleared`, `text_added`, `text_face_picked` (`face`), `graphic_added`, `image_uploaded`, `print_added` |
| Layers | `layer_edited`, `layer_transformed`, `layer_removed`, `layer_duplicated`, `layer_mirrored`, `layer_copied`, `layer_pasted`, `layer_reordered`, `layer_moved_panel` (`panel`), `layer_visibility` |
| History | `undo`, `redo`, `version_restored`, `template_upgraded` |
| Pattern (beta) | `pattern_beta_enabled`, `pattern_beta_disabled`, `pattern_edit` (`action`: point_added, point_moved, cutout_added, slit_opened, preset, reset, quick_edit, …), `pattern_edit_refused` (`action`) |
| AI suggestion | `ai_assist_opened`, `ai_assist_requested` (`sketch`, `words`: booleans), `ai_assist_result` (`result`: suggested, no_changes, unsewable, failed, unreadable), `ai_assist_applied`, `ai_assist_discarded`, `ai_assist_closed` |
| Save | `design_saved` (once per design per load), `save_failed`, `save_retried`, `timing_save_ack` |
| Publish and share | `published`, `publish_succeeded`, `publish_failed`, `share_link_copied` (`source`: studio, share_page, look), `image_downloaded` (`kind`) |
| Vote | `vote_cast`, `vote_retracted`, `compare_chosen`, `viewed_demo` |

### Friction signals

| Event | Meaning |
| --- | --- |
| `undo_burst` (`count`) | 3 or more undos within 4 s: something didn't do what the person expected |
| `tool_abandoned` (`tool`) | A design tool (or `ai_assist`) opened for at least 1.5 s and left with nothing changed |
| `step_idle` (`step`, `seconds`) | 60 s with no input or change on a step, once per step visit |
| `error_shown` (`route`) | An error message (`role="alert"`) appeared; the message itself isn't sent |
| `$rageclick`, `$dead_click` | PostHog's own: repeated clicks on one spot, clicks that changed nothing |
| `pattern_edit_refused` | A pattern edit that couldn't be sewn |

## Suggested funnels and insights

Build these in PostHog (the admin links to them). Each visitor is one page load, so funnels are best read **within a session** (conversion window: 1 hour).

1. **Core loop:** `design_created` → `design_saved` → `publish_succeeded` → `share_link_copied`.
2. **Voting:** `$pageview` where `route = /s/:slug` → `vote_cast`.
3. **Studio steps:** `step_viewed` step = select → color → design → share. The drop-off between steps is where people get lost.
4. **Tool success:** `tool_opened` broken down by `tool`, against `tool_abandoned` by `tool`. A high abandon ratio is a confusing tool.
5. **Pattern (beta):** `pattern_beta_enabled` → `pattern_edit` → `design_saved`; plus `pattern_edit_refused` by `action`.
6. **AI suggestion:** `ai_assist_opened` → `ai_assist_requested` → `ai_assist_result` = suggested → `ai_assist_applied`.
7. **Friction board:** trends of `undo_burst`, `step_idle` by `step`, `error_shown` by `route`, `$rageclick` by `route`, `save_failed`. Open the replays of sessions with these events.

## Setting it up

The owner creates the PostHog project (EU cloud) and sets the key in Vercel; see [deploy.md](deploy.md) section 3. In the PostHog project settings also turn on **Discard client IP data**, and turn on **Record user sessions** for replay. No other setting is needed.
