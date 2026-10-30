-- FLP A06 (#150) and A07 (#151): editable design details and a chosen
-- public identity.
--
-- 1. flp_update_design renames a design or changes its description. It is
--    not a version: title and description are design metadata, so the
--    history and the published version are untouched.
-- 2. profiles holds the name an account shows on published designs. The
--    publish panel pre-fills it; each publication still stores its own copy.

create function public.flp_update_design(
  p_owner_id uuid,
  p_design_id uuid,
  p_title text default null,
  p_description text default null
)
returns public.designs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_design public.designs;
begin
  perform public.flp_lock_owned_design(p_owner_id, p_design_id);

  if p_title is not null and char_length(btrim(p_title)) not between 1 and 80 then
    raise exception 'title must be 1 to 80 characters' using errcode = 'FL422';
  end if;

  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'description must be at most 500 characters' using errcode = 'FL422';
  end if;

  update public.designs
  set title = coalesce(btrim(p_title), title),
    description = coalesce(p_description, description),
    updated_at = now()
  where id = p_design_id
  returning * into v_design;

  return v_design;
end;
$$;

create table public.profiles (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_owner_read on public.profiles
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

create function public.flp_set_display_name(
  p_owner_id uuid,
  p_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  perform public.flp_require_owner(p_owner_id);

  if p_display_name is not null and char_length(btrim(p_display_name)) > 40 then
    raise exception 'display name must be at most 40 characters' using errcode = 'FL422';
  end if;

  insert into public.profiles (owner_id, display_name, updated_at)
  values (p_owner_id, nullif(btrim(p_display_name), ''), now())
  on conflict (owner_id) do update
  set display_name = excluded.display_name, updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function
  public.flp_update_design(uuid, uuid, text, text),
  public.flp_set_display_name(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.flp_update_design(uuid, uuid, text, text),
  public.flp_set_display_name(uuid, text)
to service_role;
