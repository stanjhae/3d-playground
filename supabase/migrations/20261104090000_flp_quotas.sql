-- FLP S09 (#178) and Q02 (#187): quotas, autosave retention, rate limits
-- and an auditable orphan listing.
--
-- Limits (alpha):
--   20 designs per account
--   100 named checkpoints per design
--   100 most recent autosaves per design are kept; older ones are pruned
--     unless they are the head, published, rendered, or a restore source
--   100 MB of ready uploaded images per account
--
-- A full quota raises FL429 (mapped to `quota_exceeded`). Nothing is
-- evicted silently except autosave history beyond the retention window,
-- which never removes a version anything points at.

-- ---------------------------------------------------------------------------
-- Designs per account
-- ---------------------------------------------------------------------------

create or replace function public.flp_create_design(
  p_owner_id uuid,
  p_mutation_key uuid,
  p_content jsonb,
  p_content_hash text,
  p_title text default null
)
returns public.design_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.design_versions;
  v_design public.designs;
begin
  perform public.flp_require_owner(p_owner_id);

  select * into v_existing
  from public.design_versions
  where owner_id = p_owner_id and mutation_key = p_mutation_key;

  if found then
    if v_existing.seq <> 1 or v_existing.content_hash <> p_content_hash then
      raise exception 'mutation key reused with different content'
        using errcode = 'FL409';
    end if;

    return v_existing;
  end if;

  -- Serializes creates per account, so two at 19 designs cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('flp:designs:' || p_owner_id::text, 0));

  if (select count(*) from public.designs where owner_id = p_owner_id) >= 20 then
    raise exception 'You have 20 designs, the most an account can keep. Delete one to create another.'
      using errcode = 'FL429';
  end if;

  insert into public.designs (owner_id, title)
  values (p_owner_id, coalesce(nullif(btrim(p_title), ''), 'Untitled tee'))
  returning * into v_design;

  return public.flp_append_version(
    v_design, null, p_mutation_key, 'checkpoint', null, p_content,
    p_content_hash, null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkpoints and autosave retention (callers hold the design row lock)
-- ---------------------------------------------------------------------------

create or replace function public.flp_append_version(
  p_design public.designs,
  p_base_seq integer,
  p_mutation_key uuid,
  p_kind text,
  p_label text,
  p_content jsonb,
  p_content_hash text,
  p_restored_from_seq integer
)
returns public.design_versions
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.design_versions;
  v_version public.design_versions;
  v_bytes integer := octet_length(p_content::text);
begin
  -- Idempotent retry: the same mutation key returns the version it made.
  select * into v_existing
  from public.design_versions
  where owner_id = p_design.owner_id and mutation_key = p_mutation_key;

  if found then
    if v_existing.design_id <> p_design.id then
      raise exception 'mutation key already used' using errcode = 'FL409';
    end if;

    if v_existing.content_hash <> p_content_hash
      or v_existing.kind <> p_kind
      or v_existing.restored_from_seq is distinct from p_restored_from_seq then
      raise exception 'mutation key reused with different content'
        using errcode = 'FL409';
    end if;

    return v_existing;
  end if;

  if p_design.head_seq is distinct from p_base_seq then
    raise exception 'stale base version'
      using errcode = 'FL409',
        detail = json_build_object('headSeq', p_design.head_seq)::text;
  end if;

  if v_bytes > 2000000 then
    raise exception 'content too large' using errcode = 'FL413';
  end if;

  if p_kind = 'checkpoint' and p_label is not null and (
    select count(*) from public.design_versions
    where design_id = p_design.id and kind = 'checkpoint' and label is not null
  ) >= 100 then
    raise exception 'This design has 100 named checkpoints, the most it can keep.'
      using errcode = 'FL429';
  end if;

  insert into public.design_versions (
    design_id, seq, owner_id, kind, label, schema_version, content,
    content_hash, content_bytes, mutation_key, restored_from_seq
  )
  values (
    p_design.id, coalesce(p_design.head_seq, 0) + 1, p_design.owner_id,
    p_kind, p_label, 2, p_content, p_content_hash, v_bytes, p_mutation_key,
    p_restored_from_seq
  )
  returning * into v_version;

  update public.designs
  set head_seq = v_version.seq, updated_at = now()
  where id = p_design.id;

  if p_kind = 'autosave' then
    perform public.flp_prune_autosaves(p_design.id);
  end if;

  return v_version;
end;
$$;

create function public.flp_prune_autosaves(p_design_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_pruned integer;
begin
  perform set_config('flp.allow_version_delete', 'on', true);

  with keep_recent as (
    select seq from public.design_versions
    where design_id = p_design_id and kind = 'autosave'
    order by seq desc
    limit 100
  )
  delete from public.design_versions v
  where v.design_id = p_design_id
    and v.kind = 'autosave'
    and v.seq not in (select seq from keep_recent)
    and v.seq <> (select head_seq from public.designs where id = p_design_id)
    and not exists (
      select 1 from public.publications p
      where p.design_id = p_design_id and p.version_seq = v.seq
    )
    and not exists (
      select 1 from public.render_artifacts r
      where r.design_id = p_design_id and r.version_seq = v.seq
    )
    and not exists (
      select 1 from public.design_versions s
      where s.design_id = p_design_id and s.restored_from_seq = v.seq
    );

  get diagnostics v_pruned = row_count;
  perform set_config('flp.allow_version_delete', 'off', true);
  return v_pruned;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uploaded image storage per account
-- ---------------------------------------------------------------------------

create function public.flp_guard_asset_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ready' and old.status <> 'ready' then
    perform pg_advisory_xact_lock(hashtextextended('flp:assets:' || new.owner_id::text, 0));

    if coalesce((
      select sum(byte_size) from public.assets
      where owner_id = new.owner_id and status = 'ready' and id <> new.id
    ), 0) + new.byte_size > 104857600 then
      raise exception 'Your uploaded images use the 100 MB this account can keep. Delete designs that use images you no longer need.'
        using errcode = 'FL429';
    end if;
  end if;

  return new;
end;
$$;

create trigger assets_guard_quota
  before update on public.assets
  for each row execute function public.flp_guard_asset_quota();

-- ---------------------------------------------------------------------------
-- Rate limits: fixed windows per account and bucket
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  owner_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 32),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (owner_id, bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- Takes one request from the current window. Returns the seconds to wait
-- when the bucket is empty, or 0 when the request may proceed.
create function public.flp_take_token(
  p_owner_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count integer;
begin
  perform public.flp_require_owner(p_owner_id);

  insert into public.rate_limits (owner_id, bucket, window_start, count)
  values (p_owner_id, p_bucket, v_window, 1)
  on conflict (owner_id, bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  delete from public.rate_limits
  where owner_id = p_owner_id and bucket = p_bucket
    and window_start < v_window - make_interval(secs => p_window_seconds);

  if v_count > p_limit then
    return greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
  end if;

  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orphaned uploads: listed for an audited cleanup, never deleted here
-- ---------------------------------------------------------------------------

-- Uploads no version of their owner's designs references, older than the
-- grace window (a staged upload may be about to be placed).
create function public.flp_orphan_assets(p_grace interval default interval '24 hours')
returns table (id text, owner_id uuid, status text, storage_path text, byte_size integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.owner_id, a.status, a.storage_path, a.byte_size, a.created_at
  from public.assets a
  where a.created_at <= now() - p_grace
    and not exists (
      select 1 from public.design_versions v
      where v.owner_id = a.owner_id
        and strpos(v.content::text, '"' || a.id || '"') > 0
    )
  order by a.created_at;
$$;

revoke all on function
  public.flp_create_design(uuid, uuid, jsonb, text, text),
  public.flp_append_version(public.designs, integer, uuid, text, text, jsonb, text, integer),
  public.flp_prune_autosaves(uuid),
  public.flp_guard_asset_quota(),
  public.flp_take_token(uuid, text, integer, integer),
  public.flp_orphan_assets(interval)
from public, anon, authenticated;

grant execute on function
  public.flp_create_design(uuid, uuid, jsonb, text, text),
  public.flp_take_token(uuid, text, integer, integer),
  public.flp_orphan_assets(interval)
to service_role;
