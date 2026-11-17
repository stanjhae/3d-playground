begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, created_at) values
  ('ffffffff-2222-4222-8222-000000000001', 'cf-owner@example.test', now() - interval '90 days'),
  ('ffffffff-2222-4222-8222-000000000002', 'cf-fan@example.test', now() - interval '90 days'),
  ('ffffffff-2222-4222-8222-000000000003', 'cf-stranger@example.test', now() - interval '90 days');

create temp table t (name text primary key, value text);

do $$
declare
  owner uuid := 'ffffffff-2222-4222-8222-000000000001';
  v public.design_versions;
  kind text;
begin
  v := public.flp_create_design(owner, gen_random_uuid(),
    '{"schemaVersion":2,"template":{"id":"tee-crew-short","version":5}}', 'sha256:' || repeat('a', 64), 'Commented tee');
  foreach kind in array array['view_front', 'view_three_quarter', 'view_back'] loop
    insert into public.render_artifacts (design_id, version_seq, owner_id, kind, status, storage_path, sha256)
    values (v.design_id, 1, owner, kind, 'ready', 'p/' || kind, repeat('b', 64));
  end loop;
  insert into t values ('slug', (public.flp_publish_version(owner, v.design_id, 1)).slug);
  insert into t values ('design', v.design_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

insert into t values ('fan-comment', public.flp_add_comment('ffffffff-2222-4222-8222-000000000002', (select value from t where name = 'slug'), '  Love the sleeves  ')::text);
insert into t values ('stranger-comment', public.flp_add_comment('ffffffff-2222-4222-8222-000000000003', (select value from t where name = 'slug'), 'Buy followers here')::text);
-- One transaction stamps both with the same time; space them as real requests would be.
update public.publication_comments set created_at = created_at + interval '1 second'
where id = (select value from t where name = 'stranger-comment')::uuid;

select results_eq(
  format($$ select body, mine, can_hide from public.flp_list_comments(%L, 'ffffffff-2222-4222-8222-000000000002') $$, (select value from t where name = 'slug')),
  $$ values ('Love the sleeves'::text, true, true), ('Buy followers here', false, false) $$,
  'comments are trimmed, oldest first; the author may hide only their own'
);

select results_eq(
  format($$ select bool_and(can_hide) from public.flp_list_comments(%L, 'ffffffff-2222-4222-8222-000000000001') $$, (select value from t where name = 'slug')),
  $$ values (true) $$,
  'the design''s owner may hide any comment on it'
);

select results_eq(
  format($$ select count(*)::integer, bool_or(mine) from public.flp_list_comments(%L) $$, (select value from t where name = 'slug')),
  $$ values (2, false) $$,
  'signed out, comments read with nothing marked as yours'
);

select results_eq(
  format($$ select author_name, author_handle from public.flp_list_comments(%L) limit 1 $$, (select value from t where name = 'slug')),
  $$ values (null::text, null::text) $$,
  'an author without a public profile shows no name or handle'
);

select throws_ok(
  format($$ select public.flp_add_comment('ffffffff-2222-4222-8222-000000000002', %L, '   ') $$, (select value from t where name = 'slug')),
  'FL422',
  'a comment must be 1 to 500 characters',
  'an empty comment is refused'
);

select throws_ok(
  format($$ select public.flp_add_comment('ffffffff-2222-4222-8222-000000000002', %L, %L) $$, (select value from t where name = 'slug'), repeat('x', 501)),
  'FL422',
  'a comment must be 1 to 500 characters',
  'a comment over 500 characters is refused'
);

select throws_ok(
  $$ select public.flp_add_comment('ffffffff-2222-4222-8222-000000000002', '0000000000000000', 'Hi') $$,
  'FL404',
  'publication not found',
  'nobody comments on a design that isn''t live'
);

select throws_ok(
  format($$ select public.flp_hide_comment('ffffffff-2222-4222-8222-000000000003', %L, %L::uuid) $$,
    (select value from t where name = 'slug'), (select value from t where name = 'fan-comment')),
  'FL404',
  'comment not found',
  'a stranger cannot hide someone else''s comment'
);

select lives_ok(
  format($$ select public.flp_hide_comment('ffffffff-2222-4222-8222-000000000001', %L, %L::uuid) $$,
    (select value from t where name = 'slug'), (select value from t where name = 'stranger-comment')),
  'the owner hides a comment on their design'
);

select results_eq(
  format($$ select body from public.flp_list_comments(%L) $$, (select value from t where name = 'slug')),
  $$ values ('Love the sleeves'::text) $$,
  'a hidden comment is no longer listed'
);

select results_eq(
  format($$ select hidden_by from public.publication_comments where id = %L::uuid $$, (select value from t where name = 'stranger-comment')),
  $$ values ('owner'::text) $$,
  'who hid it is kept'
);

select lives_ok(
  format($$ select public.flp_hide_comment('ffffffff-2222-4222-8222-000000000002', %L, %L::uuid) $$,
    (select value from t where name = 'slug'), (select value from t where name = 'fan-comment')),
  'an author takes their own comment down'
);

select lives_ok(
  format($$ select public.flp_hide_comment_operator(%L::uuid, 'operator') $$, (select value from t where name = 'fan-comment')),
  'an operator hiding an already hidden comment changes nothing'
);

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.flp_set_follow('ffffffff-2222-4222-8222-000000000002', 'cf-owner', true) $$,
  'FL404',
  'profile not found',
  'a handle that isn''t public cannot be followed'
);

select public.flp_set_public_profile('ffffffff-2222-4222-8222-000000000001', 'cf-owner', true);

select results_eq(
  $$ select followers, following from public.flp_set_follow('ffffffff-2222-4222-8222-000000000002', 'CF-Owner', true) $$,
  $$ values (1, true) $$,
  'following a public profile counts once'
);

select results_eq(
  $$ select followers, following from public.flp_set_follow('ffffffff-2222-4222-8222-000000000002', 'cf-owner', true) $$,
  $$ values (1, true) $$,
  'following again changes nothing'
);

select throws_ok(
  $$ select * from public.flp_set_follow('ffffffff-2222-4222-8222-000000000001', 'cf-owner', true) $$,
  'FL409',
  'you cannot follow yourself',
  'nobody follows themselves'
);

select results_eq(
  $$ select slug from public.flp_following_board('ffffffff-2222-4222-8222-000000000002') $$,
  $$ select value from t where name = 'slug' $$,
  'the Following list shows designs by people you follow'
);

select is(
  (select count(*)::integer from public.flp_following_board('ffffffff-2222-4222-8222-000000000003')),
  0,
  'someone who follows nobody sees nothing'
);

select public.flp_set_public_profile('ffffffff-2222-4222-8222-000000000001', 'cf-owner', false);

select is(
  (select count(*)::integer from public.flp_following_board('ffffffff-2222-4222-8222-000000000002')),
  0,
  'a profile made private leaves the Following list'
);

select public.flp_set_public_profile('ffffffff-2222-4222-8222-000000000001', 'cf-owner', true);

select results_eq(
  $$ select own from public.flp_follow_state('cf-owner', 'ffffffff-2222-4222-8222-000000000001') $$,
  $$ values (true) $$,
  'the owner is told the profile is their own'
);

select results_eq(
  $$ select followers, following from public.flp_set_follow('ffffffff-2222-4222-8222-000000000002', 'cf-owner', false) $$,
  $$ values (0, false) $$,
  'unfollowing removes the follow'
);

-- ---------------------------------------------------------------------------
-- Reports on comments
-- ---------------------------------------------------------------------------

insert into t values ('third', public.flp_add_comment('ffffffff-2222-4222-8222-000000000003', (select value from t where name = 'slug'), 'Spam again')::text);
select public.flp_report_publication('ffffffff-2222-4222-8222-000000000002', (select value from t where name = 'slug'), 'other');
select public.flp_report_comment('ffffffff-2222-4222-8222-000000000002', (select value from t where name = 'slug'), (select value from t where name = 'third')::uuid, 'spam');
select public.flp_report_comment('ffffffff-2222-4222-8222-000000000002', (select value from t where name = 'slug'), (select value from t where name = 'third')::uuid, 'spam');

select results_eq(
  format($$ select count(*)::integer, count(comment_id)::integer from public.publication_reports where slug = %L $$, (select value from t where name = 'slug')),
  $$ values (2, 1) $$,
  'a design report and a comment report stand side by side, each once'
);

select throws_ok(
  format($$ select public.flp_report_comment('ffffffff-2222-4222-8222-000000000002', %L, %L::uuid, 'spam') $$,
    (select value from t where name = 'slug'), (select value from t where name = 'fan-comment')),
  'FL404',
  'comment not found',
  'a hidden comment cannot be reported'
);

select ok(
  not has_function_privilege('anon', 'public.flp_list_comments(text, uuid, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.flp_set_follow(uuid, text, boolean)', 'execute')
    and not has_table_privilege('authenticated', 'public.publication_comments', 'select')
    and not has_table_privilege('authenticated', 'public.follows', 'select'),
  'only the server reads and writes comments and follows'
);

select * from finish();
rollback;
