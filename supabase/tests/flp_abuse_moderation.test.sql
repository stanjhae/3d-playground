begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email) values
  ('dddddddd-9999-4999-8999-999999999999', 'moderated@example.test');

create temp table ids (name text primary key, id uuid, slug text);
grant select on ids to authenticated, anon;

insert into ids (name, id)
select 'design', design_id from public.flp_create_design(
  'dddddddd-9999-4999-8999-999999999999',
  'dddddddd-0000-4000-8000-0000000000d1',
  '{"schemaVersion":2}', 'sha256:' || repeat('d', 64), 'Reported tee'
);

select public.flp_publish_version(
  'dddddddd-9999-4999-8999-999999999999', (select id from ids where name = 'design'), 1
);

update ids set slug = (
  select slug from public.publications where design_id = (select id from ids where name = 'design')
) where name = 'design';

-- ---------------------------------------------------------------------------
-- Request limits
-- ---------------------------------------------------------------------------

select is(
  public.flp_take_request_token(repeat('a', 32), 'waitlist', 2, 60),
  0,
  'the first request in a window may proceed'
);

select is(
  public.flp_take_request_token(repeat('a', 32), 'waitlist', 2, 60),
  0,
  'the second request (the limit) may proceed'
);

select cmp_ok(
  public.flp_take_request_token(repeat('a', 32), 'waitlist', 2, 60),
  '>',
  0,
  'the third request waits for the next window'
);

select is(
  public.flp_take_request_token(repeat('b', 32), 'waitlist', 2, 60),
  0,
  'another caller has their own count'
);

select is(
  public.flp_take_request_token(repeat('a', 32), 'events', 2, 60),
  0,
  'the same caller has a separate count per bucket'
);

select throws_ok(
  $$ select public.flp_take_request_token('203.0.113.9', 'waitlist', 2, 60) $$,
  'FL422', null,
  'a raw address is refused: only the server''s hash is stored'
);

select throws_ok(
  $$ select public.flp_take_request_token(repeat('a', 32), 'waitlist', 0, 60) $$,
  'FL422', null,
  'a limit below one is refused'
);

insert into public.request_limits (subject, bucket, window_start, count) values
  (repeat('c', 32), 'events', now() - interval '2 days', 5),
  (repeat('c', 32), 'events', now() - interval '1 hour', 5);

select is(public.flp_prune_request_limits(), 1, 'pruning removes windows older than a day');

select is(
  (select count(*)::integer from public.request_limits where subject = repeat('c', 32)),
  1,
  'a recent window is kept'
);

insert into public.request_limits (subject, bucket, window_start, count)
values (repeat('e', 32), 'share_page', now() - interval '10 minutes', 9);

select public.flp_take_request_token(repeat('e', 32), 'share_page', 5, 60);

select is(
  (select count::integer from public.request_limits where subject = repeat('e', 32)),
  1,
  'a caller''s finished window is removed when they make a new request'
);

-- ---------------------------------------------------------------------------
-- Takedown and holds
-- ---------------------------------------------------------------------------

select lives_ok(
  format(
    $$ select public.flp_take_down_publication(%L, 'Reported: copied artwork', 'ops@fashionleadervote.test') $$,
    (select slug from ids where name = 'design')
  ),
  'an operator takes a published design down'
);

select is(
  (select status from public.publications where slug = (select slug from ids where name = 'design')),
  'revoked',
  'the publication is revoked at once'
);

select is(
  (select version_seq from public.publications where slug = (select slug from ids where name = 'design')),
  null,
  'no version stays public'
);

select is(
  (select visibility from public.designs where id = (select id from ids where name = 'design')),
  'private',
  'the design shows as private to its owner'
);

select throws_ok(
  format(
    $$ select public.flp_publish_version('dddddddd-9999-4999-8999-999999999999', %L, 1) $$,
    (select id from ids where name = 'design')
  ),
  'FL451', null,
  'the owner cannot publish it again while held'
);

select is(
  (select status from public.publications where slug = (select slug from ids where name = 'design')),
  'revoked',
  'a refused republish leaves it revoked'
);

select throws_ok(
  format(
    $$ update public.publications set status = 'published', version_seq = 1 where slug = %L $$,
    (select slug from ids where name = 'design')
  ),
  'FL451', null,
  'no other path can make a held publication live'
);

select throws_ok(
  $$ select public.flp_take_down_publication('0000000000000000', 'Unknown', 'ops') $$,
  'FL404', null,
  'an unknown slug is not found'
);

select throws_ok(
  format(
    $$ select public.flp_take_down_publication(%L, '   ', 'ops') $$,
    (select slug from ids where name = 'design')
  ),
  '23514', null,
  'a takedown needs a reason'
);

select lives_ok(
  format(
    $$ select public.flp_clear_moderation_hold(%L, 'ops@fashionleadervote.test') $$,
    (select slug from ids where name = 'design')
  ),
  'an operator clears the hold'
);

select is(
  (select status from public.publications where slug = (select slug from ids where name = 'design')),
  'revoked',
  'clearing does not republish by itself'
);

select throws_ok(
  format(
    $$ select public.flp_clear_moderation_hold(%L, 'ops') $$,
    (select slug from ids where name = 'design')
  ),
  'FL404', null,
  'clearing twice says there is no hold'
);

select is(
  (select slug from public.flp_publish_version(
    'dddddddd-9999-4999-8999-999999999999', (select id from ids where name = 'design'), 1
  )),
  (select slug from ids where name = 'design'),
  'once cleared, the owner publishes again under the same link'
);

-- Taking down an unpublished design still holds it.
select public.flp_revoke_publication(
  'dddddddd-9999-4999-8999-999999999999', (select id from ids where name = 'design')
);
select public.flp_take_down_publication(
  (select slug from ids where name = 'design'), 'Reported again', 'ops'
);

select throws_ok(
  format(
    $$ select public.flp_publish_version('dddddddd-9999-4999-8999-999999999999', %L, 1) $$,
    (select id from ids where name = 'design')
  ),
  'FL451', null,
  'a design taken down while unpublished cannot be published'
);

-- ---------------------------------------------------------------------------
-- Nobody but the service role reaches any of it
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-9999-4999-8999-999999999999","role":"authenticated"}', true);

select throws_ok(
  $$ select count(*) from public.moderation_holds $$,
  '42501', null,
  'an owner cannot read holds'
);

select throws_ok(
  $$ select public.flp_clear_moderation_hold((select slug from ids where name = 'design'), 'me') $$,
  '42501', null,
  'an owner cannot clear their own hold'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.flp_take_request_token(repeat('f', 32), 'waitlist', 100, 60) $$,
  '42501', null,
  'a visitor cannot spend or read request limits directly'
);

reset role;

select * from finish();
rollback;
