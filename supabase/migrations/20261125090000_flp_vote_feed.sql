-- FLP V2: the Vote feed, apart from the Ranking board.
--
-- The board ranks by votes, so a new or little-voted design sits at the
-- bottom of the top 200, or off it, and rarely gets seen. The feed is where
-- people find designs to vote on. Its order, in two groups:
--
--   1. "Needs votes": fewer than 3 counted votes in the last 7 days,
--      newest first;
--   2. everything else, newest first.
--
-- Ties break by slug. The viewer's own designs are left out (they can't
-- vote for them), and every row says whether the viewer voted, so the page
-- makes no request per card. It pages by keyset (group, published_at,
-- slug), not by a top-N cut, so no live design ever drops off the end.
--
-- Counts use flp_board_entries, so they agree with the board and the share
-- page. Additive: one new function, granted to the server only.

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
  -- All-time counted votes, as on the share page.
  vote_count integer,
  -- Counted votes in the last 7 days, which decide the group.
  week_votes integer,
  -- 0: needs votes; 1: the rest.
  feed_group integer,
  voted boolean,
  counts_from timestamptz,
  owner_handle text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
begin
  -- A cursor is all three parts or none.
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
    e.owner_handle
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

revoke all on function public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)
from public, anon, authenticated;

grant execute on function public.flp_vote_feed(uuid, text, integer, timestamptz, text, integer)
to service_role;
