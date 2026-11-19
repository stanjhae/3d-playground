-- FLP V2: honest vote counts, visible ties and no self-votes (tester pass 3).
--
-- 1. Held votes. A new account's vote is kept but counts only once the
--    account is `min_account_age` old (docs/abuse.md). Every count stays the
--    counted number; next to it each read now also returns `pending_count`,
--    the votes kept but not counted yet, so a page can say "0 votes, 1 counts
--    within a day" instead of jumping to 1 and disagreeing with the board.
--    The vote state also says when the viewer's own votes start counting
--    (`viewer_counts_from`), so a page doesn't guess before the server
--    answers, and whether the design is the viewer's own (`own`), so it can
--    offer no Vote button.
-- 2. Ties. The board keeps standard competition ranking (1, 2, 3, 3, 5) and
--    says which rows share their rank (`tied`). Within a tie, newest first,
--    then by slug, as before.
-- 3. Self-votes. flp_cast_vote already refused one (FL409); the table now
--    refuses one too, whatever writes it, and any left from before the rule
--    are removed. They never counted.
--
-- Backward compatible: every function keeps its arguments, and returns the
-- same columns plus new ones at the end, which the current server ignores.
-- Changing a function's columns means dropping it first.

-- ---------------------------------------------------------------------------
-- Held votes
-- ---------------------------------------------------------------------------

-- Votes on a publication that are kept but don't count yet: from someone
-- else's account younger than `min_account_age`. Internal: no grants.
create function public.flp_held_votes(p_slug text, p_since timestamptz default null)
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
    and coalesce(u.created_at, '-infinity') > now() - (select min_account_age from public.vote_rules)
    and (p_since is null or pv.created_at >= p_since);
$$;

-- ---------------------------------------------------------------------------
-- No self-votes, at the table
-- ---------------------------------------------------------------------------

delete from public.publication_votes pv
using public.publications p
where p.slug = pv.slug and pv.voter_id = p.owner_id;

create function public.flp_refuse_own_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.publications where slug = new.slug and owner_id = new.voter_id) then
    raise exception 'you cannot vote for your own design' using errcode = 'FL409';
  end if;

  return new;
end;
$$;

create trigger publication_votes_not_own
  before insert or update on public.publication_votes
  for each row
  execute function public.flp_refuse_own_vote();

-- ---------------------------------------------------------------------------
-- Vote state, cast and retract
-- ---------------------------------------------------------------------------

drop function public.flp_cast_vote(uuid, text);
drop function public.flp_retract_vote(uuid, text);
drop function public.flp_vote_state(text, uuid);

create function public.flp_vote_state(p_slug text, p_voter_id uuid default null)
returns table (
  vote_count integer,
  voted boolean,
  -- The caller voted but their account is too new: when the vote counts.
  counts_from timestamptz,
  -- Votes kept but not counted yet (new accounts').
  pending_count integer,
  -- The design is the caller's own: they can't vote for it.
  own boolean,
  -- When the caller's votes start counting, while that is still ahead.
  viewer_counts_from timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_voted boolean;
  v_from timestamptz;
begin
  select owner_id into v_owner
  from public.publications
  where slug = p_slug and status = 'published';

  if not found then
    raise exception 'publication not found' using errcode = 'FL404';
  end if;

  v_voted := p_voter_id is not null and exists (
    select 1 from public.publication_votes
    where slug = p_slug and voter_id = p_voter_id
  );

  if p_voter_id is not null then
    v_from := public.flp_votes_count_from(p_voter_id);
  end if;

  return query
  select
    public.flp_counted_votes(p_slug),
    v_voted,
    case when v_voted and v_from > now() then v_from end,
    public.flp_held_votes(p_slug),
    p_voter_id is not null and p_voter_id = v_owner,
    case when v_from > now() then v_from end;
end;
$$;

-- Idempotent: voting again keeps the one vote. Never on your own design.
create function public.flp_cast_vote(p_voter_id uuid, p_slug text)
returns table (
  vote_count integer,
  voted boolean,
  counts_from timestamptz,
  pending_count integer,
  own boolean,
  viewer_counts_from timestamptz
)
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

-- Idempotent: retracting without a vote changes nothing.
create function public.flp_retract_vote(p_voter_id uuid, p_slug text)
returns table (
  vote_count integer,
  voted boolean,
  counts_from timestamptz,
  pending_count integer,
  own boolean,
  viewer_counts_from timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_require_owner(p_voter_id);
  perform public.flp_lock_live_publication(p_slug);

  delete from public.publication_votes
  where slug = p_slug and voter_id = p_voter_id;

  return query select * from public.flp_vote_state(p_slug, p_voter_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Board entries, the ranked board and the Vote feed
-- ---------------------------------------------------------------------------

drop function public.flp_board_ranked(text, text, integer);
drop function public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer);
drop function public.flp_board_entries(timestamptz, text);

-- Every listable publication with its counted votes since `p_since`, the
-- votes held since then, and its owner's handle when their profile is
-- public. Internal: no grants.
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
  owner_handle text,
  pending_count integer
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
    coalesce(tally.counted, 0)::integer,
    case when pr.profile_public then pr.handle end,
    coalesce(tally.held, 0)::integer
  from public.publications p
  join public.design_versions v
    on v.design_id = p.design_id and v.seq = p.version_seq
  left join public.profiles pr on pr.owner_id = p.owner_id
  -- Counted and held votes for every publication in one pass; the same
  -- rules as flp_counted_votes and flp_held_votes.
  left join (
    select
      pv.slug,
      count(*) filter (
        where coalesce(u.created_at, '-infinity') <= now() - (select min_account_age from public.vote_rules)
      ) as counted,
      count(*) filter (
        where coalesce(u.created_at, '-infinity') > now() - (select min_account_age from public.vote_rules)
      ) as held
    from public.publication_votes pv
    join public.publications vp on vp.slug = pv.slug
    join auth.users u on u.id = pv.voter_id
    where pv.voter_id <> vp.owner_id
      and (p_since is null or pv.created_at >= p_since)
    group by pv.slug
  ) tally on tally.slug = p.slug
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
-- and, when given, within one template. Standard competition ranking: ties
-- share a rank, the next rank skips (1, 2, 3, 3, 5), and `tied` marks them.
-- Within a tie, newest first, then by slug.
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
  owner_handle text,
  pending_count integer,
  tied boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  if coalesce(p_window, 'all') not in ('week', 'month', 'all') then
    raise exception 'window must be week, month or all' using errcode = 'FL422';
  end if;

  v_since := case coalesce(p_window, 'all')
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    when 'all' then null
  end;

  return query
  select
    b.slug, b.title, b.display_name, b.version_seq, b.published_at,
    b.template_id, b.template_version, b.vote_count,
    (rank() over (order by b.vote_count desc))::integer,
    b.owner_handle,
    b.pending_count,
    -- Over every entry, not just the rows returned: a tie at the cut-off is still a tie.
    (count(*) over (partition by b.vote_count)) > 1
  from public.flp_board_entries(v_since, p_template) b
  order by b.vote_count desc, b.published_at desc, b.slug
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
end;
$$;

-- The Vote feed (20261125090000_flp_vote_feed.sql), with held votes and
-- when the viewer's own votes start counting.
create function public.flp_vote_feed(
  p_viewer_id uuid default null,
  p_template text default null,
  p_after_group integer default null,
  p_after_published timestamptz default null,
  p_after_slug text default null,
  p_limit integer default 24
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
  week_votes integer,
  feed_group integer,
  voted boolean,
  counts_from timestamptz,
  owner_handle text,
  pending_count integer,
  viewer_counts_from timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
begin
  if (p_after_group is null) <> (p_after_published is null)
    or (p_after_group is null) <> (p_after_slug is null) then
    raise exception 'cursor must have a group, a time and a slug' using errcode = 'FL422';
  end if;

  if p_after_group is not null and p_after_group not in (0, 1) then
    raise exception 'cursor group must be 0 or 1' using errcode = 'FL422';
  end if;

  if p_viewer_id is not null then
    v_from := public.flp_votes_count_from(p_viewer_id);
  end if;

  return query
  with entries as (
    select
      b.*,
      coalesce(w.vote_count, 0) as week_n,
      case when coalesce(w.vote_count, 0) < 3 then 0 else 1 end as grp
    from public.flp_board_entries(null, p_template) b
    left join public.flp_board_entries(now() - interval '7 days', p_template) w on w.slug = b.slug
    where p_viewer_id is null or b.owner_id <> p_viewer_id
  )
  select
    e.slug, e.title, e.display_name, e.version_seq, e.published_at,
    e.template_id, e.template_version, e.vote_count,
    e.week_n::integer,
    e.grp,
    mine.voted,
    case when mine.voted and v_from > now() then v_from end,
    e.owner_handle,
    e.pending_count,
    case when v_from > now() then v_from end
  from entries e
  cross join lateral (
    select p_viewer_id is not null and exists (
      select 1 from public.publication_votes pv
      where pv.slug = e.slug and pv.voter_id = p_viewer_id
    ) as voted
  ) mine
  where p_after_group is null
    or e.grp > p_after_group
    or (e.grp = p_after_group and (
      e.published_at < p_after_published
      or (e.published_at = p_after_published and e.slug > p_after_slug)
    ))
  order by e.grp, e.published_at desc, e.slug
  limit least(greatest(coalesce(p_limit, 24), 0), 60);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the server only
-- ---------------------------------------------------------------------------

revoke all on function
  public.flp_held_votes(text, timestamptz),
  public.flp_refuse_own_vote(),
  public.flp_vote_state(text, uuid),
  public.flp_cast_vote(uuid, text),
  public.flp_retract_vote(uuid, text),
  public.flp_board_entries(timestamptz, text),
  public.flp_board_ranked(text, text, integer),
  public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)
from public, anon, authenticated;

grant execute on function
  public.flp_vote_state(text, uuid),
  public.flp_cast_vote(uuid, text),
  public.flp_retract_vote(uuid, text),
  public.flp_board_ranked(text, text, integer),
  public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)
to service_role;
