begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('cccccccc-3333-4333-8333-333333333333', 'asset-owner@example.test');

insert into public.assets (id, owner_id) values
  ('asset_lifecycle_ready', 'cccccccc-3333-4333-8333-333333333333'),
  ('asset_lifecycle_rejected', 'cccccccc-3333-4333-8333-333333333333');

select is(
  (select status from public.assets where id = 'asset_lifecycle_ready'), 'staged',
  'a reserved asset starts staged'
);

select throws_ok(
  $$ insert into public.assets (id, owner_id)
     values ('asset_lib_crest_tee', 'cccccccc-3333-4333-8333-333333333333') $$,
  '23514', null,
  'library ids cannot be stored as uploaded assets'
);

select throws_ok(
  $$ update public.assets set status = 'rejected' where id = 'asset_lifecycle_rejected' $$,
  '23514', null,
  'a rejection needs a reason'
);

select throws_ok(
  $$ update public.assets set status = 'staged', rejection_reason = 'corrupt'
     where id = 'asset_lifecycle_rejected' $$,
  '23514', null,
  'only rejected assets carry a reason'
);

select throws_ok(
  $$ update public.assets set status = 'ready', mime_type = 'image/png', byte_size = 10,
       width = 1, height = 1, sha256 = repeat('a', 64),
       storage_path = 'dddddddd-4444-4444-8444-444444444444/asset_lifecycle_ready/normalized'
     where id = 'asset_lifecycle_ready' $$,
  '23514', null,
  'the storage path must sit under the owner and asset prefix'
);

select lives_ok(
  $$ update public.assets set status = 'ready', mime_type = 'image/png', byte_size = 10,
       width = 1, height = 1, sha256 = repeat('a', 64),
       storage_path = 'cccccccc-3333-4333-8333-333333333333/asset_lifecycle_ready/normalized'
     where id = 'asset_lifecycle_ready' $$,
  'a staged asset becomes ready with its metadata'
);

select lives_ok(
  $$ update public.assets set status = 'rejected', rejection_reason = 'animated'
     where id = 'asset_lifecycle_rejected' $$,
  'a staged asset is rejected with a reason'
);

select throws_ok(
  $$ update public.assets set sha256 = repeat('b', 64) where id = 'asset_lifecycle_ready' $$,
  'FL422', 'settled assets are immutable',
  'a ready asset''s hash cannot change'
);

select throws_ok(
  $$ update public.assets set status = 'staged' where id = 'asset_lifecycle_ready' $$,
  'FL422', 'settled assets are immutable',
  'a ready asset cannot return to staged'
);

select throws_ok(
  $$ update public.assets set status = 'staged', rejection_reason = null
     where id = 'asset_lifecycle_rejected' $$,
  'FL422', 'settled assets are immutable',
  'a rejected asset stays rejected'
);

insert into public.assets (id, owner_id) values
  ('asset_lifecycle_staged', 'cccccccc-3333-4333-8333-333333333333');

select throws_ok(
  $$ update public.assets set owner_id = 'aaaaaaaa-1111-4111-8111-111111111111'
     where id = 'asset_lifecycle_staged' $$,
  'FL422', 'asset identity is immutable',
  'a staged asset cannot change owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claims', '{"sub":"cccccccc-3333-4333-8333-333333333333","role":"authenticated"}', true
);

select throws_ok(
  $$ update public.assets set status = 'ready' where id = 'asset_lifecycle_staged' $$,
  '42501', null,
  'owners cannot settle their own assets directly'
);

reset role;
select * from finish();
rollback;
