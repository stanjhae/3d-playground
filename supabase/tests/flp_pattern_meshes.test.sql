begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'pattern_meshes', 'draped meshes have a table');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pattern_meshes'::regclass),
  'row-level security is on'
);
select ok(
  (select 'application/octet-stream' = any (allowed_mime_types) and 'image/png' = any (allowed_mime_types)
   from storage.buckets where id = 'design-assets'),
  'the uploads bucket takes meshes as well as images'
);

insert into auth.users (id, email) values
  ('eeeeeeee-1111-4111-8111-111111111111', 'mesh-owner@example.test'),
  ('eeeeeeee-2222-4222-8222-222222222222', 'mesh-stranger@example.test');

select lives_ok(
  $$ insert into public.pattern_meshes (owner_id, pattern_hash, solver_version, storage_path)
     values ('eeeeeeee-1111-4111-8111-111111111111', 'sha256:' || repeat('a', 64), 1,
             'eeeeeeee-1111-4111-8111-111111111111/meshes/a-s1.flpm') $$,
  'a pending mesh is reserved'
);

select throws_ok(
  $$ update public.pattern_meshes set status = 'ready'
     where owner_id = 'eeeeeeee-1111-4111-8111-111111111111' $$,
  '23514',
  null,
  'a ready mesh needs its hash and size'
);

select lives_ok(
  format(
    $$ update public.pattern_meshes set status = 'ready', sha256 = %L, byte_size = 40000
       where owner_id = 'eeeeeeee-1111-4111-8111-111111111111' $$,
    repeat('b', 64)
  ),
  'a checked upload turns ready'
);

select throws_ok(
  $$ insert into public.pattern_meshes (owner_id, pattern_hash, solver_version, storage_path)
     values ('eeeeeeee-1111-4111-8111-111111111111', 'not-a-hash', 1, 'x') $$,
  '23514',
  null,
  'a malformed pattern hash is refused'
);

-- Owners read their own meshes; nobody else's, and nobody writes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-2222-4222-8222-222222222222"}';
select is((select count(*) from public.pattern_meshes)::int, 0, 'a stranger sees no one else''s meshes');
select throws_ok(
  $$ insert into public.pattern_meshes (owner_id, pattern_hash, solver_version, storage_path)
     values ('eeeeeeee-2222-4222-8222-222222222222', 'sha256:' || repeat('c', 64), 1, 'x') $$,
  '42501',
  null,
  'nobody writes meshes directly'
);
reset role;

-- 300 per account.
insert into public.pattern_meshes (owner_id, pattern_hash, solver_version, storage_path)
select 'eeeeeeee-2222-4222-8222-222222222222', 'sha256:' || lpad(to_hex(n), 64, '0'), 1, 'p/' || n
from generate_series(1, 300) as n;

select throws_ok(
  $$ insert into public.pattern_meshes (owner_id, pattern_hash, solver_version, storage_path)
     values ('eeeeeeee-2222-4222-8222-222222222222', 'sha256:' || repeat('f', 64), 1, 'p/301') $$,
  'FL429',
  null,
  'the 301st mesh is over quota'
);

select * from finish();
rollback;
