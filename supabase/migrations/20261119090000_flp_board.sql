-- FLP V2: the board, read in one query.
--
-- Every live publication whose published version has its three base views
-- ready, with that version's template and the publication's vote count,
-- most voted first (newest first on a tie). Ranking happens here, over every
-- publication, so a long-standing leader is never dropped for being old, and
-- the counting stays in the database: no row cap truncates the votes or the
-- versions, and no list of ids travels in a URL.
--
-- Additive: one new function, service_role only, like the vote reads.

create function public.flp_board(p_limit integer default 200)
returns table (
  slug text,
  title text,
  display_name text,
  version_seq integer,
  published_at timestamptz,
  template_id text,
  template_version text,
  vote_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.slug,
    p.title,
    p.display_name,
    p.version_seq,
    p.published_at,
    v.content -> 'template' ->> 'id',
    v.content -> 'template' ->> 'version',
    coalesce(votes.n, 0)
  from public.publications p
  join public.design_versions v
    on v.design_id = p.design_id and v.seq = p.version_seq
  left join lateral (
    select count(*)::integer as n
    from public.publication_votes pv
    where pv.slug = p.slug
  ) votes on true
  where p.status = 'published'
    and p.title is not null
    and (
      select count(*)
      from public.render_artifacts r
      where r.design_id = p.design_id
        and r.version_seq = p.version_seq
        and r.status = 'ready'
        and r.kind in ('view_front', 'view_three_quarter', 'view_back')
    ) = 3
  order by coalesce(votes.n, 0) desc, p.published_at desc, p.slug
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
$$;

revoke all on function public.flp_board(integer) from public, anon, authenticated;
grant execute on function public.flp_board(integer) to service_role;
