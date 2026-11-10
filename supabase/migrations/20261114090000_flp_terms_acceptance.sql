-- Terms of use acceptance (P1).
--
-- Additive and nullable: two new columns on public.profiles and one new
-- function. Existing rows keep null in both, which the app reads as "not
-- yet accepted", so every existing account is asked once. An account that
-- has never set a public name has no profiles row; accepting creates it.
--
-- The previous build never reads these columns, and flp_set_display_name
-- only writes display_name and updated_at, so it leaves them alone.

alter table public.profiles
  add column terms_version text,
  add column terms_accepted_at timestamptz;

-- Both or neither: a version without a time (or the reverse) is a bug.
alter table public.profiles
  add constraint profiles_terms_pair
    check ((terms_version is null) = (terms_accepted_at is null)),
  add constraint profiles_terms_version_shape
    check (terms_version is null or char_length(terms_version) between 1 and 32);

-- Records that the account accepted terms version p_version, now. Accepting
-- the same version again keeps the first time; a new version replaces it.
create function public.flp_accept_terms(
  p_owner_id uuid,
  p_version text
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

  if p_version is null or char_length(btrim(p_version)) not between 1 and 32 then
    raise exception 'terms version must be 1 to 32 characters' using errcode = 'FL422';
  end if;

  insert into public.profiles (owner_id, terms_version, terms_accepted_at, updated_at)
  values (p_owner_id, btrim(p_version), now(), now())
  on conflict (owner_id) do update
  set
    terms_accepted_at = case
      when public.profiles.terms_version is not distinct from excluded.terms_version
        then public.profiles.terms_accepted_at
      else excluded.terms_accepted_at
    end,
    terms_version = excluded.terms_version,
    updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.flp_accept_terms(uuid, text) from public, anon, authenticated;
grant execute on function public.flp_accept_terms(uuid, text) to service_role;
