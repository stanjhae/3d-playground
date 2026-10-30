-- FLP A07 (#151): deleting an account (auth.users) must remove everything
-- it owns. The version-immutability trigger refused the cascade from
-- designs into design_versions, so `auth.admin.deleteUser` failed for any
-- user who owned a design.
--
-- A delete that arrives through a foreign-key cascade runs inside the RI
-- action trigger, so pg_trigger_depth() > 1. A direct DELETE (client,
-- REST, SQL) runs at depth 1 and is still refused. flp_delete_design keeps
-- its explicit flag as well.

create or replace function public.flp_reject_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and (
      current_setting('flp.allow_version_delete', true) = 'on'
      or pg_trigger_depth() > 1
    ) then
    return old;
  end if;

  raise exception 'design versions are immutable'
    using errcode = 'FL422';
end;
$$;

revoke all on function public.flp_reject_version_mutation()
from public, anon, authenticated;
