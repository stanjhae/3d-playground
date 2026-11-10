-- FLP P2: abuse and moderation.
--
-- Additive: two new tables, new functions and one new trigger. Nothing
-- existing is altered or backfilled.
--
-- 1. Request limits for callers without an account (the waitlist, counts,
--    error reports and public reads of shared designs). They used to be
--    counted in each serverless instance's memory, so every cold start or
--    second instance reset them. The caller is a keyed hash of their IP
--    address made by the server (`src/lib/rate-limit.ts`); the address
--    itself is never sent here. A caller's rows go when their next window
--    starts, and every row goes within a day.
--    Signed-in limits stay in `public.rate_limits` (20261104090000).
--
-- 2. Moderation holds. An operator takes a published design down after a
--    report (`scripts/moderation.mjs`): it is unpublished at once, and
--    while the hold stands the owner cannot publish it again. Clearing the
--    hold lets the owner publish again; it does not republish by itself.
--    The share page shows its existing "not available" state, because a
--    taken-down design is simply not published.

-- ---------------------------------------------------------------------------
-- Request limits: fixed windows per caller hash and bucket
-- ---------------------------------------------------------------------------

create table public.request_limits (
  subject text not null check (subject ~ '^[0-9a-f]{32}$'),
  bucket text not null check (char_length(bucket) between 1 and 32),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (subject, bucket, window_start)
);

create index request_limits_window_idx on public.request_limits (window_start);

alter table public.request_limits enable row level security;
revoke all on public.request_limits from public, anon, authenticated;

-- Windows that ended more than a day ago. Every limit is far shorter, so
-- nothing still counting is removed. Returns how many rows went.
create function public.flp_prune_request_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.request_limits
  where window_start < now() - interval '1 day';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Takes one request from the current window. Returns the seconds to wait
-- when the bucket is empty, or 0 when the request may proceed. Same rules
-- as `flp_take_token`, keyed by caller hash instead of account.
create function public.flp_take_request_token(
  p_subject text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_subject is null or p_subject !~ '^[0-9a-f]{32}$' then
    raise exception 'request subject is invalid' using errcode = 'FL422';
  end if;

  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'request limit is invalid' using errcode = 'FL422';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.request_limits (subject, bucket, window_start, count)
  values (p_subject, p_bucket, v_window, 1)
  on conflict (subject, bucket, window_start)
  do update set count = public.request_limits.count + 1
  returning count into v_count;

  delete from public.request_limits
  where subject = p_subject and bucket = p_bucket
    and window_start < v_window;

  -- Everyone's windows older than a day, so no caller's hash outlives
  -- that without a scheduled job. Indexed, so usually a no-op.
  perform public.flp_prune_request_limits();

  if v_count > p_limit then
    return greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
  end if;

  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation holds: one per publication slug
-- ---------------------------------------------------------------------------

-- Keyed by slug, which a design keeps for its lifetime, so a hold outlives
-- unpublish and republish. Deleting the owner's account removes their
-- publications and with them the holds. `held_by` and `cleared_by` name
-- the operator; they are not accounts.
create table public.moderation_holds (
  slug text primary key references public.publications (slug) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  held_by text not null check (char_length(btrim(held_by)) between 1 and 80),
  held_at timestamptz not null default now(),
  cleared_by text check (cleared_by is null or char_length(btrim(cleared_by)) between 1 and 80),
  cleared_at timestamptz,
  check ((cleared_at is null) = (cleared_by is null))
);

-- Only the service role (operators) reads or writes holds. Owners learn of
-- one when publishing is refused.
alter table public.moderation_holds enable row level security;
revoke all on public.moderation_holds from public, anon, authenticated;

-- Takes a publication down: revokes it now and holds it so the owner
-- cannot publish it again. Works on an already unpublished design too,
-- so a report can be acted on whatever the owner did meanwhile. Taking
-- down a held design again replaces the reason.
create function public.flp_take_down_publication(
  p_slug text,
  p_reason text,
  p_held_by text
)
returns public.moderation_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication public.publications;
  v_hold public.moderation_holds;
begin
  select * into v_publication
  from public.publications
  where slug = p_slug
  for update;

  if not found then
    raise exception 'publication not found' using errcode = 'FL404';
  end if;

  insert into public.moderation_holds (slug, reason, held_by, held_at)
  values (p_slug, btrim(p_reason), btrim(p_held_by), now())
  on conflict (slug) do update
  set reason = excluded.reason,
    held_by = excluded.held_by,
    held_at = now(),
    cleared_by = null,
    cleared_at = null
  returning * into v_hold;

  update public.publications
  set status = 'revoked', version_seq = null, revoked_at = now(),
    updated_at = now()
  where slug = p_slug and status = 'published';

  if v_publication.design_id is not null then
    update public.designs
    set visibility = 'private', updated_at = now()
    where id = v_publication.design_id;
  end if;

  return v_hold;
end;
$$;

-- Lifts a hold. The design stays unpublished until its owner publishes.
create function public.flp_clear_moderation_hold(
  p_slug text,
  p_cleared_by text
)
returns public.moderation_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.moderation_holds;
begin
  update public.moderation_holds
  set cleared_by = btrim(p_cleared_by), cleared_at = now()
  where slug = p_slug and cleared_at is null
  returning * into v_hold;

  if not found then
    raise exception 'no hold on this publication' using errcode = 'FL404';
  end if;

  return v_hold;
end;
$$;

-- Refuses to make a held publication live, whichever path tries: the
-- publish function's upsert, or any later function that sets the status.
create function public.flp_guard_moderation_hold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and exists (
    select 1 from public.moderation_holds
    where slug = new.slug and cleared_at is null
  ) then
    raise exception 'this design was taken down after a report'
      using errcode = 'FL451';
  end if;

  return new;
end;
$$;

create trigger publications_moderation_hold
  before insert or update on public.publications
  for each row execute function public.flp_guard_moderation_hold();

revoke all on function
  public.flp_prune_request_limits(),
  public.flp_take_request_token(text, text, integer, integer),
  public.flp_take_down_publication(text, text, text),
  public.flp_clear_moderation_hold(text, text),
  public.flp_guard_moderation_hold()
from public, anon, authenticated;

grant execute on function
  public.flp_prune_request_limits(),
  public.flp_take_request_token(text, text, integer, integer),
  public.flp_take_down_publication(text, text, text),
  public.flp_clear_moderation_hold(text, text)
to service_role;
