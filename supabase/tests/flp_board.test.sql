begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('dddddddd-9999-4999-8999-999999999991', 'board-owner@example.test'),
  ('dddddddd-9999-4999-8999-999999999992', 'board-voter-a@example.test'),
  ('dddddddd-9999-4999-8999-999999999993', 'board-voter-b@example.test');

create temp table t (name text primary key, value text);

-- An old hoodie with two votes, a newer tee with none, a design missing a
-- view, and an unpublished design.
do $$
declare
  owner uuid := 'dddddddd-9999-4999-8999-999999999991';
  v public.design_versions;
  kind text;
  v_slug text;
begin
  v := public.flp_create_design(owner, gen_random_uuid(),
    '{"schemaVersion":2,"template":{"id":"hoodie","version":1}}', 'sha256:' || repeat('a', 64), 'Old hoodie');
  foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
    insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
    values (v.design_id, 1, owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
  end loop;
  v_slug := (public.flp_publish_version(owner, v.design_id, 1)).slug;
  update public.publications set published_at = now() - interval '30 days' where publications.slug = v_slug;
  insert into t values ('hoodie', v_slug);

  v := public.flp_create_design(owner, gen_random_uuid(),
    '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":4}}', 'sha256:' || repeat('a', 64), 'New tee');
  foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
    insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
    values (v.design_id, 1, owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
  end loop;
  insert into t values ('tee', (public.flp_publish_version(owner, v.design_id, 1)).slug);

  v := public.flp_create_design(owner, gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'No back');
  foreach kind in array array['view_front', 'view_three_quarter'] loop
    insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
    values (v.design_id, 1, owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
  end loop;
  insert into t values ('partial', (public.flp_publish_version(owner, v.design_id, 1)).slug);

  perform public.flp_create_design(owner, gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Private');
end;
$$;

select public.flp_cast_vote('dddddddd-9999-4999-8999-999999999992', (select value from t where name = 'hoodie'));
select public.flp_cast_vote('dddddddd-9999-4999-8999-999999999993', (select value from t where name = 'hoodie'));

select results_eq(
  $$ select slug, vote_count from public.flp_board() where slug in (select value from t) $$,
  format($$ values (%L, 2), (%L, 0) $$, (select value from t where name = 'hoodie'), (select value from t where name = 'tee')),
  'the board ranks by votes over every publication, so an old leader stays first'
);

select results_eq(
  $$ select template_id, template_version from public.flp_board() where slug in (select value from t) $$,
  $$ values ('hoodie', '1'), ('tee-crew-short', '4') $$,
  'each entry carries its published version''s template'
);

select is(
  (select count(*)::integer from public.flp_board() where slug = (select value from t where name = 'partial')),
  0,
  'a publication missing a base view is left off'
);

select results_eq(
  $$ select slug from public.flp_board(1) $$,
  $$ select slug from public.flp_board() limit 1 $$,
  'the limit keeps the top of the ranking'
);

select ok(
  not has_function_privilege('anon', 'public.flp_board(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.flp_board(integer)', 'execute'),
  'only the server reads the board'
);

select ok(
  has_function_privilege('service_role', 'public.flp_board(integer)', 'execute'),
  'the server can read the board'
);

select * from finish();
rollback;
