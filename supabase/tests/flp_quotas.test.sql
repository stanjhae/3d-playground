begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('cccccccc-8888-4888-8888-888888888888', 'quota@example.test');

-- 20 designs is the most an account can keep.
select lives_ok(
  $$
    select public.flp_create_design(
      'cccccccc-8888-4888-8888-888888888888', gen_random_uuid(),
      '{"schemaVersion":2}', 'sha256:' || repeat('c', 64), 'Design ' || n
    ) from generate_series(1, 20) n
  $$,
  'an account creates 20 designs'
);

select throws_ok(
  $$
    select public.flp_create_design(
      'cccccccc-8888-4888-8888-888888888888', gen_random_uuid(),
      '{"schemaVersion":2}', 'sha256:' || repeat('c', 64), 'One too many'
    )
  $$,
  'FL429', null,
  'the 21st design is refused with a quota error'
);

create temp table ids (name text primary key, id uuid);
insert into ids select 'design', id from public.designs
where owner_id = 'cccccccc-8888-4888-8888-888888888888' order by created_at limit 1;

select lives_ok(
  format(
    $$ select public.flp_create_design('cccccccc-8888-4888-8888-888888888888', %L, '{"schemaVersion":2}', 'sha256:' || repeat('c', 64)) $$,
    (select mutation_key from public.design_versions where design_id = (select id from ids) and seq = 1)
  ),
  'retrying an earlier create is still idempotent at the limit'
);

-- Autosave retention: 105 autosaves on one design keep the newest 100,
-- the published one and a restore source.
do $$
declare
  d uuid := (select id from ids);
  owner uuid := 'cccccccc-8888-4888-8888-888888888888';
  i integer;
begin
  for i in 1..5 loop
    perform public.flp_save_version(
      owner, d, (select head_seq from public.designs where id = d), gen_random_uuid(),
      jsonb_build_object('schemaVersion', 2, 'n', i), 'sha256:' || lpad(to_hex(i), 64, '0')
    );
  end loop;

  -- v3 published, v4 restored from later.
  perform public.flp_publish_version(owner, d, 3);
  perform public.flp_restore_version(owner, d, (select head_seq from public.designs where id = d), gen_random_uuid(), 4);

  for i in 6..110 loop
    perform public.flp_save_version(
      owner, d, (select head_seq from public.designs where id = d), gen_random_uuid(),
      jsonb_build_object('schemaVersion', 2, 'n', i), 'sha256:' || lpad(to_hex(i), 64, '0')
    );
  end loop;
end;
$$;

select is(
  (select count(*)::integer from public.design_versions where design_id = (select id from ids) and kind = 'autosave'),
  102,
  'the newest 100 autosaves are kept, plus the published one and the restore source'
);

select ok(
  exists (select 1 from public.design_versions where design_id = (select id from ids) and seq = 3),
  'the published version is never pruned'
);

select ok(
  exists (select 1 from public.design_versions where design_id = (select id from ids) and seq = 4),
  'a restore source is never pruned'
);

select ok(
  exists (select 1 from public.design_versions where design_id = (select id from ids) and seq = 1),
  'the first checkpoint is never pruned'
);

select ok(
  not exists (select 1 from public.design_versions where design_id = (select id from ids) and seq = 2),
  'the oldest unreferenced autosave was pruned'
);

select is(
  (select head_seq from public.designs where id = (select id from ids)),
  (select max(seq) from public.design_versions where design_id = (select id from ids)),
  'the head is still the newest version'
);

-- Named checkpoints: 100 per design.
do $$
declare
  d uuid := (select id from ids);
  owner uuid := 'cccccccc-8888-4888-8888-888888888888';
  i integer;
begin
  for i in 1..100 loop
    perform public.flp_save_version(
      owner, d, (select head_seq from public.designs where id = d), gen_random_uuid(),
      jsonb_build_object('schemaVersion', 2, 'c', i), 'sha256:' || lpad(to_hex(1000 + i), 64, '0'),
      'checkpoint', 'Named ' || i
    );
  end loop;
end;
$$;

select throws_ok(
  format(
    $$ select public.flp_save_version('cccccccc-8888-4888-8888-888888888888', %L, %s, gen_random_uuid(), '{"schemaVersion":2,"c":0}', 'sha256:' || repeat('e', 64), 'checkpoint', 'One more') $$,
    (select id from ids), (select head_seq from public.designs where id = (select id from ids))
  ),
  'FL429', null,
  'the 101st named checkpoint is refused'
);

-- Upload quota: 100 MB of ready images (ten full 10 MB uploads).
insert into public.assets (id, owner_id)
select 'asset_quota_' || lpad(n::text, 8, '0'), 'cccccccc-8888-4888-8888-888888888888'
from generate_series(1, 11) n;

select lives_ok(
  $$ update public.assets set status = 'ready', mime_type = 'image/png', byte_size = 10485760,
       width = 10, height = 10, sha256 = repeat('a', 64),
       storage_path = owner_id::text || '/' || id || '/normalized'
     where id <> 'asset_quota_00000011' and owner_id = 'cccccccc-8888-4888-8888-888888888888' $$,
  'uploads up to exactly 100 MB settle'
);

select throws_ok(
  $$ update public.assets set status = 'ready', mime_type = 'image/png', byte_size = 1,
       width = 10, height = 10, sha256 = repeat('b', 64),
       storage_path = owner_id::text || '/' || id || '/normalized'
     where id = 'asset_quota_00000011' $$,
  'FL429', null,
  'an upload past 100 MB is refused'
);

-- Rate limits.
select is(
  (select array_agg(public.flp_take_token('cccccccc-8888-4888-8888-888888888888', 'test', 2, 60) > 0 order by n)
   from generate_series(1, 3) n),
  array[false, false, true],
  'the third request in a window of two must wait'
);

-- Orphans: the unreferenced upload is listed once past the grace window.
select ok(
  exists (select 1 from public.flp_orphan_assets(interval '0 seconds') where id = 'asset_quota_00000001'),
  'an unreferenced upload is listed as an orphan'
);

select * from finish();
rollback;
