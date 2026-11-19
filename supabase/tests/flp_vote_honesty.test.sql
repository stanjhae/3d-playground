begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- 20261127090000_flp_vote_honesty.sql: held votes beside every count, ties
-- marked on the board, and no self-votes.
update public.vote_rules set min_account_age = interval '24 hours';

insert into auth.users (id, email, created_at) values
  ('abababab-3333-4333-8333-000000000001', 'honest-owner-a@example.test', now() - interval '90 days'),
  ('abababab-3333-4333-8333-000000000002', 'honest-owner-b@example.test', now() - interval '90 days'),
  ('abababab-3333-4333-8333-000000000003', 'honest-voter-1@example.test', now() - interval '60 days'),
  ('abababab-3333-4333-8333-000000000004', 'honest-voter-2@example.test', now() - interval '60 days'),
  ('abababab-3333-4333-8333-000000000005', 'honest-voter-new@example.test', now() - interval '1 hour');

create temp table t (name text primary key, value text);

-- Owner A: x. Owner B: y and z.
do $$
declare
  a uuid := 'abababab-3333-4333-8333-000000000001';
  b uuid := 'abababab-3333-4333-8333-000000000002';
  spec record;
  v public.design_versions;
  kind text;
begin
  for spec in
    select * from (values ('x', a, 'X tee'), ('y', b, 'Y tee'), ('z', b, 'Z tee')) as s (name, owner, title)
  loop
    v := public.flp_create_design(spec.owner, gen_random_uuid(),
      '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}'::jsonb, 'sha256:' || repeat('a', 64), spec.title);
    foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
      insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
      values (v.design_id, 1, spec.owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
    end loop;
    insert into t values (spec.name, (public.flp_publish_version(spec.owner, v.design_id, 1)).slug);
  end loop;
end;
$$;

-- x and y: one counted vote each (a tie). z: only the new account's vote.
select public.flp_cast_vote('abababab-3333-4333-8333-000000000003', (select value from t where name = 'x'));
select public.flp_cast_vote('abababab-3333-4333-8333-000000000004', (select value from t where name = 'y'));
select public.flp_cast_vote('abababab-3333-4333-8333-000000000005', (select value from t where name = 'z'));

-- ---------------------------------------------------------------------------
-- Held votes next to the count
-- ---------------------------------------------------------------------------

select results_eq(
  format($$ select vote_count, pending_count from public.flp_vote_state(%L) $$, (select value from t where name = 'z')),
  $$ values (0, 1) $$,
  'the share page count is the counted number, with the new account''s vote held beside it'
);

select results_eq(
  format($$ select vote_count, voted, counts_from is not null, viewer_counts_from is not null
    from public.flp_vote_state(%L, 'abababab-3333-4333-8333-000000000005') $$, (select value from t where name = 'z')),
  $$ values (0, true, true, true) $$,
  'the new voter is told when their vote counts'
);

select results_eq(
  format($$ select voted, counts_from is null, viewer_counts_from is not null
    from public.flp_vote_state(%L, 'abababab-3333-4333-8333-000000000005') $$, (select value from t where name = 'x')),
  $$ values (false, true, true) $$,
  'before voting, a new account already knows its vote would be held, so nothing guesses a count'
);

select results_eq(
  format($$ select viewer_counts_from is null from public.flp_vote_state(%L, 'abababab-3333-4333-8333-000000000003') $$,
    (select value from t where name = 'x')),
  $$ values (true) $$,
  'an older account''s votes count straight away'
);

select results_eq(
  format($$ select pending_count from public.flp_board_ranked('all') where slug = %L $$, (select value from t where name = 'z')),
  $$ values (1) $$,
  'the board carries the same held votes as the share page'
);

select results_eq(
  format($$ select vote_count, pending_count, viewer_counts_from is not null
    from public.flp_vote_feed('abababab-3333-4333-8333-000000000005') where slug = %L $$, (select value from t where name = 'z')),
  $$ values (0, 1, true) $$,
  'the Vote feed carries them too, and when the viewer''s votes count'
);

-- ---------------------------------------------------------------------------
-- Own designs
-- ---------------------------------------------------------------------------

select results_eq(
  format($$ select own from public.flp_vote_state(%L, 'abababab-3333-4333-8333-000000000001') $$, (select value from t where name = 'x')),
  $$ values (true) $$,
  'the owner is told the design is their own'
);

select results_eq(
  format($$ select own from public.flp_vote_state(%L, 'abababab-3333-4333-8333-000000000003') $$, (select value from t where name = 'x')),
  $$ values (false) $$,
  'someone else is not'
);

select results_eq(
  format($$ select own from public.flp_vote_state(%L) $$, (select value from t where name = 'x')),
  $$ values (false) $$,
  'signed out, nothing is anyone''s own'
);

select throws_ok(
  format($$ select public.flp_cast_vote('abababab-3333-4333-8333-000000000002', %L) $$, (select value from t where name = 'y')),
  'FL409',
  'you cannot vote for your own design',
  'the cast refuses a self-vote'
);

-- ---------------------------------------------------------------------------
-- Ties
-- ---------------------------------------------------------------------------

select results_eq(
  format($$ select count(distinct rank)::integer, bool_and(tied) from public.flp_board_ranked('all') where slug in (%L, %L) $$,
    (select value from t where name = 'x'), (select value from t where name = 'y')),
  $$ values (1, true) $$,
  'two designs with the same count share a rank and are marked tied'
);

select results_eq(
  $$ select bool_and(tied = (n > 1)) from (
       select tied, count(*) over (partition by vote_count) as n from public.flp_board_ranked('all', null, 200)
     ) rows $$,
  $$ values (true) $$,
  'only rows that share their count are marked tied'
);

select * from finish();
rollback;
