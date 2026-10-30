begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'owner-a@example.test'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'owner-b@example.test');

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated, anon;

insert into ids
select 'a', design_id from public.flp_create_design(
  'aaaaaaaa-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-0000000000a1',
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'A tee'
);

select lives_ok(
  format(
    $$ select public.flp_publish_version('aaaaaaaa-1111-4111-8111-111111111111', %L, 1) $$,
    (select id from ids where name = 'a')
  ),
  'owner A publishes version 1'
);

insert into public.assets (id, owner_id, status)
values ('asset_owneraprivate01', 'aaaaaaaa-1111-4111-8111-111111111111', 'staged');

insert into storage.objects (bucket_id, name, owner)
values (
  'design-assets', 'aaaaaaaa-1111-4111-8111-111111111111/original.png',
  'aaaaaaaa-1111-4111-8111-111111111111'
);

-- Key reuse ------------------------------------------------------------------

select throws_ok(
  format(
    $$ select public.flp_save_version('aaaaaaaa-1111-4111-8111-111111111111', %L, 1,
       'aaaaaaaa-0000-4000-8000-0000000000a1', '{"schemaVersion":2}', 'sha256:' || repeat('f', 64)) $$,
    (select id from ids where name = 'a')
  ),
  'FL409', 'mutation key reused with different content',
  'a reused mutation key with different content is refused'
);

select throws_ok(
  $$ select public.flp_create_design('aaaaaaaa-1111-4111-8111-111111111111',
     'aaaaaaaa-0000-4000-8000-0000000000a1', '{"schemaVersion":2}', 'sha256:' || repeat('e', 64)) $$,
  'FL409', 'mutation key reused with different content',
  'a reused create key with different content is refused'
);

-- Owner B, using A's guessed ids ---------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims', '{"sub":"bbbbbbbb-2222-4222-8222-222222222222","role":"authenticated"}', true
);

select is((select count(*)::int from public.designs where id = (select id from ids where name = 'a')), 0,
  'B cannot read A''s design by id');
select is((select count(*)::int from public.design_versions where design_id = (select id from ids where name = 'a')), 0,
  'B cannot read A''s versions');
select is((select count(*)::int from public.publications), 0,
  'B cannot read A''s publication row');
select is((select count(*)::int from public.assets where id = 'asset_owneraprivate01'), 0,
  'B cannot read A''s asset');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'design-assets'), 0,
  'B cannot see A''s stored original'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('design-assets', 'aaaaaaaa-1111-4111-8111-111111111111/planted.png',
             'bbbbbbbb-2222-4222-8222-222222222222') $$,
  '42501', null, 'B cannot write into A''s storage prefix'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('design-assets', 'bbbbbbbb-2222-4222-8222-222222222222/own.png',
             'bbbbbbbb-2222-4222-8222-222222222222') $$,
  '42501', null, 'clients cannot upload directly even to their own prefix'
);

-- Owner A: reads own, cannot mutate directly ----------------------------------

select set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-1111-4111-8111-111111111111","role":"authenticated"}', true
);

select is((select count(*)::int from public.designs), 1, 'A reads their own design');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'design-assets'), 1,
  'A reads their own stored original'
);
select throws_ok(
  format($$ update public.designs set owner_id = 'bbbbbbbb-2222-4222-8222-222222222222' where id = %L $$,
    (select id from ids where name = 'a')),
  '42501', null, 'A cannot reassign ownership'
);
select throws_ok(
  format($$ update public.designs set visibility = 'private', head_seq = null where id = %L $$,
    (select id from ids where name = 'a')),
  '42501', null, 'A cannot move version pointers directly'
);
select throws_ok(
  format($$ update public.publications set version_seq = 1 where design_id = %L $$,
    (select id from ids where name = 'a')),
  '42501', null, 'A cannot change publication fields directly'
);
select throws_ok(
  format($$ insert into public.design_versions
     (design_id, seq, owner_id, kind, schema_version, content, content_hash, content_bytes, mutation_key)
     values (%L, 9, 'aaaaaaaa-1111-4111-8111-111111111111', 'autosave', 2, '{"schemaVersion":2}',
             'sha256:' || repeat('c', 64), 20, gen_random_uuid()) $$,
    (select id from ids where name = 'a')),
  '42501', null, 'A cannot insert versions through REST'
);
select throws_ok(
  format($$ delete from public.design_versions where design_id = %L $$,
    (select id from ids where name = 'a')),
  '42501', null, 'A cannot delete versions through REST'
);
select throws_ok(
  $$ select public.flp_append_version(
       (select d from public.designs d limit 1), 1, gen_random_uuid(), 'autosave', null,
       '{"schemaVersion":2}', 'sha256:' || repeat('c', 64), null) $$,
  '42501', null, 'internal helpers are not callable by clients'
);
select throws_ok(
  format($$ select public.flp_publish_version('aaaaaaaa-1111-4111-8111-111111111111', %L, 1) $$,
    (select id from ids where name = 'a')),
  '42501', null, 'publishing is server-only'
);

-- Anonymous -----------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select count(*) from public.designs $$, '42501', null,
  'anonymous visitors cannot read designs');
select throws_ok($$ select count(*) from public.publications $$, '42501', null,
  'anonymous visitors cannot read publications directly (public page is P04)');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'design-assets'), 0,
  'anonymous visitors cannot see stored originals'
);

reset role;
select * from finish();
rollback;
