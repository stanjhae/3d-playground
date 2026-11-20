-- Vote integrity signals (PRD V1). A vote can carry a device token,
-- which is a hash of an id this browser keeps, not a fingerprint of the
-- machine. The audit log records two signs for an operator to read:
-- the same device voting from three or more accounts, and one account
-- casting eight or more votes in ten minutes. A sign does not remove
-- the vote. Phone checks are not here: there is no phone provider.

create table public.vote_signals (
  slug text not null references public.publications (slug) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  device_token text,
  created_at timestamptz not null default now(),
  primary key (slug, voter_id)
);

create index vote_signals_device_idx on public.vote_signals (device_token)
  where device_token is not null;

create table public.vote_audit (
  slug text not null references public.publications (slug) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  flag text not null check (flag in ('shared-device', 'vote-burst')),
  detail text,
  created_at timestamptz not null default now(),
  primary key (slug, voter_id, flag)
);

create index vote_audit_created_idx on public.vote_audit (created_at desc);

alter table public.vote_signals enable row level security;
alter table public.vote_audit enable row level security;

revoke all on public.vote_signals from public, anon, authenticated;
revoke all on public.vote_audit from public, anon, authenticated;
