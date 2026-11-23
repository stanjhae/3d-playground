-- Head-to-head picks and the ranking they adjust (PRD V3).
--
-- A comparison is one account choosing between two live designs. Each
-- design also records that the account saw it that day, so the next pair
-- can prefer designs with fewer recent impressions.
--
-- The board still uses competition ranking. The order is a confidence-
-- adjusted win rate, (wins + 2) / (wins + losses + 4), then the counted
-- votes. With no picks, every design has the same rate, so the order is
-- the vote count, as before. Ties share a rank and the next rank skips.

create table public.publication_comparisons (
  voter_id uuid not null references auth.users (id) on delete cascade,
  slug_low text not null references public.publications (slug) on delete cascade,
  slug_high text not null references public.publications (slug) on delete cascade,
  chosen_slug text not null,
  created_at timestamptz not null default now(),
  primary key (voter_id, slug_low, slug_high),
  check (slug_low < slug_high),
  check (chosen_slug = slug_low or chosen_slug = slug_high)
);

create index publication_comparisons_chosen_idx on public.publication_comparisons (chosen_slug);

create table public.publication_impressions (
  slug text not null references public.publications (slug) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  shown_on date not null default (timezone('utc', now()))::date,
  primary key (slug, viewer_id, shown_on)
);

alter table public.publication_comparisons enable row level security;
alter table public.publication_impressions enable row level security;

revoke all on public.publication_comparisons from public, anon, authenticated;
revoke all on public.publication_impressions from public, anon, authenticated;

drop function public.flp_board_ranked(text, text, integer);

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
  with scored as (
    select
      b.*,
      (coalesce(w.wins, 0) + 2)::numeric
        / (coalesce(w.wins, 0) + coalesce(l.losses, 0) + 4) as score
    from public.flp_board_entries(v_since, p_template) b
    left join (
      select chosen_slug as slug, count(*)::integer as wins
      from public.publication_comparisons
      group by chosen_slug
    ) w on w.slug = b.slug
    left join (
      select side.slug, count(*)::integer as losses
      from (
        select slug_low as slug, chosen_slug from public.publication_comparisons
        union all
        select slug_high, chosen_slug from public.publication_comparisons
      ) side
      where side.slug <> side.chosen_slug
      group by side.slug
    ) l on l.slug = b.slug
  )
  select
    s.slug, s.title, s.display_name, s.version_seq, s.published_at,
    s.template_id, s.template_version, s.vote_count,
    (rank() over (order by s.score desc, s.vote_count desc))::integer,
    s.owner_handle,
    s.pending_count,
    (count(*) over (partition by s.score, s.vote_count)) > 1
  from scored s
  order by s.score desc, s.vote_count desc, s.published_at desc, s.slug
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
end;
$$;

revoke all on function public.flp_board_ranked(text, text, integer) from public, anon, authenticated;
grant execute on function public.flp_board_ranked(text, text, integer) to service_role;
