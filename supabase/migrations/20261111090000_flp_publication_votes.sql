-- FLP V1: account-based votes on published designs.
--
-- One vote per account per publication. A vote belongs to the
-- publication's slug, which a design keeps for its lifetime, so votes
-- carry over when the owner publishes a new version. While a design is
-- unpublished its votes are kept but cannot be read or changed; deleting
-- the design (which leaves a revoked tombstone) removes them. Deleting the
-- voter's account removes their votes.
--
-- Additive: a new table and new functions. The guest board's vote counter
-- (data/designs.json) is not migrated; it never knew who voted.
--
-- The `vote` rate-limit bucket (30 casts or retractions per account per
-- minute) is taken by the server through `flp_take_token`, alongside the
-- buckets in 20261104090000_flp_quotas.sql.

create table public.publication_votes (
  slug text not null references public.publications (slug) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (slug, voter_id)
);

create index publication_votes_voter_idx on public.publication_votes (voter_id);

-- Voters read their own votes; nobody writes directly and nobody reads
-- who else voted. Counts come from the functions below.
alter table public.publication_votes enable row level security;

create policy publication_votes_voter_read on public.publication_votes
  for select to authenticated using (voter_id = (select auth.uid()));

revoke all on public.publication_votes from public, anon, authenticated;
grant select on public.publication_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Reads and writes (service_role only)
-- ---------------------------------------------------------------------------

-- The count for a live publication, and whether this voter (null when
-- signed out) has voted. A missing or unpublished slug is FL404.
create function public.flp_vote_state(p_slug text, p_voter_id uuid default null)
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
    (select count(*)::integer from public.publication_votes where slug = p_slug),
    p_voter_id is not null and exists (
      select 1 from public.publication_votes
      where slug = p_slug and voter_id = p_voter_id
    );
end;
$$;

-- Locks a live publication against a concurrent unpublish or delete.
create function public.flp_lock_live_publication(p_slug text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.publications
  where slug = p_slug and status = 'published'
  for share;

  if not found then
    raise exception 'publication not found' using errcode = 'FL404';
  end if;
end;
$$;

-- Idempotent: voting again keeps the one vote.
create function public.flp_cast_vote(p_voter_id uuid, p_slug text)
returns table (vote_count integer, voted boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.flp_require_owner(p_voter_id);
  perform public.flp_lock_live_publication(p_slug);

  insert into public.publication_votes (slug, voter_id)
  values (p_slug, p_voter_id)
  on conflict (slug, voter_id) do nothing;

  return query select * from public.flp_vote_state(p_slug, p_voter_id);
end;
$$;

-- Idempotent: retracting without a vote changes nothing.
create function public.flp_retract_vote(p_voter_id uuid, p_slug text)
returns table (vote_count integer, voted boolean)
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

-- Deleting a design clears its publication's design_id (the tombstone);
-- the votes go with it, since nothing can show them again.
create function public.flp_drop_tombstone_votes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.publication_votes where slug = new.slug;
  return new;
end;
$$;

create trigger publications_drop_tombstone_votes
  after update of design_id on public.publications
  for each row
  when (old.design_id is not null and new.design_id is null)
  execute function public.flp_drop_tombstone_votes();

revoke all on function
  public.flp_vote_state(text, uuid),
  public.flp_lock_live_publication(text),
  public.flp_cast_vote(uuid, text),
  public.flp_retract_vote(uuid, text),
  public.flp_drop_tombstone_votes()
from public, anon, authenticated;

grant execute on function
  public.flp_vote_state(text, uuid),
  public.flp_cast_vote(uuid, text),
  public.flp_retract_vote(uuid, text)
to service_role;
