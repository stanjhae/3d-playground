-- FLP F08 (#143): owned designs, immutable versions, assets, render
-- artifacts and publications.
--
-- Trust boundary: clients may only read their own rows (RLS). Every write
-- goes through the security-definer functions below, which only
-- service_role may execute. The API derives p_owner_id from a verified
-- session and has already validated + hashed content with the shared
-- canonical-document validator; the database re-checks structure,
-- ownership, references and sequencing.
--
-- Error SQLSTATEs map to HTTP in src/lib/flp-api/contract.ts:
--   FL401 unauthenticated, FL404 not found or not owned (neutral),
--   FL409 conflict, FL413 too large, FL422 invalid.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled tee'
    check (char_length(btrim(title)) between 1 and 80),
  description text not null default ''
    check (char_length(description) <= 500),
  visibility text not null default 'private'
    check (visibility in ('private', 'published')),
  head_seq integer check (head_seq >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.design_versions (
  design_id uuid not null,
  seq integer not null check (seq >= 1),
  owner_id uuid not null,
  kind text not null
    check (kind in ('autosave', 'checkpoint', 'restore', 'import')),
  label text
    check (label is null or char_length(btrim(label)) between 1 and 60),
  schema_version smallint not null check (schema_version = 2),
  content jsonb not null
    check (
      jsonb_typeof(content) = 'object'
      and content ->> 'schemaVersion' = schema_version::text
    ),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  content_bytes integer not null check (content_bytes between 2 and 2000000),
  mutation_key uuid not null,
  restored_from_seq integer,
  created_at timestamptz not null default now(),
  primary key (design_id, seq),
  unique (owner_id, mutation_key),
  foreign key (design_id, owner_id)
    references public.designs (id, owner_id) on delete cascade,
  foreign key (design_id, restored_from_seq)
    references public.design_versions (design_id, seq),
  check (
    (kind = 'restore') = (restored_from_seq is not null)
    and (restored_from_seq is null or restored_from_seq < seq)
  )
);

alter table public.designs
  add foreign key (id, head_seq)
    references public.design_versions (design_id, seq);

create table public.assets (
  id text primary key check (id ~ '^asset_[A-Za-z0-9_-]{8,64}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'staged'
    check (status in ('staged', 'ready', 'rejected')),
  mime_type text check (mime_type in ('image/png', 'image/jpeg')),
  byte_size integer check (byte_size between 1 and 10485760),
  width integer check (width between 1 and 8192),
  height integer check (height between 1 and 8192),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text check (char_length(storage_path) between 1 and 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'ready'
    or (
      mime_type is not null and byte_size is not null and width is not null
      and height is not null and sha256 is not null and storage_path is not null
    )
  )
);

create table public.render_artifacts (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null,
  version_seq integer not null,
  owner_id uuid not null,
  kind text not null check (
    kind in (
      'atlas', 'view_front', 'view_back', 'view_left', 'view_right',
      'view_three_quarter', 'og'
    )
  ),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  storage_path text check (char_length(storage_path) between 1 and 512),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (design_id, version_seq, kind),
  foreign key (design_id, owner_id)
    references public.designs (id, owner_id) on delete cascade,
  foreign key (design_id, version_seq)
    references public.design_versions (design_id, seq) on delete cascade,
  check (status <> 'ready' or (storage_path is not null and sha256 is not null))
);

-- One row per design for its lifetime, so the look URL (slug) is stable
-- across republish and is never handed to another design: deleting the
-- design keeps a revoked tombstone with design_id cleared.
create table public.publications (
  slug text primary key check (slug ~ '^[a-f0-9]{16}$'),
  design_id uuid unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  version_seq integer,
  status text not null check (status in ('published', 'revoked')),
  display_name text
    check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  published_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (design_id, owner_id)
    references public.designs (id, owner_id) on delete set null (design_id),
  foreign key (design_id, version_seq)
    references public.design_versions (design_id, seq),
  check ((status = 'published') = (version_seq is not null)),
  check (status = 'revoked' or design_id is not null)
);

create index design_versions_owner_idx on public.design_versions (owner_id);
create index designs_owner_updated_idx on public.designs (owner_id, updated_at desc);
create index assets_owner_idx on public.assets (owner_id);
create index render_artifacts_owner_idx on public.render_artifacts (owner_id);
create index publications_owner_idx on public.publications (owner_id);

-- ---------------------------------------------------------------------------
-- Immutable versions
-- ---------------------------------------------------------------------------

create function public.flp_reject_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('flp.allow_version_delete', true) = 'on' then
    return old;
  end if;

  raise exception 'design versions are immutable'
    using errcode = 'FL422';
end;
$$;

create trigger design_versions_immutable
  before update or delete on public.design_versions
  for each row execute function public.flp_reject_version_mutation();

-- ---------------------------------------------------------------------------
-- Row-level security: owners read their own rows; no direct writes.
-- ---------------------------------------------------------------------------

alter table public.designs enable row level security;
alter table public.design_versions enable row level security;
alter table public.assets enable row level security;
alter table public.render_artifacts enable row level security;
alter table public.publications enable row level security;

create policy designs_owner_read on public.designs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy design_versions_owner_read on public.design_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy assets_owner_read on public.assets
  for select to authenticated using (owner_id = (select auth.uid()));
create policy render_artifacts_owner_read on public.render_artifacts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy publications_owner_read on public.publications
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on
  public.designs, public.design_versions, public.assets,
  public.render_artifacts, public.publications
from anon, authenticated;

grant select on
  public.designs, public.design_versions, public.assets,
  public.render_artifacts, public.publications
to authenticated;

-- ---------------------------------------------------------------------------
-- Write functions (service_role only)
-- ---------------------------------------------------------------------------

create function public.flp_require_owner(p_owner_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_owner_id is null then
    raise exception 'sign in required' using errcode = 'FL401';
  end if;
end;
$$;

-- Locks and returns the design, or raises a neutral not-found for both a
-- missing design and someone else's design.
create function public.flp_lock_owned_design(p_owner_id uuid, p_design_id uuid)
returns public.designs
language plpgsql
set search_path = ''
as $$
declare
  v_design public.designs;
begin
  perform public.flp_require_owner(p_owner_id);

  select * into v_design
  from public.designs
  where id = p_design_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'design not found' using errcode = 'FL404';
  end if;

  return v_design;
end;
$$;

create function public.flp_append_version(
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

  return v_version;
end;
$$;

create function public.flp_create_design(
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
    return v_existing;
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

create function public.flp_save_version(
  p_owner_id uuid,
  p_design_id uuid,
  p_base_seq integer,
  p_mutation_key uuid,
  p_content jsonb,
  p_content_hash text,
  p_kind text default 'autosave',
  p_label text default null
)
returns public.design_versions
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind not in ('autosave', 'checkpoint') then
    raise exception 'unsupported save kind' using errcode = 'FL422';
  end if;

  return public.flp_append_version(
    public.flp_lock_owned_design(p_owner_id, p_design_id),
    p_base_seq, p_mutation_key, p_kind, p_label, p_content, p_content_hash,
    null
  );
end;
$$;

create function public.flp_restore_version(
  p_owner_id uuid,
  p_design_id uuid,
  p_base_seq integer,
  p_mutation_key uuid,
  p_from_seq integer
)
returns public.design_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_design public.designs;
  v_source public.design_versions;
begin
  v_design := public.flp_lock_owned_design(p_owner_id, p_design_id);

  select * into v_source
  from public.design_versions
  where design_id = p_design_id and seq = p_from_seq;

  if not found then
    raise exception 'version not found' using errcode = 'FL404';
  end if;

  return public.flp_append_version(
    v_design, p_base_seq, p_mutation_key, 'restore', null, v_source.content,
    v_source.content_hash, p_from_seq
  );
end;
$$;

create function public.flp_publish_version(
  p_owner_id uuid,
  p_design_id uuid,
  p_seq integer,
  p_display_name text default null
)
returns public.publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication public.publications;
begin
  perform public.flp_lock_owned_design(p_owner_id, p_design_id);

  if not exists (
    select 1 from public.design_versions
    where design_id = p_design_id and seq = p_seq
  ) then
    raise exception 'version not found' using errcode = 'FL404';
  end if;

  insert into public.publications (
    slug, design_id, owner_id, version_seq, status, display_name,
    published_at, updated_at
  )
  values (
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), p_design_id,
    p_owner_id, p_seq, 'published', nullif(btrim(p_display_name), ''), now(),
    now()
  )
  on conflict (design_id) do update
  set version_seq = excluded.version_seq,
    status = 'published',
    display_name = excluded.display_name,
    published_at = now(),
    revoked_at = null,
    updated_at = now()
  returning * into v_publication;

  update public.designs
  set visibility = 'published', updated_at = now()
  where id = p_design_id;

  return v_publication;
end;
$$;

create function public.flp_revoke_publication(
  p_owner_id uuid,
  p_design_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_lock_owned_design(p_owner_id, p_design_id);

  update public.publications
  set status = 'revoked', version_seq = null, revoked_at = now(),
    updated_at = now()
  where design_id = p_design_id and status = 'published';

  update public.designs
  set visibility = 'private', updated_at = now()
  where id = p_design_id;
end;
$$;

create function public.flp_delete_design(
  p_owner_id uuid,
  p_design_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_revoke_publication(p_owner_id, p_design_id);

  update public.designs set head_seq = null where id = p_design_id;
  perform set_config('flp.allow_version_delete', 'on', true);
  delete from public.designs where id = p_design_id;
  perform set_config('flp.allow_version_delete', 'off', true);
end;
$$;

revoke all on function
  public.flp_reject_version_mutation(),
  public.flp_require_owner(uuid),
  public.flp_lock_owned_design(uuid, uuid),
  public.flp_append_version(
    public.designs, integer, uuid, text, text, jsonb, text, integer
  ),
  public.flp_create_design(uuid, uuid, jsonb, text, text),
  public.flp_save_version(uuid, uuid, integer, uuid, jsonb, text, text, text),
  public.flp_restore_version(uuid, uuid, integer, uuid, integer),
  public.flp_publish_version(uuid, uuid, integer, text),
  public.flp_revoke_publication(uuid, uuid),
  public.flp_delete_design(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.flp_create_design(uuid, uuid, jsonb, text, text),
  public.flp_save_version(uuid, uuid, integer, uuid, jsonb, text, text, text),
  public.flp_restore_version(uuid, uuid, integer, uuid, integer),
  public.flp_publish_version(uuid, uuid, integer, text),
  public.flp_revoke_publication(uuid, uuid),
  public.flp_delete_design(uuid, uuid)
to service_role;
