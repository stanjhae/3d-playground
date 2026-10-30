-- FLP A04 (#148) and S03 (#172): owner isolation hardening.
--
-- 1. A reused mutation key must carry the same content. Retrying the same
--    save is idempotent; reusing a key for different content is a 409.
-- 2. A private bucket for original uploads, readable only by its owner.
--    Objects live under `<owner_id>/…`. There are no client write
--    policies: uploads go through server-issued signed URLs (S01 #170).

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

  insert into public.designs (owner_id, title)
  values (p_owner_id, coalesce(nullif(btrim(p_title), ''), 'Untitled tee'))
  returning * into v_design;

  return public.flp_append_version(
    v_design, null, p_mutation_key, 'checkpoint', null, p_content,
    p_content_hash, null
  );
end;
$$;

-- `create or replace` keeps existing grants, but restate them so this file
-- is correct on its own.
revoke all on function
  public.flp_append_version(
    public.designs, integer, uuid, text, text, jsonb, text, integer
  ),
  public.flp_create_design(uuid, uuid, jsonb, text, text)
from public, anon, authenticated;

grant execute on function
  public.flp_create_design(uuid, uuid, jsonb, text, text)
to service_role;

-- ---------------------------------------------------------------------------
-- Private storage for original uploads
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-assets', 'design-assets', false, 10485760, array['image/png', 'image/jpeg'])
on conflict (id) do update
set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy design_assets_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'design-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
