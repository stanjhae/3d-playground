-- FLP A06 (#150): a publication keeps the title it was published with.
--
-- The public page used to read the design's live title, so renaming a
-- design after publishing changed what the public saw. The published
-- version is pinned; its title is now pinned with it and only changes when
-- the owner publishes again.

alter table public.publications
  add column title text
    check (title is null or char_length(btrim(title)) between 1 and 80);

update public.publications p
set title = d.title
from public.designs d
where d.id = p.design_id and p.title is null;

create or replace function public.flp_publish_version(
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
  v_design public.designs;
  v_publication public.publications;
begin
  v_design := public.flp_lock_owned_design(p_owner_id, p_design_id);

  if not exists (
    select 1 from public.design_versions
    where design_id = p_design_id and seq = p_seq
  ) then
    raise exception 'version not found' using errcode = 'FL404';
  end if;

  insert into public.publications (
    slug, design_id, owner_id, version_seq, status, display_name, title,
    published_at, updated_at
  )
  values (
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), p_design_id,
    p_owner_id, p_seq, 'published', nullif(btrim(p_display_name), ''),
    v_design.title, now(), now()
  )
  on conflict (design_id) do update
  set version_seq = excluded.version_seq,
    status = 'published',
    display_name = excluded.display_name,
    title = excluded.title,
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

revoke all on function public.flp_publish_version(uuid, uuid, integer, text)
from public, anon, authenticated;

grant execute on function public.flp_publish_version(uuid, uuid, integer, text)
to service_role;
