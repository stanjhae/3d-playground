begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select has_column('public', 'render_artifacts', 'template_id', 'renders name their template');
select col_is_null('public', 'render_artifacts', 'template_id', 'the template id is optional');
select col_hasnt_default('public', 'render_artifacts', 'template_id', 'no template is assumed');

insert into auth.users (id, email) values
  ('dddddddd-8888-4888-8888-888888888888', 'template-owner@example.test');

create temp table ids (name text primary key, id uuid);

insert into ids
select 'design', design_id from public.flp_create_design(
  'dddddddd-8888-4888-8888-888888888888', gen_random_uuid(),
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Hoodie'
);

select lives_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, status, storage_path, sha256, template_id, template_version, compiler_version)
       values (%L, 1, 'dddddddd-8888-4888-8888-888888888888', 'view_front', 'ready', 'p/front.jpg', %L, 'hoodie', 1, 1) $$,
    (select id from ids), repeat('b', 64)
  ),
  'a view stamped with its template is stored'
);

select lives_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
       values (%L, 1, 'dddddddd-8888-4888-8888-888888888888', 'view_back', 'ready', 'p/back.jpg', %L) $$,
    (select id from ids), repeat('c', 64)
  ),
  'a view without a template id is still stored (previous release)'
);

select throws_ok(
  format(
    $$ insert into public.render_artifacts
         (design_id, version_seq, owner_id, kind, template_id)
       values (%L, 1, 'dddddddd-8888-4888-8888-888888888888', 'view_left', 'Not A Template!') $$,
    (select id from ids)
  ),
  '23514',
  null,
  'a malformed template id is refused'
);

select * from finish();
rollback;
