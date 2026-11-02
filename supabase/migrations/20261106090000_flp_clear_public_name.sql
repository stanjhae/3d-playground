-- FLP A06 (#150): clearing the public name takes it off live publications.
--
-- A publication keeps the name it was published with, and setting a new
-- name still waits for the next publish. Clearing is different: the studio
-- says published designs show no name, and someone removing their name
-- shouldn't have to republish every design for that to be true. Both changes
-- happen in one transaction.

create or replace function public.flp_set_display_name(
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

  if v_profile.display_name is null then
    update public.publications
    set display_name = null
    where owner_id = p_owner_id and display_name is not null;
  end if;

  return v_profile;
end;
$$;
