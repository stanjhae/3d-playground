begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('d4d4d4d4-1111-4111-8111-111111111111', 'admin-boss@example.test'),
  ('e5e5e5e5-2222-4222-8222-222222222222', 'admin-someone@example.test');

insert into public.admins (user_id, note) values ('d4d4d4d4-1111-4111-8111-111111111111', 'test');

select is((select count(*)::int from public.admins), 1, 'the service role reads admins');

-- No browser role can read the list or add itself.
select ok(not has_table_privilege('anon', 'public.admins', 'select'), 'anon cannot read admins');
select ok(not has_table_privilege('authenticated', 'public.admins', 'select'), 'a signed-in account cannot read admins');
select ok(not has_table_privilege('authenticated', 'public.admins', 'insert'), 'a signed-in account cannot make itself an admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5e5e5e5-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.admins (user_id) values ('e5e5e5e5-2222-4222-8222-222222222222') $$,
  '42501',
  null,
  'an insert as a signed-in account is refused'
);
reset role;

select throws_ok(
  $$ insert into public.admins (user_id, note) values ('e5e5e5e5-2222-4222-8222-222222222222', '') $$,
  '23514',
  null,
  'a note is either absent or has words'
);

delete from auth.users where id = 'd4d4d4d4-1111-4111-8111-111111111111';
select is((select count(*)::int from public.admins), 0, 'deleting the account removes its admin row');

select * from finish();
rollback;
