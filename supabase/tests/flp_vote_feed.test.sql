begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

update public.vote_rules set min_account_age = interval '24 hours';

insert into auth.users (id, email, created_at) values
  ('ffffffff-2222-4222-8222-000000000001', 'feed-owner-a@example.test', now() - interval '90 days'),
  ('ffffffff-2222-4222-8222-000000000002', 'feed-owner-b@example.test', now() - interval '90 days'),
  ('ffffffff-2222-4222-8222-000000000003', 'feed-voter-1@example.test', now() - interval '60 days'),
  ('ffffffff-2222-4222-8222-000000000004', 'feed-voter-2@example.test', now() - interval '60 days'),
  ('ffffffff-2222-4222-8222-000000000005', 'feed-voter-3@example.test', now() - interval '60 days'),
  ('ffffffff-2222-4222-8222-000000000006', 'feed-voter-new@example.test', now() - interval '1 hour');

create temp table t (name text primary key, value text);

-- Owner A: popular (3 votes this week), fresh (none), quiet (none, old) and
-- a hoodie. Owner B: one tee.
do $$
declare
  a uuid := 'ffffffff-2222-4222-8222-000000000001';
  b uuid := 'ffffffff-2222-4222-8222-000000000002';
  spec record;
  v public.design_versions;
  kind text;
begin
  for spec in
    select * from (values
      ('popular', a, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'Popular', interval '1 hour'),
      ('fresh', a, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'Fresh', interval '2 hours'),
      ('quiet', a, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'Quiet', interval '40 days'),
      ('hoodie', a, '{"schemaVersion":2,"template":{"id":"hoodie","version":1}}', 'Hoodie', interval '3 hours'),
      ('b-tee', b, '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'B tee', interval '4 hours')
    ) as s (name, owner, content, title, age)
  loop
    v := public.flp_create_design(spec.owner, gen_random_uuid(), spec.content::jsonb, 'sha256:' || repeat('a', 64), spec.title);
    foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
      insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
      values (v.design_id, 1, spec.owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
    end loop;
    insert into t values (spec.name, (public.flp_publish_version(spec.owner, v.design_id, 1)).slug);
    update public.publications set published_at = now() - spec.age where slug = (select value from t where name = spec.name);
  end loop;
end;
$$;

select public.flp_cast_vote('ffffffff-2222-4222-8222-000000000003', (select value from t where name = 'popular'));
select public.flp_cast_vote('ffffffff-2222-4222-8222-000000000004', (select value from t where name = 'popular'));
select public.flp_cast_vote('ffffffff-2222-4222-8222-000000000005', (select value from t where name = 'popular'));
select public.flp_cast_vote('ffffffff-2222-4222-8222-000000000003', (select value from t where name = 'b-tee'));
select public.flp_cast_vote('ffffffff-2222-4222-8222-000000000006', (select value from t where name = 'fresh'));

-- The whole feed for a viewer, walked page by page with a small page size.
create temp table walked (n serial, slug text, feed_group integer, vote_count integer, voted boolean, counts_from timestamptz);

create function pg_temp.walk(p_viewer uuid, p_template text) returns void language plpgsql as $$
declare
  r record;
  g integer;
  p timestamptz;
  s text;
  got integer;
begin
  truncate walked;
  loop
    got := 0;
    for r in select * from public.flp_vote_feed(p_viewer, p_template, g, p, s, 2) loop
      insert into walked (slug, feed_group, vote_count, voted, counts_from)
      values (r.slug, r.feed_group, r.vote_count, r.voted, r.counts_from);
      g := r.feed_group; p := r.published_at; s := r.slug;
      got := got + 1;
    end loop;
    exit when got < 2;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signed out: every listable design, needs-votes first, newest first
-- ---------------------------------------------------------------------------

select pg_temp.walk(null, null);

select results_eq(
  $$ select t.name from walked w join t on t.value = w.slug order by w.n $$,
  $$ values ('fresh'::text), ('hoodie'), ('b-tee'), ('quiet'), ('popular') $$,
  'needs-votes designs come first, newest first, then the rest'
);

select is(
  (select count(*)::integer from walked),
  (select count(distinct slug)::integer from walked),
  'paging never repeats a design'
);

select is(
  (select count(*)::integer from walked),
  (select count(*)::integer from public.flp_board_entries(null, null)),
  'paging reaches every listable design: nothing drops off'
);

select results_eq(
  $$ select t.name, w.feed_group, w.vote_count from walked w join t on t.value = w.slug where t.name in ('popular', 'b-tee', 'fresh') order by t.name $$,
  $$ values ('b-tee'::text, 0, 1), ('fresh', 0, 0), ('popular', 1, 3) $$,
  'counts are counted votes; three this week leaves the needs-votes group'
);

select ok(
  not exists (select 1 from walked where voted),
  'signed out, nothing reads as voted'
);

-- ---------------------------------------------------------------------------
-- Signed in
-- ---------------------------------------------------------------------------

select pg_temp.walk('ffffffff-2222-4222-8222-000000000001', null);

select ok(
  not exists (select 1 from walked w join t on t.value = w.slug where t.name in ('popular', 'fresh', 'quiet', 'hoodie')),
  'the viewer''s own designs are left out'
);

select ok(
  exists (select 1 from walked w join t on t.value = w.slug where t.name = 'b-tee'),
  'other people''s designs stay in'
);

select pg_temp.walk('ffffffff-2222-4222-8222-000000000003', null);

select results_eq(
  $$ select t.name, w.voted from walked w join t on t.value = w.slug order by t.name $$,
  $$ values ('b-tee'::text, true), ('fresh', false), ('hoodie', false), ('popular', true), ('quiet', false) $$,
  'each row says whether the viewer voted'
);

select pg_temp.walk('ffffffff-2222-4222-8222-000000000006', null);

select ok(
  (select w.voted and w.counts_from > now() from walked w join t on t.value = w.slug where t.name = 'fresh'),
  'a young account''s held vote says when it counts'
);

-- ---------------------------------------------------------------------------
-- Garment filter and arguments
-- ---------------------------------------------------------------------------

select pg_temp.walk(null, 'hoodie');

select ok(
  exists (select 1 from walked w join t on t.value = w.slug where t.name = 'hoodie')
    and not exists (select 1 from walked w join t on t.value = w.slug where t.name <> 'hoodie'),
  'the garment filter keeps one template'
);

select is(
  (select count(*)::integer from public.flp_vote_feed(null, null, null, null, null, 1000)),
  least(60, (select count(*)::integer from public.flp_board_entries(null, null))),
  'a page holds at most 60'
);

select throws_ok(
  $$ select * from public.flp_vote_feed(null, null, 0, now(), null, 10) $$,
  'FL422',
  'cursor must have a group, a time and a slug',
  'a partial cursor is refused'
);

select throws_ok(
  $$ select * from public.flp_vote_feed(null, null, 3, now(), 'x', 10) $$,
  'FL422',
  'cursor group must be 0 or 1',
  'an unknown group is refused'
);

select ok(
  not has_function_privilege('anon', 'public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)', 'execute')
    and has_function_privilege('service_role', 'public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)', 'execute'),
  'only the server may read the feed'
);

select * from finish();
rollback;
