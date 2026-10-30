begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-6666-4666-8666-666666666666', 'details-owner@example.test'),
  ('bbbbbbbb-7777-4777-8777-777777777777', 'details-other@example.test');

create temp table ids (name text primary key, id uuid);

insert into ids
select 'design', design_id from public.flp_create_design(
  'aaaaaaaa-6666-4666-8666-666666666666', gen_random_uuid(),
  '{"schemaVersion":2}', 'sha256:' || repeat('a', 64), 'Before'
);

select is(
  (select title from public.flp_update_design(
    'aaaaaaaa-6666-4666-8666-666666666666', (select id from ids), '  After  ', null
  )),
  'After',
  'the owner renames a design (trimmed)'
);

select is(
  (select head_seq from public.designs where id = (select id from ids)),
  1,
  'renaming adds no version'
);

select throws_ok(
  format(
    $$ select public.flp_update_design('bbbbbbbb-7777-4777-8777-777777777777', %L, 'Theirs') $$,
    (select id from ids)
  ),
  'FL404', null,
  'another owner cannot rename it'
);

select throws_ok(
  format(
    $$ select public.flp_update_design('aaaaaaaa-6666-4666-8666-666666666666', %L, '   ') $$,
    (select id from ids)
  ),
  'FL422', null,
  'a blank title is refused'
);

select throws_ok(
  format(
    $$ select public.flp_update_design('aaaaaaaa-6666-4666-8666-666666666666', %L, null, %L) $$,
    (select id from ids), repeat('x', 501)
  ),
  'FL422', null,
  'a description over 500 characters is refused'
);

select is(
  (select display_name from public.flp_set_display_name(
    'aaaaaaaa-6666-4666-8666-666666666666', ' Ada '
  )),
  'Ada',
  'an account sets its public name'
);

select is(
  (select display_name from public.flp_set_display_name(
    'aaaaaaaa-6666-4666-8666-666666666666', ''
  )),
  null,
  'an empty name clears it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-4777-8777-777777777777","role":"authenticated"}';

select is_empty(
  $$ select 1 from public.profiles where owner_id = 'aaaaaaaa-6666-4666-8666-666666666666' $$,
  'another account cannot read the profile'
);

select throws_ok(
  $$ select public.flp_set_display_name('bbbbbbbb-7777-4777-8777-777777777777', 'Me') $$,
  '42501', null,
  'clients cannot call the write function'
);

select * from finish();
rollback;
