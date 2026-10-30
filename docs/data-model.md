# FLP data model and design API contract (F08 #143)

Schema: `supabase/migrations/20261030120000_flp_core_schema.sql`. Contract code: `src/lib/flp-api/contract.ts`. Database tests: `supabase/tests/flp_core_schema.test.sql`.

## Trust boundary

```
browser ──(session JWT)──▶ API (Vercel function)
                              │  1. verify session → owner id
                              │  2. parse request strictly (parse*Request)
                              │  3. prepareContent: validate v2, normalize, hash, size
                              ▼
                        Postgres flp_* functions (service_role only)
                              │  ownership, compare-and-swap, references, immutability
```

- **Clients** can only `SELECT` their own rows, enforced by RLS on every table. Every direct `INSERT`, `UPDATE` or `DELETE` is revoked, and the `flp_*` write functions are not executable by `anon` or `authenticated`.
- **The API** derives `p_owner_id` from the verified session. A request body containing an owner field is rejected as an unknown field. The API never trusts a hash or size sent by the client; it recomputes both.
- **The database** checks structure again: `schemaVersion` matches, the hash format is valid, and size is bounded. It also enforces ownership, sequencing and cross-design references, so a bug in the API cannot corrupt history.

## Tables

| Table | Purpose | Key rules |
| --- | --- | --- |
| `designs` | One owned design | `visibility` defaults to `private` (NOT NULL). `head_seq` → its own latest version. |
| `design_versions` | Immutable revisions | PK `(design_id, seq)`, unique `(owner_id, mutation_key)`. UPDATE and DELETE are rejected by a trigger. `kind` is `autosave`, `checkpoint`, `restore` or `import`. `restored_from_seq` must point at an earlier version of the same design. |
| `assets` | Uploaded images (S01 #170, S02 #171) | IDs match the canonical `asset_…` pattern but never `asset_lib_…`. `ready` requires the type, size, dimensions, hash and storage path. `rejected` requires a `rejection_reason`. Once ready or rejected a row never changes (trigger). See [Image uploads](#image-uploads). |
| `render_artifacts` | Derivatives of one version (P02 #180) | Composite FK to `(design_id, version_seq)`. One row per kind. |
| `publications` | One per design for its lifetime | Stable 16-hex `slug`. `published` ⇔ `version_seq` is set. When the design is deleted, a revoked tombstone keeps the slug so it is never reused. |

Owner consistency uses composite foreign keys to `designs (id, owner_id)`, so every child row has the same owner as its design. A reference to another design's version fails with a foreign-key error.

## Write functions

| Function | Behaviour |
| --- | --- |
| `flp_create_design(owner, mutation_key, content, hash, title?)` | Creates a private design and version 1 (`checkpoint`). The same key returns the same version. |
| `flp_save_version(owner, design, base_seq, key, content, hash, kind?, label?)` | Compare-and-swap on `head_seq`. A stale base returns a **conflict** with `headSeq`, never last-writer-wins. A retry with the same key returns the original version. |
| `flp_restore_version(owner, design, base_seq, key, from_seq)` | Appends a `restore` version that copies `from_seq`. History and the publication are unchanged. |
| `flp_publish_version(owner, design, seq, display_name?)` | Points the design's publication at one saved version. Republishing keeps the slug. |
| `flp_revoke_publication(owner, design)` | Sets `status = revoked` and clears the version pointer. |
| `flp_delete_design(owner, design)` | Revokes, then deletes the design, its versions and artifacts. The publication tombstone remains. |

A design that is missing and one owned by someone else raise the same `FL404`, so a response never reveals whether a design exists.

Not yet covered here: checking that render artifacts are ready before publishing (P02/P03), quotas and rate limits (S09 #178, Q02 #187), and anonymous public reads (P04 #182).

## Error envelope

```json
{ "error": { "code": "conflict", "message": "stale base version", "headSeq": 7 } }
```

| HTTP | `code` | Source |
| --- | --- | --- |
| 401 | `unauthenticated` | No verified session (`FL401`) |
| 404 | `not_found` | Missing **or not owned** (`FL404`); always "Design not found" |
| 409 | `conflict` | Stale `baseSeq` (includes `headSeq`), a mutation key reused on another design (`FL409`), or finalize before the upload arrived |
| 413 | `too_large` | Normalized content over 2,000,000 bytes (`prepareContent` or `FL413`) |
| 422 | `invalid` | Request or content validation failed, with `issues[].path` (or `FL422`). A rejected image adds `reason`. |
| 429 | `rate_limited` | Throttling (A01 #145, Q02 #187) |

Unknown database errors are logged and returned as a plain 500 with no details.

## Example requests

```http
POST /api/flp/designs
{ "mutationKey": "8b0f6f6e-3c1d-4f7a-9a52-2f1c5b7e9d10", "title": "Crest tee", "content": { "schemaVersion": 2, … } }
→ 201 { "designId": "…", "seq": 1, "kind": "checkpoint", "contentHash": "sha256:…", "restoredFromSeq": null, "createdAt": "…" }

POST /api/flp/designs/:id/versions
{ "baseSeq": 1, "mutationKey": "…", "kind": "autosave", "content": { … } }
→ 201 VersionResponse | 409 conflict { headSeq } | 413 | 422 { issues }

POST /api/flp/designs/:id/versions   (named checkpoint)
{ "baseSeq": 4, "mutationKey": "…", "kind": "checkpoint", "label": "Before sleeves", "content": { … } }
→ 201 VersionResponse | 422 { issues: [{ path: "$.label" }] }

GET /api/flp/designs/:id/versions?before=7&limit=20
→ 200 { "headSeq": 9, "publishedSeq": 3, "versions": [VersionSummary…], "nextBefore": 4 }

GET /api/flp/designs/:id/versions/:seq
→ 200 VersionSummary & { "designId", "content": { … } } | 404

POST /api/flp/designs/:id/restore
{ "baseSeq": 3, "mutationKey": "…", "fromSeq": 1 }
→ 201 VersionResponse (kind "restore", restoredFromSeq 1)

POST /api/flp/designs/:id/publication
{ "seq": 3, "displayName": "Ada" }
→ 200 { "slug": "3f9a1c22b7e04d11", "status": "published", "seq": 3 }

DELETE /api/flp/designs/:id/publication   → 204
DELETE /api/flp/designs/:id               → 204
```

The create, save, restore, list and read routes are live in `api/flp.ts` (`src/lib/flp-api/server.ts`), and the browser client is `src/lib/flp-api/client.ts`. Publication and delete routes come with P03 #181 and A07 #151. The legacy `api/designs.ts` KV board stays until F09 #144.

`GET /api/flp/designs` returns the owner's designs, newest first. `GET /api/flp/designs/:id` returns the design and its head version. Both read **as the user**, so RLS applies.

A reused `mutationKey` with the same content returns the original version. With **different** content it returns `409` ("mutation key reused with different content"); this is enforced by migration `20261031090000_flp_isolation.sql`.

## Image uploads

Migration `20261101090000_flp_asset_lifecycle.sql`, server `src/lib/flp-api/server.ts`, validator `src/lib/image-validate.ts`, browser helper `src/lib/flp-api/assets.ts` (`uploadAsset`, `assetReadUrl`).

```
POST /api/flp/assets
→ 201 { "assetId": "asset_<32 hex>", "status": "staged", "upload": { "url": "<signed upload URL>", "method": "PUT", "maxBytes": 10485760 } }

PUT <upload.url>   (browser → Supabase Storage, path <owner>/<assetId>/original)

POST /api/flp/assets/:id/finalize
→ 200 { "assetId", "status": "ready", "mimeType", "width", "height", "byteSize", "sha256", "readUrl", "readUrlExpiresIn": 600 }
→ 409 conflict (upload not received yet; retry) | 422 invalid { reason } | 404

GET /api/flp/assets/:id
→ 200 { "assetId", "status": "staged" } | { …, "status": "rejected", "reason" } | the ready body with a fresh readUrl
```

- **Reserve** inserts a `staged` row for the verified owner and signs a one-time upload to `<owner>/<assetId>/original` in the private `design-assets` bucket. Clients still cannot write to the bucket or the table.
- **Finalize** downloads the original with the service role and validates the **bytes**; the filename and declared MIME are ignored. Only PNG and baseline/progressive 8-bit JPEG (greyscale or YCbCr) are accepted, at most 10 MB and 4096×4096 from the IHDR/SOF header, checked before any decoding. PNG chunk CRCs are verified, and the image data is inflated as a stream and capped at the size the header implies. This stops decompression bombs and catches truncated or corrupt data. APNG (`acTL`/`fcTL`/`fdAT`), SVG, HTML, GIF, WebP and anything else are rejected.
- **Normalization** rewrites the container without re-encoding pixels. PNG keeps only `IHDR`, `PLTE`, `IDAT`, `IEND` and the colour chunks (`tRNS`, `gAMA`, `cHRM`, `sRGB`, `iCCP`, `sBIT`, `cICP`), so text, `eXIf` and time chunks are removed. JPEG drops every APPn and comment except the ICC profile (APP2) and Adobe colour transform (APP14). EXIF orientation is kept as a minimal one-tag APP1, and `width`/`height` are the display size after orientation. Bytes after IEND/EOI are dropped.
- The normalized bytes are stored at `<owner>/<assetId>/normalized`. The row becomes `ready` with the type, size, dimensions and SHA-256 of those bytes, and the original is deleted. If validation fails, the row becomes `rejected` with a `rejection_reason` (`unsupported_type`, `too_large`, `dimensions`, `animated`, `corrupt`) and the original is deleted. To retry, reserve a new asset.
- Finalize is **idempotent** and safe to race. Settled rows are immutable, the normalized object is deterministic, and the transition only applies while the row is `staged`. Repeating it returns the settled result.
- Another owner's asset, a missing one and an `asset_lib_…` id all return the same `404 Asset not found`. Rows are read as the user, so RLS applies.
- **Read URLs** are signed as the user for 600 seconds. Nothing in the bucket is public, and documents store only `assetId`.

**Saves.** Create and save refuse (`422`, one issue per use at `$.panels.<panel>.layers[<i>].assetId`) any image layer whose `assetId` is neither a shipped library graphic (`asset_lib_<slug>` listed in `src/lib/library-assets.ts`; no row needed) nor a `ready` asset of the caller. An `asset_lib_…` id naming no shipped graphic gets `not a library graphic`. This covers staged, rejected, unknown and other owners' ids. Restore copies an earlier version whose assets were checked when it was saved, and ready assets never change.

Not yet: reclaiming abandoned `staged` rows and originals, per-account upload quotas (S09 #178), and uploading legacy graphics (`asset_legacy_…` ids from `legacy-import.ts`) so that designs using them can be saved.

## Local development

```bash
supabase start
supabase db reset
supabase test db
FLP_INTEGRATION=1 pnpm test:integration
```

`pnpm test:integration` runs the API against the local stack with real user JWTs. It covers neutral 404s across owners, one-wins concurrent saves, idempotent retries, key reuse, the publication pointer, failed-write atomicity and attempts to bypass the API through REST. `history.integration.test.ts` covers paging, preview reads, cross-owner 404s, checkpoint names, restore metadata with an unchanged publication, and concurrent restores. `assets.integration.test.ts` adds reserve → upload → finalize → save, metadata stripping, cross-owner refusal, blocked saves for unfinalized or rejected assets, and retrying an interrupted upload. It needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env.local` (see `.env.example`).

`supabase start` needs Docker. `supabase db reset` applies the migrations to an empty database, and `supabase test db` runs the pgTAP suite. No hosted project is linked yet.


## My Studio and autosave (A05 #149, S04 #173)

**My Studio** (`src/routes/studio.tsx`):
- Lists the signed-in owner's designs.
- **Create a T-shirt** keeps one `mutationKey` per attempt, so a retry never creates a second design. A pending landing-page design carries over as the first content (`initialStudioDocument`).
- `/create?cloud=<id>` loads the head version strictly: validator, template check, then `loadCanonical`, which resets undo.

**Autosave** (`src/lib/save-controller.ts`, bound by `startCloudAutosave`):
- Saves 2 seconds after the last change, or on **Save now**.
- One request in flight, with newer revisions coalesced into one pending save. Each revision keeps its mutation key across retries.
- Only the exact revision sent is acknowledged. A `409` becomes **Changed elsewhere**, with **Open cloud version** or **Save mine as a copy**; nothing is overwritten.
- A design with images that aren't uploaded yet (`asset_legacy_…` placeholders) shows **Waiting for images**. Library graphics (`asset_lib_<slug>`, `src/lib/library-assets.ts`) need no upload, and finalized uploads save as they are.

**Uploading in the studio** (S01 #170, `src/lib/uploaded-images.ts`): in a cloud design, **Artwork** uploads the PNG or JPEG with `uploadAsset` and only then places an image layer with the ready `assetId` and the image's natural aspect. While it uploads the button reads **Uploading…**, and a failure is shown with nothing placed. The renderer draws only same-origin bytes, so the signed read URL is fetched once and handed to the engine as an object URL in `assetSources`. When a design is reopened, its uploaded ids are resolved the same way through `GET /assets/:id`. Documents store only the id. Copying or duplicating a placed upload keeps its id.

## Local recovery (S05 #174)

`src/lib/cloud-recovery.ts`, bound by `startCloudRecovery` in `src/lib/cloud-autosave.ts`.

- **What and where.** Every revision the cloud has not acknowledged is written to IndexedDB `flv-recovery` / `records` under `recovery/v1/<ownerId>/<designId>/<schemaVersion>/<baseSeq>`. A record holds the owner and design ids, schema version, cloud base, studio revision, time, and the canonical document. It holds no token, email or image bytes; uploaded images are referenced by `assetId`. There is one record per design, and a write on a new base removes the old one.
- **Clearing.** When the cloud acknowledges a revision, the record is cleared if nothing newer exists. Otherwise it is rewritten on the new head.
- **Opening a cloud design** reads the record for the signed-in owner and that design only:
  - same base: **Recover unsaved changes** (applied as a new revision, which autosave then saves) or **Discard**;
  - different base, another schema version, or invalid content: **Open cloud version** (discards the local copy) or **Save mine as a copy** (a new design). The cloud head is never overwritten;
  - content identical to the cloud: cleared silently.
  Nothing is written locally until the creator has chosen.
- **Failures.** If IndexedDB is unavailable, full, or a write fails, the studio shows a warning that unsaved changes exist only in this tab. A damaged record is reported and not loaded. The save label never says saved for a local copy; it reads e.g. **Offline — not saved · Kept on this device**.
- **Accounts.** Records are looked up only under the signed-in owner, so account B never lists or loads A's. Writes stop when the account changes. Records are not deleted on sign-out, so A can recover after a session expires or after signing in again on the same browser. They remain readable by anyone with access to that browser profile's storage, like any IndexedDB data.
- **Guest draft.** `flv:draft:current` is now used only while signed out (outside cloud designs), so signed-in work never lands in the shared guest slot.

**Account deletion (A07 #151):** deleting an auth user removes all of their designs, versions, publications and assets through the foreign-key cascades. The immutability trigger allows a version delete only inside `flp_delete_design` or as part of a cascade (`pg_trigger_depth() > 1`, migration `20261102090000_flp_cascade_deletes.sql`). A direct delete from a client, REST or SQL is still refused.

## Publishing and the public page (P01–P05, #179–#183)

Code: `src/lib/flp-api/publication.ts`, the studio panel `src/components/editor/CloudPublish.tsx`, and the public page `src/routes/s.$slug.tsx`.

| Route | Who | What |
| --- | --- | --- |
| `POST /api/flp/designs/:id/renders` | Owner | `{ seq, renders: [{ kind, data }] }` with exactly `view_front`, `view_three_quarter` and `view_back`, base64 JPEG or PNG. Each image is checked by `validateImage` and stored privately at `<owner>/<design>/v<seq>/<kind>.jpg`; the `render_artifacts` rows become `ready`. |
| `GET /api/flp/designs/:id/publication` | Owner | `{ publication: { slug, status, seq, displayName, rendersReadyForHead } \| null }` |
| `POST /api/flp/designs/:id/publication` | Owner | `{ seq, displayName? }`. Refused (`422`, one issue per missing view) unless all three views of that exact version are ready. Then `flp_publish_version` moves the pointer in one step. Republishing keeps the slug. |
| `DELETE /api/flp/designs/:id/publication` | Owner | `204`. The public page returns 404 immediately. |
| `GET /api/flp/public/:slug` | Anyone | Only `{ slug, title, displayName, seq, publishedAt, renders }`, where the render URLs are signed for **5 minutes**. Never the document, history or owner. `404` when unpublished, unknown or malformed. |

**Studio flow:**
- **Publish…** is available only when the design shows **Saved to cloud**.
- The review names the exact version and explains that anyone with the link can view it and copy its images.
- **Confirm** captures the three views of that exact version, refusing if the design changed meanwhile, then uploads them and publishes.
- The panel then shows "Published vX · draft vY", the link, **Copy link** and **Unpublish**.
- Without a cloud design, and wherever sign-in is required, the legacy guest board publish is not offered.

**Limits:**
- A render URL issued before unpublishing works until it expires, at most 5 minutes later. Images someone already downloaded can't be recalled (PRD §6.3).
- The public page is static views only; read-only 3D (PRD S3) would need the published texture.

## History, checkpoints and restore (S07 #176, S08 #177)

No migration: history reads `design_versions` as the user, and checkpoints and restores use the existing `flp_save_version` and `flp_restore_version`.

**List** `GET /api/flp/designs/:id/versions?before=<seq>&limit=<n>` (server `handleVersionHistory`, contract `parseVersionListQuery`):
- Newest first by `seq`, which is gap-free and immutable per design, so the order is the same on every device. `limit` defaults to 20, max 50. `before` is an exclusive `seq` cursor; `nextBefore` is the next one, or `null` once version 1 is listed. Bad `before`/`limit` → `422`.
- Each row is a `VersionSummary`: `seq`, `kind`, `label`, `contentHash`, `restoredFromSeq`, `createdAt`. No content. The page also returns `headSeq` (current) and `publishedSeq` (the owner's published version, or `null`).

**Read one** `GET /api/flp/designs/:id/versions/:seq` returns that version's content for a read-only preview. It is returned as stored and never becomes the draft.

Both read **as the user**. Another owner's design, a missing design and a malformed `:seq` all return the neutral `404 Design not found`. A missing `seq` on your own design returns `404 Version not found`.

**Named checkpoints** are `POST …/versions` with `kind: "checkpoint"` and a `label`. The label must be 1–60 characters with no control characters and no outer spaces (`checkpointLabelIssues`; the database re-checks the length). An autosave cannot carry a label. Checkpoints share the head's compare-and-swap chain: the save controller's `checkpoint()` waits for any autosave in flight, then saves against the acknowledged head, so autosave never races it.

**Restore** (`restoreFromHistory` in `src/lib/version-history.ts`):
1. If there is unsaved work and **Save current work first** is checked (the default), `settle()` saves it now. If that fails, nothing is restored.
2. `hold()` stops autosave and waits for any save in flight, so the base is the real head.
3. `POST …/restore` with that base. The server checks the base (`409` if it moved, including a concurrent restore) and that `fromSeq` is a version of this owned design. It appends a `restore` version with A's content and hash and `restoredFromSeq`. Earlier versions are unchanged.
4. Only after the acknowledgement is the draft reloaded from the head (`loadCloudDesign` → `loadCanonical`). Each load bumps `cloudLoad`, which starts a fresh autosave controller; the load itself is never autosaved. On failure, `release()` resumes autosave.

Restore never touches `publications`: the published look stays on its version until the owner republishes.

**Studio:** `HistoryPanel` (`src/components/editor/HistoryPanel.tsx`) appears on `/create?cloud=<id>`. It shows version, name, type, time and **Current**/**Published**/**From vN** markers, plus **Load more**, **Preview** (a read-only summary of base and layers per panel, outside the editor store), **Save checkpoint** and **Restore**.
