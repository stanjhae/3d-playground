# Operations: usage counts, timings and alerts (Q08 #193)

What the deployed studio reports about itself, how to read it, and when someone should look. Nothing here identifies a person or a design.

## What is collected

Every report is a `POST /api/events` with a JSON body of a known **name**, plus a **bucket** for timings. The handler (`src/lib/waitlist-handlers.ts` → `parseEventBody` in `src/lib/assumption-events.ts`) refuses anything else with a 400: unknown names, unknown buckets, a bucket on a count, or any extra field. So no ID, email, design content or exact duration can be stored. The endpoint is also limited to 40 requests a minute per client address.

Counts are kept as one JSON object of totals under the KV key `flv:assumptions` (with `KV_REST_API_URL` / `KV_REST_API_TOKEN` set, see [deploy.md](deploy.md) §3). Without KV they live in the function's memory only and are lost on each cold start.

### Journey counts

One per event: `viewed_demo`, `voted`, `started_drawing`, `published`, `waitlisted`, `signed_in`, `design_created`, `design_saved`, `publish_succeeded`, `publish_failed`, `recovery_offered`, `recovery_used`. `design_saved` counts at most once per design per page load.

### Timings

Two timings, each stored as `name:bucket`:

| Name | From | To |
| --- | --- | --- |
| `save_ack` | A save request (autosave or checkpoint) is sent (`src/lib/cloud-autosave.ts`) | The cloud acknowledges it. Failed saves aren't timed; they show up as the editor's offline or failed states |
| `edit_render` | The first editor change (a new document revision) since the last frame | The next 3D frame the studio draws (`src/components/scene/EditRenderProbe.tsx`). Waits while the tab is hidden are dropped |

Buckets: `lt100`, `lt250`, `lt500`, `lt1000`, `lt2500` (under that many ms) and `gte2500`.

**Sampling.** Each browser sends at most one sample per timing every 30 s, and at most 20 per timing per page load (`TIMING_SAMPLE`). The kept sample is simply the first after each gap, so it isn't biased toward fast or slow ones. A tab left open all day sends at most 40 timing reports.

## Reading the counts

Read the totals with the KV REST API (the token is the server-only one; don't paste it anywhere shared):

```bash
curl -s -H "Authorization: Bearer $KV_REST_API_TOKEN" "$KV_REST_API_URL/get/flv:assumptions"
```

The totals only grow, so compare two reads (for example a day apart) and work on the difference.

**Percentiles from buckets.** For one timing, add up its buckets in order. The p95 lies in the first bucket where the running total reaches 95% of all samples; report it as "under that bucket's bound" (or "2.5 s or more" for `gte2500`). For example, with `save_ack` deltas of `lt100` 40, `lt250` 120, `lt500` 30, `lt1000` 6, `lt2500` 3, `gte2500` 1 (200 samples), 95% is 190 and the running total reaches it at `lt500` (190), so save acknowledgement p95 is under 500 ms.

Ignore a window with fewer than about 50 samples for a timing; the buckets are too coarse to say much below that.

Crashes, the health endpoint and the scheduled check of beta are in [alerts.md](alerts.md).

## Proposed alert thresholds

To be checked daily during the alpha, on the difference since the last check:

| Signal | Alert when | First look at |
| --- | --- | --- |
| Save acknowledgement | p95 at or above 1 s (more than 5% of `save_ack` in `lt2500` or `gte2500`) | Supabase project health and region, `api/flp.ts` function duration in Vercel |
| Save acknowledgement, severe | Any day with more than 1% in `gte2500` | As above; also the rate limits (Q02 #187) |
| Edit to render | p95 above 500 ms (more than 5% of `edit_render` in `lt1000` or slower) | A recent change to the garment, textures or `StudioStage`; the e2e render timings |
| Publishing | `publish_failed` above 5% of `publish_succeeded + publish_failed` | Function logs for `api/flp.ts` publish routes |
| Recovery | `recovery_offered` rising faster than `design_saved` | Save failures; the per-tab recovery (#255) |

The buckets make these thresholds exact bucket bounds (500 ms, 1 s), which is why the bounds were picked.

## Owner

**Named operator: owner decision, not set yet.** The person who checks the counts and acts on an alert, and their backup, are to be named by the project owner before the hosted launch (#186). Until then no one is on call for these signals.
