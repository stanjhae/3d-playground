begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

-- The hosted rule: a vote counts once the account is a day old.
update public.vote_rules set min_account_age = interval '24 hours';

insert into auth.users (id, email, created_at) values
  ('eeeeeeee-1111-4111-8111-000000000001', 'rank-owner-a@example.test', now() - interval '90 days'),
  ('eeeeeeee-1111-4111-8111-000000000002', 'rank-owner-b@example.test', now() - interval '90 days'),
  ('eeeeeeee-1111-4111-8111-000000000003', 'rank-voter-old@example.test', now() - interval '60 days'),
  ('eeeeeeee-1111-4111-8111-000000000004', 'rank-voter-mid@example.test', now() - interval '60 days'),
  ('eeeeeeee-1111-4111-8111-000000000005', 'rank-voter-new@example.test', now() - interval '1 hour');

create temp table t (name text primary key, value text);

-- Owner A: a hoodie and a tee. Owner B: a tee.
do $$
declare
  a uuid := 'eeeeeeee-1111-4111-8111-000000000001';
  b uuid := 'eeeeeeee-1111-4111-8111-000000000002';
  spec record;
  v public.design_versions;
  kind text;
begin
  for spec in
    select * from (values
      ('hoodie', a, '{"schemaVersion":2,"template":{"id":"hoodie","version":1}}', 'A hoodie'),
      ('tee-a', a, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'A tee'),
      ('tee-b', b, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'B tee')
    ) as s (name, owner, content, title)
  loop
    v := public.flp_create_design(spec.owner, gen_random_uuid(), spec.content::jsonb, 'sha256:' || repeat('a', 64), spec.title);
    foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
      insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
      values (v.design_id, 1, spec.owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
    end loop;
    insert into t values (spec.name, (public.flp_publish_version(spec.owner, v.design_id, 1)).slug);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vote rules
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ select public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000001', %L) $$, (select value from t where name = 'hoodie')),
  'FL409',
  'you cannot vote for your own design',
  'an owner cannot vote for their own design'
);

select results_eq(
  format($$ select vote_count, voted from public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000005', %L) $$, (select value from t where name = 'tee-b')),
  $$ values (0, true) $$,
  'a day-young account may vote, but the vote does not count yet'
);

select ok(
  public.flp_votes_count_from('eeeeeeee-1111-4111-8111-000000000005') > now(),
  'a young account is told when its votes start counting'
);

select ok(
  public.flp_votes_count_from('eeeeeeee-1111-4111-8111-000000000003') <= now(),
  'an older account''s votes already count'
);

-- Votes: the hoodie gets two old votes (one from last month), tee-b one this
-- week from an old account plus the young one, tee-a one from this week.
select public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000003', (select value from t where name = 'hoodie'));
select public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000004', (select value from t where name = 'hoodie'));
select public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000003', (select value from t where name = 'tee-b'));
select public.flp_cast_vote('eeeeeeee-1111-4111-8111-000000000004', (select value from t where name = 'tee-a'));
update public.publication_votes set created_at = now() - interval '20 days'
where slug = (select value from t where name = 'hoodie') and voter_id = 'eeeeeeee-1111-4111-8111-000000000003';
update public.publication_votes set created_at = now() - interval '45 days'
where slug = (select value from t where name = 'hoodie') and voter_id = 'eeeeeeee-1111-4111-8111-000000000004';

select results_eq(
  format($$ select vote_count from public.flp_vote_state(%L) $$, (select value from t where name = 'tee-b')),
  $$ values (1) $$,
  'the share page count leaves out the young account''s vote'
);

-- A self-vote that predates the rule never counts.
insert into public.publication_votes (slug, voter_id)
values ((select value from t where name = 'tee-a'), 'eeeeeeee-1111-4111-8111-000000000001');

select results_eq(
  format($$ select vote_count from public.flp_vote_state(%L) $$, (select value from t where name = 'tee-a')),
  $$ values (1) $$,
  'an owner''s own vote is never counted'
);

-- ---------------------------------------------------------------------------
-- The ranked board
-- ---------------------------------------------------------------------------

-- Other publications may share this database, so ranks are checked
-- against each other rather than as absolute places.
create temp view ranks as
  select t.name, b.vote_count, b.rank, w.rank as week_rank, g.rank as tee_rank
  from t
  join public.flp_board_ranked('all') b on b.slug = t.value
  join public.flp_board_ranked('week') w on w.slug = t.value
  left join public.flp_board_ranked('all', 'tee-crew-short') g on g.slug = t.value;

select results_eq(
  $$ select name, vote_count from ranks order by name $$,
  $$ values ('hoodie'::text, 2), ('tee-a', 1), ('tee-b', 1) $$,
  'all time counts every counted vote'
);

select ok(
  (select rank from ranks where name = 'hoodie') < (select rank from ranks where name = 'tee-a')
    and (select rank from ranks where name = 'tee-a') = (select rank from ranks where name = 'tee-b'),
  'all time: the hoodie ranks above the tees, which share a place'
);

select results_eq(
  $$ select vote_count from public.flp_board_ranked('month') where slug = (select value from t where name = 'hoodie') $$,
  $$ values (1) $$,
  'this month counts only votes cast in the last 30 days'
);

select results_eq(
  $$ select vote_count from public.flp_board_ranked('week') where slug = (select value from t where name = 'hoodie') $$,
  $$ values (0) $$,
  'this week counts only votes cast in the last 7 days'
);

select ok(
  (select week_rank from ranks where name = 'tee-a') < (select week_rank from ranks where name = 'hoodie'),
  'this week, a tee ranks above the hoodie'
);

select results_eq(
  $$ select name from ranks where tee_rank is not null order by name $$,
  $$ values ('tee-a'::text), ('tee-b') $$,
  'a garment filter keeps only that template'
);

select ok(
  (select tee_rank from ranks where name = 'tee-a') = (select tee_rank from ranks where name = 'tee-b')
    and (select tee_rank from ranks where name = 'tee-a') <= (select rank from ranks where name = 'tee-a'),
  'ranks are counted within the garment'
);

select throws_ok(
  $$ select * from public.flp_board_ranked('year') $$,
  'FL422',
  'window must be week, month or all',
  'an unknown window is refused'
);

select is(
  (select count(*)::integer from public.flp_board_ranked('all') where owner_handle is not null and slug in (select value from t)),
  0,
  'no handle shows while profiles are private'
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', 'Bad Handle!', false) $$,
  'FL422',
  'handle must be 3 to 24 letters, digits or single hyphens',
  'a handle with spaces or symbols is refused'
);

select throws_ok(
  $$ select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', 'a--b', false) $$,
  'FL422',
  'handle must be 3 to 24 letters, digits or single hyphens',
  'a double hyphen is refused'
);

select throws_ok(
  $$ select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', 'admin', false) $$,
  'FL409',
  'that handle is reserved',
  'a reserved handle is refused'
);

select throws_ok(
  $$ select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', null, true) $$,
  'FL422',
  'choose a handle before showing your profile',
  'a profile cannot be public without a handle'
);

select is(
  (public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', ' Atelier-A ', false)).handle,
  'atelier-a',
  'a handle is trimmed and lower-cased'
);

select throws_ok(
  $$ select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000002', 'atelier-a', false) $$,
  'FL409',
  'that handle is taken',
  'a handle already in use is refused'
);

select throws_ok(
  $$ select * from public.flp_public_profile('atelier-a') $$,
  'FL404',
  'profile not found',
  'a private profile cannot be read'
);

select public.flp_set_public_profile('eeeeeeee-1111-4111-8111-000000000001', 'atelier-a', true);

select results_eq(
  $$ select handle, jsonb_array_length(designs) from public.flp_public_profile('ATELIER-A') $$,
  $$ values ('atelier-a'::text, 2) $$,
  'a public profile lists its live designs, whatever the case of the handle'
);

select results_eq(
  $$ select designs -> 0 ->> 'title' from public.flp_public_profile('atelier-a') $$,
  $$ values ('A hoodie'::text) $$,
  'a profile lists the most voted design first'
);

select results_eq(
  $$ select distinct owner_handle from public.flp_board_ranked('all') where slug in (select value from t where name like '%-a' or name = 'hoodie') $$,
  $$ values ('atelier-a'::text) $$,
  'the board names the owner once their profile is public'
);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

select public.flp_report_publication('eeeeeeee-1111-4111-8111-000000000003', (select value from t where name = 'tee-b'), 'spam', ' looks copied ');
select public.flp_report_publication('eeeeeeee-1111-4111-8111-000000000003', (select value from t where name = 'tee-b'), 'other');

select results_eq(
  $$ select reason, note, status from public.publication_reports where slug = (select value from t where name = 'tee-b') $$,
  $$ values ('spam'::text, 'looks copied'::text, 'open'::text) $$,
  'reporting again while a report is open changes nothing'
);

select throws_ok(
  format($$ select public.flp_report_publication('eeeeeeee-1111-4111-8111-000000000003', %L, 'rude') $$, (select value from t where name = 'tee-a')),
  'FL422',
  'reason must be copyright, offensive, spam or other',
  'an unknown reason is refused'
);

select is(
  (public.flp_resolve_report((select id from public.publication_reports limit 1), 'dismissed', 'operator')).status,
  'dismissed',
  'an operator can close a report'
);

select ok(
  not has_function_privilege('authenticated', 'public.flp_board_ranked(text, text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.flp_public_profile(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.flp_report_publication(uuid, text, text, text)', 'execute')
    and not has_table_privilege('authenticated', 'public.publication_reports', 'select'),
  'only the server reads rankings, profiles and reports'
);

select * from finish();
rollback;
