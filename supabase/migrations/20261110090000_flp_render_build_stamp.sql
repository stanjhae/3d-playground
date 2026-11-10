-- FLP C2: each render records what drew it.
--
-- `template_version` is the garment template the scene built and
-- `compiler_version` the atlas compiler (`ATLAS_COMPILER_VERSION` in
-- src/lib/atlas-status.ts) when the view was captured. With these, a later
-- template or compiler change can tell which stored views it would draw
-- differently, without guessing from dates.
--
-- Additive and readable by the previous release: both columns are nullable
-- with no default, the old code neither selects nor writes them, and rows
-- written before this migration simply have no stamp (no backfill). Keeping
-- a version's views write-once is enforced in the API (uploadRenders), not
-- here, so the previous release's re-upload still works during a rollback.

alter table public.render_artifacts
  add column template_version integer
    check (template_version is null or template_version between 1 and 1000),
  add column compiler_version integer
    check (compiler_version is null or compiler_version between 1 and 1000);

comment on column public.render_artifacts.template_version is
  'Garment template version the view was drawn on; null for views stored before C2.';
comment on column public.render_artifacts.compiler_version is
  'Atlas compiler version (ATLAS_COMPILER_VERSION) that drew the view; null for views stored before C2.';
