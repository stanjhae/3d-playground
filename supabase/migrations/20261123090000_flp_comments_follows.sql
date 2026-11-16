-- FLP V2: comments on published designs, follows between designers, and
-- reports on comments. Built behind FLP_COMMUNITY / VITE_COMMUNITY, off
-- until there are designers and someone to moderate (docs/decisions.md).
--
-- Additive: new tables and functions, plus a column and a narrower unique
-- index on publication_reports.

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create table public.publication_comments (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.publications (slug) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500 and body = btrim(body)),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  -- 'author', 'owner', or 'operator: <name>'.
  hidden_by text check (hidden_by is null or char_length(hidden_by) between 1 and 90),
  check ((hidden_at is null) = (hidden_by is null))
);

create index publication_comments_by_slug on public.publication_comments (slug, created_at);
create index publication_comments_by_author on public.publication_comments (author_id);

alter table public.publication_comments enable row level security;
revoke all on public.publication_comments from public, anon, authenticated;

-- What a comment shows as its author: the public handle, else the public
-- name, else nothing (the page says "A designer").
create function public.flp_author_label(p_author_id uuid)
returns table (author_name text, author_handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.display_name,
    case when pr.profile_public then pr.handle end
  from (select 1) one
  left join public.profiles pr on pr.owner_id = p_author_id;
$$;

-- Visible comments on a live publication, oldest first, with whether the
-- viewer wrote each one and whether they may hide it (theirs, or on their
-- design). FL404 when the publication isn't live.
create function public.flp_list_comments(p_slug text, p_viewer_id uuid default null, p_limit integer default 200)
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
  select
    c.id,
    c.body,
    c.created_at,
    a.author_name,
    a.author_handle,
    p_viewer_id is not null and c.author_id = p_viewer_id,
    p_viewer_id is not null and (c.author_id = p_viewer_id or v_owner = p_viewer_id)
  from public.publication_comments c
  cross join lateral public.flp_author_label(c.author_id) a
  where c.slug = p_slug and c.hidden_at is null
  order by c.created_at, c.id
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
end;
$$;

create function public.flp_add_comment(p_author_id uuid, p_slug text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(p_body);
  v_id uuid;
begin
  perform public.flp_require_owner(p_author_id);
  perform public.flp_lock_live_publication(p_slug);

  if v_body is null or char_length(v_body) not between 1 and 500 then
    raise exception 'a comment must be 1 to 500 characters' using errcode = 'FL422';
  end if;

  insert into public.publication_comments (slug, author_id, body)
  values (p_slug, p_author_id, v_body)
  returning publication_comments.id into v_id;

  return v_id;
end;
$$;

-- The author takes their comment down, or the design's owner hides one on
-- their design. Hiding again changes nothing. FL404 for anyone else, so a
-- stranger can't tell a comment exists.
create function public.flp_hide_comment(p_actor_id uuid, p_slug text, p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_owner uuid;
begin
  perform public.flp_require_owner(p_actor_id);

  select c.author_id, p.owner_id into v_author, v_owner
  from public.publication_comments c
  join public.publications p on p.slug = c.slug
  where c.id = p_comment_id and c.slug = p_slug
  for update of c;

  if not found or p_actor_id not in (v_author, v_owner) then
    raise exception 'comment not found' using errcode = 'FL404';
  end if;

  update public.publication_comments
  set hidden_at = now(), hidden_by = case when p_actor_id = v_author then 'author' else 'owner' end
  where id = p_comment_id and hidden_at is null;
end;
$$;

-- For the moderation script.
create function public.flp_hide_comment_operator(p_comment_id uuid, p_operator text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_operator is null or char_length(btrim(p_operator)) not between 1 and 80 then
    raise exception 'an operator name is needed' using errcode = 'FL422';
  end if;

  update public.publication_comments
  set hidden_at = now(), hidden_by = 'operator: ' || btrim(p_operator)
  where id = p_comment_id and hidden_at is null;

  if not found and not exists (select 1 from public.publication_comments where id = p_comment_id) then
    raise exception 'comment not found' using errcode = 'FL404';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Follows (only public profiles can be followed)
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_by_followee on public.follows (followee_id);

alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;

-- The owner of a public profile, or FL404.
create function public.flp_public_owner(p_handle text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.profiles
  where handle = lower(btrim(p_handle)) and profile_public;

  if not found then
    raise exception 'profile not found' using errcode = 'FL404';
  end if;

  return v_owner;
end;
$$;

-- How many follow a public profile, whether the viewer does, and whether
-- it is the viewer's own.
create function public.flp_follow_state(p_handle text, p_viewer_id uuid default null)
returns table (followers integer, following boolean, own boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.flp_public_owner(p_handle);
begin
  return query
  select
    (select count(*)::integer from public.follows where followee_id = v_owner),
    p_viewer_id is not null and exists (
      select 1 from public.follows where followee_id = v_owner and follower_id = p_viewer_id
    ),
    p_viewer_id is not null and p_viewer_id = v_owner;
end;
$$;

-- Idempotent both ways. Following yourself is FL409.
create function public.flp_set_follow(p_follower_id uuid, p_handle text, p_follow boolean)
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

  return query select * from public.flp_follow_state(p_handle, p_follower_id);
end;
$$;

-- Live designs by the designers the viewer follows whose profiles are still
-- public, newest first, with all-time counted votes.
create function public.flp_following_board(p_viewer_id uuid, p_limit integer default 200)
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
begin
  perform public.flp_require_owner(p_viewer_id);

  return query
  select
    b.slug, b.title, b.display_name, b.version_seq, b.published_at,
    b.template_id, b.template_version, b.vote_count,
    (row_number() over (order by b.published_at desc, b.slug))::integer,
    b.owner_handle
  from public.flp_board_entries(null, null) b
  join public.follows f on f.followee_id = b.owner_id and f.follower_id = p_viewer_id
  where b.owner_handle is not null
  order by b.published_at desc, b.slug
  limit least(greatest(coalesce(p_limit, 200), 0), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports on comments
-- ---------------------------------------------------------------------------

alter table public.publication_reports
  add column comment_id uuid references public.publication_comments (id) on delete cascade;

-- One open report per reporter for the design itself, and one per comment.
drop index public.publication_reports_open_once;
create unique index publication_reports_open_once
  on public.publication_reports (slug, reporter_id) where status = 'open' and comment_id is null;
create unique index publication_reports_comment_open_once
  on public.publication_reports (comment_id, reporter_id) where status = 'open' and comment_id is not null;

create function public.flp_report_comment(
  p_reporter_id uuid,
  p_slug text,
  p_comment_id uuid,
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

  if not exists (
    select 1 from public.publication_comments
    where id = p_comment_id and slug = p_slug and hidden_at is null
  ) then
    raise exception 'comment not found' using errcode = 'FL404';
  end if;

  if p_reason is null or p_reason not in ('copyright', 'offensive', 'spam', 'other') then
    raise exception 'reason must be copyright, offensive, spam or other' using errcode = 'FL422';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'note must be at most 500 characters' using errcode = 'FL422';
  end if;

  insert into public.publication_reports (slug, comment_id, reporter_id, reason, note)
  values (p_slug, p_comment_id, p_reporter_id, p_reason, nullif(btrim(p_note), ''))
  on conflict (comment_id, reporter_id) where status = 'open' and comment_id is not null do nothing;
end;
$$;

-- The design report's conflict target changed with its index.
create or replace function public.flp_report_publication(
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
  on conflict (slug, reporter_id) where status = 'open' and comment_id is null do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the server only
-- ---------------------------------------------------------------------------

revoke all on function
  public.flp_author_label(uuid),
  public.flp_list_comments(text, uuid, integer),
  public.flp_add_comment(uuid, text, text),
  public.flp_hide_comment(uuid, text, uuid),
  public.flp_hide_comment_operator(uuid, text),
  public.flp_public_owner(text),
  public.flp_follow_state(text, uuid),
  public.flp_set_follow(uuid, text, boolean),
  public.flp_following_board(uuid, integer),
  public.flp_report_comment(uuid, text, uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.flp_list_comments(text, uuid, integer),
  public.flp_add_comment(uuid, text, text),
  public.flp_hide_comment(uuid, text, uuid),
  public.flp_hide_comment_operator(uuid, text),
  public.flp_follow_state(text, uuid),
  public.flp_set_follow(uuid, text, boolean),
  public.flp_following_board(uuid, integer),
  public.flp_report_comment(uuid, text, uuid, text, text)
to service_role;
