-- Local and CI databases only (`supabase start` / `db reset`); hosted
-- projects never run this file.
--
-- Hosted projects count a vote once the voter's account is 24 hours old
-- (vote_rules, 20261122090000). Test accounts are minutes old, so here every
-- vote counts at once. supabase/tests/flp_vote_rules.test.sql sets the hosted
-- rule back inside its own transaction to test it.
update public.vote_rules set min_account_age = interval '0';
