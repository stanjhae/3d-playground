-- Who can use the internal admin app (apps/admin).
--
-- One row per admin account. The admin app's server functions check this
-- table with the service role on every request; nothing else reads it, and
-- no one can add themselves. An operator grants access in the SQL editor
-- (docs/admin.md):
--
--   insert into public.admins (user_id, note)
--   select id, 'founder' from auth.users where email = '<their email>';
--
-- Deleting the account removes its admin row.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) between 1 and 80),
  granted_at timestamptz not null default now()
);

alter table public.admins enable row level security;

revoke all on public.admins from public, anon, authenticated;
grant select, insert, delete on public.admins to service_role;
