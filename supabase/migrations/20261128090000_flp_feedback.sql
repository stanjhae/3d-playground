-- Structured feedback on a published version (PRD V2).
--
-- One response per account, per publication, per published version. It
-- requires a vote on that publication, and the owner cannot answer their
-- own design. Answers are would-wear, a price band, an optional size, up
-- to four tags, and an optional note. The owner reads totals only; voter
-- rows are not granted to anyone but the service role.
--
-- Votes stay on the slug for the life of the publication. Feedback is
-- pinned to the version that was live when it was given, so a new publish
-- starts a new set of answers.

create table public.publication_feedback (
  slug text not null references public.publications (slug) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  version_seq integer not null,
  would_wear boolean not null,
  price_band text not null check (price_band in ('under_25', '25_50', '50_100', 'over_100', 'skip')),
  size_label text check (size_label is null or size_label in ('xs', 's', 'm', 'l', 'xl')),
  tags text[] not null default '{}' check (tags <@ array['fit', 'colour', 'graphic', 'fabric']::text[]),
  note text check (note is null or char_length(note) between 1 and 280),
  updated_at timestamptz not null default now(),
  primary key (slug, voter_id, version_seq)
);

create index publication_feedback_version_idx
  on public.publication_feedback (slug, version_seq);

alter table public.publication_feedback enable row level security;

revoke all on public.publication_feedback from public, anon, authenticated;
