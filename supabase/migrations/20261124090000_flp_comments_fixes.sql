-- FLP V2: comment and follow fixes after the community went live.
--
-- * Comments list the newest 200, shown oldest first. Before, the oldest
--   200 were kept, so on a busy design every new comment was cut off.
-- * The author's name and handle come from one join, not a function call
--   per comment; flp_author_label goes.
-- * Following reads the profile's owner once (flp_follow_state_of).
--
-- Same signatures as before, so the running API needs no change.

create or replace function public.flp_list_comments(p_slug text, p_viewer_id uuid default null, p_limit integer default 200)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_handle text,
  mine boolean,
  can_hide boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.publications
  where slug = p_slug and status = 'published';

  if not found then
    raise exception 'publication not found' using errcode = 'FL404';
  end if;

  return query
  select newest.*
  from (
    select
      c.id,
      c.body,
      c.created_at,
      pr.display_name,
      case when pr.profile_public then pr.handle end,
      p_viewer_id is not null and c.author_id = p_viewer_id,
      p_viewer_id is not null and (c.author_id = p_viewer_id or v_owner = p_viewer_id)
    from public.publication_comments c
    left join public.profiles pr on pr.owner_id = c.author_id
    where c.slug = p_slug and c.hidden_at is null
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 200), 0), 200)
  ) newest
  order by newest.created_at, newest.id;
end;
$$;

drop function public.flp_author_label(uuid);

-- Followers of an owner, whether the viewer follows them, and whether it's
-- the viewer's own profile. Internal: no grants.
create function public.flp_follow_state_of(p_owner_id uuid, p_viewer_id uuid)
returns table (followers integer, following boolean, own boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.follows where followee_id = p_owner_id),
    p_viewer_id is not null and exists (
      select 1 from public.follows where followee_id = p_owner_id and follower_id = p_viewer_id
    ),
    p_viewer_id is not null and p_viewer_id = p_owner_id;
$$;

revoke all on function public.flp_follow_state_of(uuid, uuid) from public, anon, authenticated;

create or replace function public.flp_follow_state(p_handle text, p_viewer_id uuid default null)
returns table (followers integer, following boolean, own boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select * from public.flp_follow_state_of(public.flp_public_owner(p_handle), p_viewer_id);
end;
$$;

create or replace function public.flp_set_follow(p_follower_id uuid, p_handle text, p_follow boolean)
returns table (followers integer, following boolean, own boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  perform public.flp_require_owner(p_follower_id);
  v_owner := public.flp_public_owner(p_handle);

  if v_owner = p_follower_id then
    raise exception 'you cannot follow yourself' using errcode = 'FL409';
  end if;

  if p_follow then
    insert into public.follows (follower_id, followee_id)
    values (p_follower_id, v_owner)
    on conflict do nothing;
  else
    delete from public.follows where follower_id = p_follower_id and followee_id = v_owner;
  end if;

  return query select * from public.flp_follow_state_of(v_owner, p_follower_id);
end;
$$;
