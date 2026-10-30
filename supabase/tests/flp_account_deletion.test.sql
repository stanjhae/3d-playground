begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('dddddddd-4444-4444-8444-444444444444', 'leaving@example.test'),
  ('eeeeeeee-5555-4555-8555-555555555555', 'staying@example.test');

create temp table ids (name text primary key, id uuid);

insert into ids
select 'kept', design_id from public.flp_create_design(
  'eeeeeeee-5555-4555-8555-555555555555', gen_random_uuid(),
  '{"schemaVersion":2}', 'sha256:' || repeat('e', 64), 'Kept'
);

insert into ids
select 'gone', design_id from public.flp_create_design(
  'dddddddd-4444-4444-8444-444444444444', gen_random_uuid(),
  '{"schemaVersion":2}', 'sha256:' || repeat('d', 64), 'Leaving'
);

select public.flp_save_version(
  'dddddddd-4444-4444-8444-444444444444', (select id from ids where name = 'gone'), 1,
  gen_random_uuid(), '{"schemaVersion":2,"x":1}', 'sha256:' || repeat('f', 64)
);

select lives_ok(
  format(
    $$ select public.flp_publish_version('dddddddd-4444-4444-8444-444444444444', %L, 2) $$,
    (select id from ids where name = 'gone')
  ),
  'the leaving account has a published design'
);

select throws_ok(
  format(
    $$ delete from public.design_versions where design_id = %L and seq = 1 $$,
    (select id from ids where name = 'gone')
  ),
  'FL422', 'design versions are immutable',
  'a direct delete of a version is still refused'
);

select lives_ok(
  $$ delete from auth.users where id = 'dddddddd-4444-4444-8444-444444444444' $$,
  'deleting an account that owns designs, versions and a publication succeeds'
);

select is(
  (select count(*)::int from public.designs where owner_id = 'dddddddd-4444-4444-8444-444444444444'),
  0, 'its designs are gone'
);

select is(
  (select count(*)::int from public.design_versions where owner_id = 'dddddddd-4444-4444-8444-444444444444'),
  0, 'its versions are gone'
);

select is(
  (select count(*)::int from public.publications where owner_id = 'dddddddd-4444-4444-8444-444444444444'),
  0, 'its publications are gone'
);

select is(
  (select count(*)::int from public.design_versions where design_id = (select id from ids where name = 'kept')),
  1, 'another account keeps its versions'
);

select throws_ok(
  format(
    $$ update public.design_versions set label = 'edited' where design_id = %L $$,
    (select id from ids where name = 'kept')
  ),
  'FL422', 'design versions are immutable',
  'versions still cannot be updated'
);

select * from finish();
rollback;
