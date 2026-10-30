-- FLP S01 (#170) / S02 (#171): staged → ready | rejected asset lifecycle.
--
-- The API reserves a `staged` row, the browser uploads the original to a
-- signed URL, and finalize validates and normalizes the bytes server-side
-- before marking the row `ready` (or `rejected` with a reason). Once
-- settled a row never changes again, so a saved document can rely on a
-- ready asset's hash, dimensions and storage path.

alter table public.assets
  add column rejection_reason text
    check (
      rejection_reason in (
        'unsupported_type', 'too_large', 'dimensions', 'animated', 'corrupt'
      )
    ),
  add constraint assets_rejection_reason_matches_status
    check ((status = 'rejected') = (rejection_reason is not null)),
  -- `asset_lib_*` names built-in library graphics, which have no row.
  add constraint assets_not_library_id
    check (id !~ '^asset_lib_'),
  -- Normalized originals live under the owner's private prefix.
  add constraint assets_storage_path_owned
    check (storage_path is null or storage_path like owner_id::text || '/' || id || '/%');

create function public.flp_guard_asset_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'staged' then
    raise exception 'settled assets are immutable'
      using errcode = 'FL422';
  end if;

  if new.id <> old.id or new.owner_id <> old.owner_id
    or new.created_at <> old.created_at then
    raise exception 'asset identity is immutable'
      using errcode = 'FL422';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger assets_guard_transition
  before update on public.assets
  for each row execute function public.flp_guard_asset_transition();

revoke all on function public.flp_guard_asset_transition() from public, anon, authenticated;
