begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('a1a1a1a1-8888-4888-8888-888888888888', 'terms-new@example.test'),
  ('b2b2b2b2-9999-4999-8999-999999999999', 'terms-existing@example.test'),
  ('c3c3c3c3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'terms-leaving@example.test');

-- The columns are additive and nullable.
select col_is_null('public', 'profiles', 'terms_version', 'terms_version is nullable');
select col_is_null('public', 'profiles', 'terms_accepted_at', 'terms_accepted_at is nullable');

-- An account that existed before the migration: a profile with a name, no terms.
select public.flp_set_display_name('b2b2b2b2-9999-4999-8999-999999999999', 'Existing');

select is(
  (select terms_version from public.profiles where owner_id = 'b2b2b2b2-9999-4999-8999-999999999999'),
  null,
  'an existing profile has not accepted any terms, so it is asked once'
);

-- A brand-new account has no profile row until it accepts.
select is(
  (select terms_version from public.flp_accept_terms('a1a1a1a1-8888-4888-8888-888888888888', ' 2026-11-14 ')),
  '2026-11-14',
  'accepting creates the profile with the version (trimmed)'
);

select isnt(
  (select terms_accepted_at from public.profiles where owner_id = 'a1a1a1a1-8888-4888-8888-888888888888'),
  null,
  'and records when'
);

select is(
  (select display_name from public.profiles where owner_id = 'a1a1a1a1-8888-4888-8888-888888888888'),
  null,
  'accepting sets no public name'
);

select is(
  (select display_name from public.flp_accept_terms('b2b2b2b2-9999-4999-8999-999999999999', '2026-11-14')),
  'Existing',
  'an existing profile keeps its public name when it accepts'
);

-- Accepting the same version again keeps the first time.
update public.profiles set terms_accepted_at = '2026-11-01T00:00:00Z'
where owner_id = 'a1a1a1a1-8888-4888-8888-888888888888';

select is(
  (select terms_accepted_at from public.flp_accept_terms('a1a1a1a1-8888-4888-8888-888888888888', '2026-11-14')),
  '2026-11-01T00:00:00Z'::timestamptz,
  'accepting the same version again keeps the first acceptance time'
);

select isnt(
  (select terms_accepted_at from public.flp_accept_terms('a1a1a1a1-8888-4888-8888-888888888888', '2027-01-01')),
  '2026-11-01T00:00:00Z'::timestamptz,
  'a new version replaces the time'
);

select is(
  (select terms_version from public.flp_set_display_name('a1a1a1a1-8888-4888-8888-888888888888', 'New')),
  '2027-01-01',
  'setting a public name leaves the accepted version alone'
);

select throws_ok(
  $$ select public.flp_accept_terms('a1a1a1a1-8888-4888-8888-888888888888', '   ') $$,
  'FL422', null,
  'a blank version is refused'
);

select throws_ok(
  $$ select public.flp_accept_terms(null, '2026-11-14') $$,
  'FL401', null,
  'accepting needs an account'
);

select throws_ok(
  $$ update public.profiles set terms_version = null where owner_id = 'a1a1a1a1-8888-4888-8888-888888888888' $$,
  '23514', null,
  'a time without a version is refused'
);

select ok(
  not has_function_privilege('authenticated', 'public.flp_accept_terms(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.flp_accept_terms(uuid, text)', 'execute'),
  'only the server (service role) can record acceptance'
);

-- Row-level security: an account reads its own acceptance, not another's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-8888-4888-8888-888888888888","role":"authenticated"}', true);

select is(
  (select array_agg(terms_version) from public.profiles),
  array['2027-01-01'],
  'an account sees only its own acceptance'
);

reset role;

-- Deleting an account removes its acceptance with the profile.
select public.flp_accept_terms('c3c3c3c3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-14');
delete from auth.users where id = 'c3c3c3c3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.profiles where owner_id = 'c3c3c3c3-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'a deleted account leaves no profile or acceptance behind'
);

select is(
  (select count(*)::int from public.profiles where owner_id = 'b2b2b2b2-9999-4999-8999-999999999999'),
  1,
  'other accounts keep theirs'
);

select * from finish();
rollback;
