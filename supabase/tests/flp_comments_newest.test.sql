begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, created_at) values
  ('ffffffff-3333-4333-8333-000000000001', 'cn-owner@example.test', now() - interval '90 days'),
  ('ffffffff-3333-4333-8333-000000000002', 'cn-fan@example.test', now() - interval '90 days');

create temp table t (name text primary key, value text);

do $$
declare
  owner uuid := 'ffffffff-3333-4333-8333-000000000001';
  v public.design_versions;
  kind text;
begin
  v := public.flp_create_design(owner, gen_random_uuid(),
    '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'sha256:' || repeat('a', 64), 'Busy tee');
  foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
    insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
    values (v.design_id, 1, owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
  end loop;
  insert into t values ('slug', (public.flp_publish_version(owner, v.design_id, 1)).slug);
end;
$$;

-- 205 comments, a second apart, oldest "Comment 1".
insert into public.publication_comments (slug, author_id, body, created_at)
select (select value from t where name = 'slug'), 'ffffffff-3333-4333-8333-000000000002', 'Comment ' || n, now() - make_interval(secs => 300 - n)
from generate_series(1, 205) n;

select is(
  (select count(*)::integer from public.flp_list_comments((select value from t where name = 'slug'))),
  200,
  'at most 200 comments are listed'
);

select results_eq(
  $$ select body from public.flp_list_comments((select value from t where name = 'slug')) offset 199 $$,
  $$ values ('Comment 205'::text) $$,
  'the newest comment is listed, last'
);

select results_eq(
  $$ select body from public.flp_list_comments((select value from t where name = 'slug')) limit 1 $$,
  $$ values ('Comment 6'::text) $$,
  'the oldest ones drop off first'
);

select hasnt_function('public', 'flp_author_label', array['uuid'], 'author names come from a join, not a helper');

select * from finish();
rollback;
