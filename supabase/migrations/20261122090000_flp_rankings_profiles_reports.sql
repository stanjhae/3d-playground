-- FLP V2: rankings by window and garment, opt-in public profiles, vote
-- rules, and reports.
--
-- Vote rules (docs/abuse.md):
--   * nobody votes for their own design (FL409, the "conflict" error);
--   * a vote counts once the voter's account is `min_account_age` old
--     (24 hours on hosted projects). Younger accounts may still vote; the
--     vote is kept and starts counting by itself, so nobody is refused.
-- Every count (the share page, the board, a profile) goes through
-- flp_counted_votes so the numbers always agree.
--
-- Additive: new tables, columns and functions. flp_vote_state and
-- flp_cast_vote keep their signatures; the old flp_board stays for builds
-- that still call it.

-- ---------------------------------------------------------------------------
-- Vote rules
-- ---------------------------------------------------------------------------

create table public.vote_rules (
  singleton boolean primary key default true check (singleton),
  min_account_age interval not null default interval '24 hours'
    check (min_account_age >= interval '0')
);

insert into public.vote_rules default values;

alter table public.vote_rules enable row level security;
revoke all on public.vote_rules from public, anon, authenticated;

-- When this account's votes start counting.
create function public.flp_votes_count_from(p_voter_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.created_at, '-infinity') + (select min_account_age from public.vote_rules)
  from auth.users u
  where u.id = p_voter_id;
$$;

-- Votes that count for a publication, optionally only those cast since a time.
create function public.flp_counted_votes(p_slug text, p_since timestamptz default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.publication_votes pv
  join public.publications p on p.slug = pv.slug
  join auth.users u on u.id = pv.voter_id
  where pv.slug = p_slug
    and pv.voter_id <> p.owner_id
    -- auth always sets created_at; a row without one is treated as old.
    and coalesce(u.created_at, '-infinity') <= now() - (select min_account_age from public.vote_rules)
    and (p_since is null or pv.created_at >= p_since);
$$;

create or replace function public.flp_vote_state(p_slug text, p_voter_id uuid default null)
returns table (vote_count integer, voted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.publications
    where slug = p_slug and status = 'published'
  ) then
    raise exception 'publication not found' using errcode = 'FL404';
  end if;

  return query
  select
    public.flp_counted_votes(p_slug),
    p_voter_id is not null and exists (
      select 1 from public.publication_votes
      where slug = p_slug and voter_id = p_voter_id
    );
end;
$$;

create or replace function public.flp_cast_vote(p_voter_id uuid, p_slug text)
returns table (vote_count integer, voted boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_require_owner(p_voter_id);
  perform public.flp_lock_live_publication(p_slug);

  if exists (select 1 from public.publications where slug = p_slug and owner_id = p_voter_id) then
    raise exception 'you cannot vote for your own design' using errcode = 'FL409';
  end if;

  insert into public.publication_votes (slug, voter_id)
  values (p_slug, p_voter_id)
  on conflict (slug, voter_id) do nothing;

  return query select * from public.flp_vote_state(p_slug, p_voter_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public profiles (opt-in)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column handle text unique
    check (handle is null or (handle ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$' and handle !~ '--')),
  add column profile_public boolean not null default false,
  add constraint profiles_public_needs_handle check (not profile_public or handle is not null);

-- Words a handle may not be: they read as the site speaking.
create function public.flp_reserved_handle(p_handle text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_handle = any (array[
    'admin', 'administrator', 'support', 'help', 'flp', 'fashion-lab', 'moderator',
    'staff', 'official', 'team', 'root', 'system', 'null', 'undefined', 'me', 'settings'
  ]);
$$;

create function public.flp_set_public_profile(
  p_owner_id uuid,
  p_handle text,
  p_public boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text := nullif(lower(btrim(p_handle)), '');
  v_profile public.profiles;
begin
  perform public.flp_require_owner(p_owner_id);

  if v_handle is not null
    and (v_handle !~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$' or v_handle ~ '--') then
    raise exception 'handle must be 3 to 24 letters, digits or single hyphens'
      using errcode = 'FL422';
  end if;

  if v_handle is not null and public.flp_reserved_handle(v_handle) then
    raise exception 'that handle is reserved' using errcode = 'FL409';
  end if;

  if coalesce(p_public, false) and v_handle is null then
    raise exception 'choose a handle before showing your profile' using errcode = 'FL422';
  end if;

  begin
    insert into public.profiles (owner_id, handle, profile_public, updated_at)
    values (p_owner_id, v_handle, coalesce(p_public, false), now())
    on conflict (owner_id) do update
    set handle = excluded.handle, profile_public = excluded.profile_public, updated_at = now()
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'that handle is taken' using errcode = 'FL409';
  end;

  return v_profile;
end;
$$;

-- A public profile and its live publications, most voted first. FL404 when
-- the handle is unknown or the profile isn't public.
create function public.flp_public_profile(p_handle text)
returns table (handle text, display_name text, designs jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where profiles.handle = lower(btrim(p_handle)) and profile_public;

  if not found then
    raise exception 'profile not found' using errcode = 'FL404';
  end if;

  return query
  select
    v_profile.handle,
    v_profile.display_name,
    coalesce((
      select jsonb_agg(entry order by (entry ->> 'vote_count')::integer desc, entry ->> 'published_at' desc)
      from (
        select jsonb_build_object(
          'slug', b.slug,
          'title', b.title,
          'version_seq', b.version_seq,
          'published_at', b.published_at,
          'template_id', b.template_id,
          'template_version', b.template_version,
          'vote_count', b.vote_count
        ) as entry
        from public.flp_board_entries(null, null) b
        where b.owner_id = v_profile.owner_id
      ) rows
    ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- The ranked board
-- ---------------------------------------------------------------------------

-- Every listable publication with its counted votes since `p_since`, and its
-- owner's handle when their profile is public. Internal: no grants.
create function public.flp_board_entries(p_since timestamptz, p_template text)
returns table (
  slug text,
  owner_id uuid,
  title text,
  display_name text,
  version_seq integer,
  published_at timestamptz,
  template_id text,
  template_version text,
  vote_count integer,
  owner_handle text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.slug,
    p.owner_id,
    p.title,
    p.display_name,
    p.version_seq,
    p.published_at,
    v.content -> 'template' ->> 'id',
    v.content -> 'template' ->> 'version',
    public.flp_counted_votes(p.slug, p_since),
    case when pr.profile_public then pr.handle end
  from public.publications p
  join public.design_versions v
    on v.design_id = p.design_id and v.seq = p.version_seq
  left join public.profiles pr on pr.owner_id = p.owner_id
  where p.status = 'published'
    and p.title is not null
    -- A design saved before templates were pinned is a tee (garmentOfTemplate).
    and (p_template is null or coalesce(v.content -> 'template' ->> 'id', 'tee-crew-short') = p_template)
    and (
      select count(*)
      from public.render_artifacts r
      where r.design_id = p.design_id
        and r.version_seq = p.version_seq
        and r.status = 'ready'
        and r.kind in ('view_front', 'view_three_quarter', 'view_back')
    ) = 3;
$$;

-- Ranked within the window (votes cast in the last 7 or 30 days, or ever)
-- and, when given, within one template. Ties share a rank.
create function public.flp_board_ranked(
  p_window text default 'all',
  p_template text default null,
  p_limit integer default 200
)
returns table (
  slug text,
  title text,
  display_name text,
  version_seq integer,
  published_at timestamptz,
  template_id text,
  template_version text,
  vote_count integer,
  rank integer,
  owner_handle text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  v_since := case coalesce(p_window, 'all')
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    when 'all' then null
  end;

  if coalesce(p_window, 'all') not in ('week', 'month', 'all') then
    raise exception 'window must be week, month or all' using errcode = 'FL422';
  end if;

  return query
  select
    b.slug, b.title, b.display_name, b.version_seq, b.published_at,
    b.template_id, b.template_version, b.vote_count,
    (rank() over (order by b.vote_count desc))::integer,
    b.owner_handle
  from public.flp_board_entries(v_since, p_template) b
  order by b.vote_count desc, b.published_at desc, b.slug
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.publication_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.publications (slug) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('copyright', 'offensive', 'spam', 'other')),
  note text check (note is null or char_length(note) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text check (resolved_by is null or char_length(resolved_by) between 1 and 80),
  check ((status = 'open') = (resolved_at is null))
);

-- One open report per person per design: reporting again changes nothing.
create unique index publication_reports_open_once
  on public.publication_reports (slug, reporter_id) where status = 'open';
create index publication_reports_open on public.publication_reports (created_at) where status = 'open';

alter table public.publication_reports enable row level security;
revoke all on public.publication_reports from public, anon, authenticated;

create function public.flp_report_publication(
  p_reporter_id uuid,
  p_slug text,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_require_owner(p_reporter_id);
  perform public.flp_lock_live_publication(p_slug);

  if p_reason is null or p_reason not in ('copyright', 'offensive', 'spam', 'other') then
    raise exception 'reason must be copyright, offensive, spam or other' using errcode = 'FL422';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'note must be at most 500 characters' using errcode = 'FL422';
  end if;

  insert into public.publication_reports (slug, reporter_id, reason, note)
  values (p_slug, p_reporter_id, p_reason, nullif(btrim(p_note), ''))
  on conflict (slug, reporter_id) where status = 'open' do nothing;
end;
$$;

-- For the moderation script: close a report.
create function public.flp_resolve_report(p_id uuid, p_status text, p_operator text)
returns public.publication_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.publication_reports;
begin
  if p_status not in ('dismissed', 'actioned') then
    raise exception 'status must be dismissed or actioned' using errcode = 'FL422';
  end if;

  update public.publication_reports
  set status = p_status, resolved_at = now(), resolved_by = btrim(p_operator)
  where id = p_id and status = 'open'
  returning * into v_report;

  if not found then
    raise exception 'open report not found' using errcode = 'FL404';
  end if;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the server only
-- ---------------------------------------------------------------------------

revoke all on function
  public.flp_votes_count_from(uuid),
  public.flp_counted_votes(text, timestamptz),
  public.flp_reserved_handle(text),
  public.flp_set_public_profile(uuid, text, boolean),
  public.flp_public_profile(text),
  public.flp_board_entries(timestamptz, text),
  public.flp_board_ranked(text, text, integer),
  public.flp_report_publication(uuid, text, text, text),
  public.flp_resolve_report(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.flp_votes_count_from(uuid),
  public.flp_set_public_profile(uuid, text, boolean),
  public.flp_public_profile(text),
  public.flp_board_ranked(text, text, integer),
  public.flp_report_publication(uuid, text, text, text),
  public.flp_resolve_report(uuid, text, text)
to service_role;
