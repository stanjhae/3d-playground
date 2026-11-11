-- Every garment is a template now (real models everywhere), so a view's
-- template version alone no longer says what drew it: tee @4 and hoodie @1
-- are different garments. `template_id` names the template; with
-- `template_version` and `compiler_version` it pins exactly what drew a view.
--
-- Additive and readable by the previous release, like C2: nullable with no
-- default, never selected or written by the old code, no backfill. Rows
-- stamped before this migration drew on the tee (`tee-crew-short`). That the
-- id matches the saved version's own template is checked in the API
-- (uploadRenders), which reads the version.

alter table public.render_artifacts
  add column template_id text
    check (template_id is null or template_id ~ '^[a-z0-9][a-z0-9-]{0,63}$');

comment on column public.render_artifacts.template_id is
  'Garment template the view was drawn on (template-manifest.ts); null for views stored before it was recorded.';
