begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Two accounts.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@example.test');

create temp table t (name text primary key, id uuid);
grant all on t to authenticated;

insert into t
select 'a', design_id from public.flp_create_design(
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000001',
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Crest tee'
);

insert into t
select 'b', design_id from public.flp_create_design(
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-0000-4000-8000-000000000001',
  '{"schemaVersion":2}', 'sha256:' || repeat('b', 64), null
);

-- Creation -----------------------------------------------------------------

select is(
  (select visibility from public.designs where id = (select id from t where name = 'a')),
  'private', 'new designs are private by default'
);

select is(
  (select head_seq from public.designs where id = (select id from t where name = 'a')),
  1, 'creation writes version 1'
);

select is(
  (select design_id from public.flp_create_design(
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-0000-4000-8000-000000000001',
    '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Crest tee'
  )),
  (select id from t where name = 'a'),
  'retrying create with the same mutation key returns the same design'
);

select is(
  (select count(*)::int from public.designs where owner_id = '11111111-1111-4111-8111-111111111111'),
  1, 'retried create made no second design'
);

select throws_ok(
  $$ select public.flp_create_design(null, gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('a', 64)) $$,
  'FL401', 'sign in required', 'writes need an owner from a verified session'
);

-- Saving -------------------------------------------------------------------

select is(
  (select seq from public.flp_save_version(
    '11111111-1111-4111-8111-111111111111', (select id from t where name = 'a'), 1,
    'aaaaaaaa-0000-4000-8000-000000000002', '{"schemaVersion":2,"x":1}',
    'sha256:' || repeat('c', 64), 'checkpoint', 'First draft'
  )),
  2, 'save on the current head appends version 2'
);

select is(
  (select seq from public.flp_save_version(
    '11111111-1111-4111-8111-111111111111', (select id from t where name = 'a'), 1,
    'aaaaaaaa-0000-4000-8000-000000000002', '{"schemaVersion":2,"x":1}',
    'sha256:' || repeat('c', 64), 'checkpoint', 'First draft'
  )),
  2, 'a retried save with the same key is idempotent, not a conflict'
);

select throws_ok(
  format(
    $$ select public.flp_save_version('11111111-1111-4111-8111-111111111111', %L, 1,
       gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('d', 64)) $$,
    (select id from t where name = 'a')
  ),
  'FL409', 'stale base version', 'a stale base is a conflict, never last-writer-wins'
);

select throws_ok(
  format(
    $$ select public.flp_save_version('22222222-2222-4222-8222-222222222222', %L, 2,
       gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('d', 64)) $$,
    (select id from t where name = 'a')
  ),
  'FL404', 'design not found', 'another owner gets a neutral not-found'
);

insert into t
select 'a2', design_id from public.flp_create_design(
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000009',
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Second tee'
);

select throws_ok(
  format(
    $$ select public.flp_save_version('11111111-1111-4111-8111-111111111111', %L, 1,
       'aaaaaaaa-0000-4000-8000-000000000002', '{"schemaVersion":2}', 'sha256:' || repeat('d', 64)) $$,
    (select id from t where name = 'a2')
  ),
  'FL409', 'mutation key already used', 'a mutation key cannot be replayed onto another design'
);

select throws_ok(
  format(
    $$ select public.flp_save_version('11111111-1111-4111-8111-111111111111', %L, 2,
       gen_random_uuid(), '{"schemaVersion":1}', 'sha256:' || repeat('d', 64)) $$,
    (select id from t where name = 'a')
  ),
  '23514', null, 'content must declare the stored schema version'
);

-- Immutability -------------------------------------------------------------

select throws_ok(
  format(
    $$ update public.design_versions set label = 'edited' where design_id = %L and seq = 1 $$,
    (select id from t where name = 'a')
  ),
  'FL422', 'design versions are immutable', 'versions cannot be updated'
);

select throws_ok(
  format(
    $$ delete from public.design_versions where design_id = %L and seq = 1 $$,
    (select id from t where name = 'a')
  ),
  'FL422', 'design versions are immutable', 'versions cannot be deleted directly'
);

-- Restore ------------------------------------------------------------------

select is(
  (select row(seq, kind, restored_from_seq, content_hash)::text from public.flp_restore_version(
    '11111111-1111-4111-8111-111111111111', (select id from t where name = 'a'), 2,
    'aaaaaaaa-0000-4000-8000-000000000003', 1
  )),
  row(3, 'restore', 1, 'sha256:' || repeat('a', 64))::text,
  'restore appends a new revision referencing its source'
);

-- Publication --------------------------------------------------------------

create temp table first_publish as
select * from public.flp_publish_version(
  '11111111-1111-4111-8111-111111111111', (select id from t where name = 'a'), 2, 'Ada'
);

select is(
  (select row(status, version_seq)::text from public.publications
   where design_id = (select id from t where name = 'a')),
  row('published', 2)::text, 'publishing pins the chosen saved version'
);

select is(
  (select visibility from public.designs where id = (select id from t where name = 'a')),
  'published', 'design reflects its publication'
);

create temp table first_slug as
select slug from public.publications where design_id = (select id from t where name = 'a');

select throws_ok(
  format(
    $$ select public.flp_publish_version('11111111-1111-4111-8111-111111111111', %L, 99) $$,
    (select id from t where name = 'a')
  ),
  'FL404', 'version not found', 'cannot publish a version that does not exist'
);

select throws_ok(
  format(
    $$ insert into public.publications (slug, design_id, owner_id, version_seq, status)
       values ('0123456789abcdef', %L, '22222222-2222-4222-8222-222222222222', 3, 'published') $$,
    (select id from t where name = 'b')
  ),
  '23503', null, 'a publication cannot point at another design''s version'
);

select lives_ok(
  format(
    $$ select public.flp_revoke_publication('11111111-1111-4111-8111-111111111111', %L) $$,
    (select id from t where name = 'a')
  ),
  'owner can revoke'
);

select is(
  (select row(status, version_seq is null)::text from public.publications
   where design_id = (select id from t where name = 'a')),
  row('revoked', true)::text, 'revoking clears the public version pointer'
);

select is(
  (select slug from public.flp_publish_version(
    '11111111-1111-4111-8111-111111111111', (select id from t where name = 'a'), 3
  )),
  (select slug from first_slug), 'republishing keeps the stable look URL'
);

-- Deletion -----------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.flp_delete_design('11111111-1111-4111-8111-111111111111', %L) $$,
    (select id from t where name = 'a')
  ),
  'owner can delete a published design'
);

select is(
  (select row(status, design_id is null)::text from public.publications
   where slug = (select slug from first_slug)),
  row('revoked', true)::text,
  'deletion leaves a revoked tombstone so the slug is never reused'
);

-- Row-level security and grants ---------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true
);

select is(
  (select count(*)::int from public.designs), 1,
  'an owner sees only their own designs'
);

select throws_ok(
  $$ insert into public.designs (owner_id) values ('22222222-2222-4222-8222-222222222222') $$,
  '42501', null, 'clients cannot write tables directly'
);

select throws_ok(
  format(
    $$ select public.flp_save_version('22222222-2222-4222-8222-222222222222', %L, 1,
       gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('e', 64)) $$,
    (select id from t where name = 'b')
  ),
  '42501', null, 'clients cannot call write functions; only the server can'
);

reset role;

select * from finish();
rollback;
