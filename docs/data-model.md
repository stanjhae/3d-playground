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
| `assets` | Uploaded originals (S01 #170) | IDs match the canonical `asset_…` pattern. `ready` requires the type, size, dimensions, hash and storage path. |
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

Not yet covered here: checking that render artifacts are ready before publishing (P02/P03), asset upload (S01/S02), quotas and rate limits (S09 #178, Q02 #187), and anonymous public reads (P04 #182).

## Error envelope

```json
{ "error": { "code": "conflict", "message": "stale base version", "headSeq": 7 } }
```

| HTTP | `code` | Source |
| --- | --- | --- |
| 401 | `unauthenticated` | No verified session (`FL401`) |
| 404 | `not_found` | Missing **or not owned** (`FL404`); always "Design not found" |
| 409 | `conflict` | Stale `baseSeq` (includes `headSeq`) or a mutation key reused on another design (`FL409`) |
| 413 | `too_large` | Normalized content over 2,000,000 bytes (`prepareContent` or `FL413`) |
| 422 | `invalid` | Request or content validation failed, with `issues[].path` (or `FL422`) |
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

Original uploads go in the private `design-assets` bucket under `<owner_id>/…`. Owners can read their own objects, and nobody can write directly; uploads will use server-issued signed URLs (S01 #170).

## Local development

```bash
supabase start
supabase db reset
supabase test db
FLP_INTEGRATION=1 pnpm test:integration
```

`pnpm test:integration` runs the API against the local stack with real user JWTs. It covers neutral 404s across owners, one-wins concurrent saves, idempotent retries, key reuse, the publication pointer, failed-write atomicity and attempts to bypass the API through REST. It needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` in `.env.local` (see `.env.example`).

`supabase start` needs Docker. `supabase db reset` applies the migrations to an empty database, and `supabase test db` runs the pgTAP suite. No hosted project is linked yet.
