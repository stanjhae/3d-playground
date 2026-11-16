-- Workflow 1 (pattern v1): draped pattern meshes.
--
-- A design in Pattern mode is its sewing pattern draped by the studio's
-- cloth solver. The settled mesh is stored once per owner, pattern hash and
-- solver version, so a reload, share page or publish never re-simulates,
-- and an edit that leaves the pattern alone reuses the mesh it has.
--
-- The file lives in the private design-assets bucket at
-- <owner>/meshes/<hash>-s<solver>.flpm: owner-read like every upload,
-- removed with the account, and written only through server-signed
-- uploads that the API checks (FLPM header, pattern hash, size) before a
-- row turns ready. Additive only: no existing row or column changes.

-- Meshes are FLPM binaries; images stay PNG or JPEG and are still checked
-- byte by byte when an asset is finalized.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'application/octet-stream']
where id = 'design-assets';

create table public.pattern_meshes (
  owner_id uuid not null references auth.users (id) on delete cascade,
  pattern_hash text not null check (pattern_hash ~ '^sha256:[0-9a-f]{64}$'),
  solver_version integer not null check (solver_version between 1 and 999),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  storage_path text not null check (char_length(storage_path) between 1 and 512),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer check (byte_size between 1 and 1048576),
  created_at timestamptz not null default now(),
  primary key (owner_id, pattern_hash, solver_version),
  check (status <> 'ready' or (sha256 is not null and byte_size is not null))
);

alter table public.pattern_meshes enable row level security;

create policy pattern_meshes_owner_read on public.pattern_meshes
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.pattern_meshes from public, anon, authenticated;
grant select on public.pattern_meshes to authenticated;
grant all on public.pattern_meshes to service_role;

-- 300 meshes per account (each at most 1 MiB): every distinct pattern an
-- owner drapes and saves, across all their designs.
create function public.flp_guard_pattern_mesh_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('flp:meshes:' || new.owner_id::text, 0));

  if (select count(*) from public.pattern_meshes where owner_id = new.owner_id) >= 300 then
    raise exception 'This account keeps 300 draped patterns, the most it can. Delete designs you no longer need.'
      using errcode = 'FL429';
  end if;

  return new;
end;
$$;

revoke all on function public.flp_guard_pattern_mesh_quota() from public, anon, authenticated;

create trigger pattern_meshes_guard_quota
  before insert on public.pattern_meshes
  for each row execute function public.flp_guard_pattern_mesh_quota();
