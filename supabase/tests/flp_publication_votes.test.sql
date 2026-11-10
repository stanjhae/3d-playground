begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email) values
  ('dddddddd-1111-4111-8111-111111111111', 'vote-owner@example.test'),
  ('dddddddd-2222-4222-8222-222222222222', 'vote-a@example.test'),
  ('dddddddd-3333-4333-8333-333333333333', 'vote-b@example.test');

create temp table t (name text primary key, value text);
grant select on t to authenticated;

-- A published design, and a second design that is never published.
do $$
declare
  owner uuid := 'dddddddd-1111-4111-8111-111111111111';
  v public.design_versions;
begin
  v := public.flp_create_design(owner, gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('d', 64), 'Voted tee');
  insert into t values ('design', v.design_id::text);
  insert into t values ('slug', (public.flp_publish_version(owner, v.design_id, 1)).slug);

  v := public.flp_create_design(owner, gen_random_uuid(), '{"schemaVersion":2}', 'sha256:' || repeat('d', 64), 'Private tee');
  insert into t values ('private', v.design_id::text);
end;
$$;

-- Table shape ----------------------------------------------------------------

select has_table('public', 'publication_votes', 'publication_votes exists');
select col_is_pk('public', 'publication_votes', array['slug', 'voter_id'], 'one vote per account per publication');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.publication_votes'::regclass),
  'publication_votes has row-level security'
);

-- Reading and casting -------------------------------------------------------

select results_eq(
  format($$ select vote_count, voted from public.flp_vote_state(%L) $$, (select value from t where name = 'slug')),
  $$ values (0, false) $$,
  'a new publication has no votes, and a signed-out reader has not voted'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_cast_vote('dddddddd-2222-4222-8222-222222222222', %L) $$,
    (select value from t where name = 'slug')),
  $$ values (1, true) $$,
  'casting a vote counts it and marks the voter'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_cast_vote('dddddddd-2222-4222-8222-222222222222', %L) $$,
    (select value from t where name = 'slug')),
  $$ values (1, true) $$,
  'voting again keeps the one vote'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_cast_vote('dddddddd-3333-4333-8333-333333333333', %L) $$,
    (select value from t where name = 'slug')),
  $$ values (2, true) $$,
  'another account adds its own vote'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_vote_state(%L, 'dddddddd-1111-4111-8111-111111111111') $$,
    (select value from t where name = 'slug')),
  $$ values (2, false) $$,
  'an account that has not voted sees the count, not voted'
);

select throws_ok(
  format($$ select public.flp_cast_vote(null, %L) $$, (select value from t where name = 'slug')),
  'FL401', null,
  'voting needs an account'
);

select throws_ok(
  $$ select public.flp_cast_vote('dddddddd-2222-4222-8222-222222222222', '0000000000000000') $$,
  'FL404', null,
  'an unknown slug cannot be voted on'
);

select throws_ok(
  $$ select public.flp_vote_state('0000000000000000') $$,
  'FL404', null,
  'an unknown slug has no vote state'
);

-- Retracting ------------------------------------------------------------------

select results_eq(
  format($$ select vote_count, voted from public.flp_retract_vote('dddddddd-3333-4333-8333-333333333333', %L) $$,
    (select value from t where name = 'slug')),
  $$ values (1, false) $$,
  'retracting removes only that account''s vote'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_retract_vote('dddddddd-3333-4333-8333-333333333333', %L) $$,
    (select value from t where name = 'slug')),
  $$ values (1, false) $$,
  'retracting again changes nothing'
);

-- Unpublish and republish ------------------------------------------------------

select lives_ok(
  format($$ select public.flp_revoke_publication('dddddddd-1111-4111-8111-111111111111', %L) $$,
    (select value from t where name = 'design')),
  'the owner unpublishes'
);

select throws_ok(
  format($$ select public.flp_cast_vote('dddddddd-3333-4333-8333-333333333333', %L) $$, (select value from t where name = 'slug')),
  'FL404', null,
  'an unpublished design cannot be voted on'
);

select throws_ok(
  format($$ select public.flp_retract_vote('dddddddd-2222-4222-8222-222222222222', %L) $$, (select value from t where name = 'slug')),
  'FL404', null,
  'nor can a vote on it be retracted'
);

select throws_ok(
  format($$ select public.flp_vote_state(%L) $$, (select value from t where name = 'slug')),
  'FL404', null,
  'an unpublished design shows no count'
);

do $$
declare
  v public.design_versions;
begin
  v := public.flp_save_version(
    'dddddddd-1111-4111-8111-111111111111', (select value from t where name = 'design')::uuid, 1,
    gen_random_uuid(), '{"schemaVersion":2,"n":2}', 'sha256:' || repeat('e', 64)
  );
  perform public.flp_publish_version('dddddddd-1111-4111-8111-111111111111', v.design_id, v.seq);
end;
$$;

select results_eq(
  format($$ select vote_count, voted from public.flp_vote_state(%L, 'dddddddd-2222-4222-8222-222222222222') $$,
    (select value from t where name = 'slug')),
  $$ values (1, true) $$,
  'votes carry over when a new version is published'
);

-- Row-level security and grants --------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims', '{"sub":"dddddddd-3333-4333-8333-333333333333","role":"authenticated"}', true
);

select is(
  (select count(*)::int from public.publication_votes), 0,
  'an account cannot see who else voted'
);

select throws_ok(
  format($$ insert into public.publication_votes (slug, voter_id) values (%L, 'dddddddd-3333-4333-8333-333333333333') $$,
    (select value from t where name = 'slug')),
  '42501', null, 'clients cannot write votes directly'
);

select throws_ok(
  format($$ select public.flp_cast_vote('dddddddd-3333-4333-8333-333333333333', %L) $$, (select value from t where name = 'slug')),
  '42501', null, 'clients cannot call the vote functions; only the server can'
);

select set_config(
  'request.jwt.claims', '{"sub":"dddddddd-2222-4222-8222-222222222222","role":"authenticated"}', true
);

select is(
  (select count(*)::int from public.publication_votes), 1,
  'a voter sees their own vote'
);

reset role;

-- The vote rate-limit bucket ---------------------------------------------------

select is(
  (select array_agg(public.flp_take_token('dddddddd-2222-4222-8222-222222222222', 'vote', 2, 60) > 0 order by n)
   from generate_series(1, 3) n),
  array[false, false, true],
  'the vote bucket limits each account on its own'
);

-- Deleting ---------------------------------------------------------------------

select lives_ok(
  format($$ select public.flp_delete_design('dddddddd-1111-4111-8111-111111111111', %L) $$,
    (select value from t where name = 'design')),
  'the owner deletes the design'
);

select is(
  (select count(*)::int from public.publication_votes where slug = (select value from t where name = 'slug')),
  0,
  'deleting a design removes its votes along with it'
);

select * from finish();
rollback;
