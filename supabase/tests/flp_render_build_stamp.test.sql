begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- The stamp columns exist, are optional and have no default (C2).
select has_column('public', 'render_artifacts', 'template_version', 'renders have a template version');
select has_column('public', 'render_artifacts', 'compiler_version', 'renders have a compiler version');
select col_is_null('public', 'render_artifacts', 'template_version', 'the template version is optional');
select col_is_null('public', 'render_artifacts', 'compiler_version', 'the compiler version is optional');
select col_hasnt_default('public', 'render_artifacts', 'template_version', 'no template version is assumed');
select col_hasnt_default('public', 'render_artifacts', 'compiler_version', 'no compiler version is assumed');

insert into auth.users (id, email) values
  ('cccccccc-8888-4888-8888-888888888888', 'stamp-owner@example.test');

create temp table ids (name text primary key, id uuid);

insert into ids
select 'design', design_id from public.flp_create_design(
  'cccccccc-8888-4888-8888-888888888888', gen_random_uuid(),
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Stamped'
);

-- The previous release writes rows without the new columns.
select lives_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
       values (%L, 1, 'cccccccc-8888-4888-8888-888888888888', 'view_front', 'ready', 'p/front.jpg', %L) $$,
    (select id from ids), repeat('b', 64)
  ),
  'a render without a stamp is still stored (previous release)'
);

select lives_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, status, storage_path, sha256, template_version, compiler_version)
       values (%L, 1, 'cccccccc-8888-4888-8888-888888888888', 'view_back', 'ready', 'p/back.jpg', %L, 2, 1) $$,
    (select id from ids), repeat('c', 64)
  ),
  'a stamped render is stored'
);

select results_eq(
  format(
    $$ select kind, template_version, compiler_version from public.render_artifacts
       where design_id = %L order by kind $$,
    (select id from ids)
  ),
  $$ values ('view_back'::text, 2, 1), ('view_front'::text, null::integer, null::integer) $$,
  'each render keeps its own stamp, and an unstamped one reads as null'
);

select throws_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, template_version)
       values (%L, 1, 'cccccccc-8888-4888-8888-888888888888', 'view_left', 0) $$,
    (select id from ids)
  ),
  '23514', null,
  'a template version below 1 is refused'
);

select throws_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, compiler_version)
       values (%L, 1, 'cccccccc-8888-4888-8888-888888888888', 'view_right', -1) $$,
    (select id from ids)
  ),
  '23514', null,
  'a compiler version below 1 is refused'
);

select * from finish();
rollback;
