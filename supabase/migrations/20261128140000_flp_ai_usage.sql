-- What the AI assist has cost (Workflow 1, Tier 3).
--
-- One row per call that reached Claude: the model that answered, its token
-- counts, an estimated cost in millionths of a dollar, and whether Claude
-- answered, refused or failed. Nothing the designer sent is stored.
--
-- The server reads two totals before each call: this calendar month's
-- spend (UTC), against FLP_AI_MONTHLY_BUDGET_USD, and the account's refusals
-- in the last day, against FLP_AI_REFUSAL_LIMIT. Rows outlive a deleted
-- account (owner_id becomes null) so the month's spend stays true.
-- Service role only.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_micros bigint not null check (cost_micros >= 0),
  outcome text not null check (outcome in ('answered', 'refused', 'failed'))
);

create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_owner_idx on public.ai_usage (owner_id, created_at);

alter table public.ai_usage enable row level security;

revoke all on public.ai_usage from public, anon, authenticated;
grant select, insert on public.ai_usage to service_role;

-- This month's estimated spend, in millionths of a dollar.
create function public.flp_ai_month_spend()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(cost_micros), 0)::bigint
  from public.ai_usage
  where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
$$;

-- An account's refused requests in the last 24 hours.
create function public.flp_ai_refusals_today(p_owner_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.ai_usage
  where owner_id = p_owner_id
    and outcome = 'refused'
    and created_at > now() - interval '24 hours'
$$;

revoke all on function public.flp_ai_month_spend() from public, anon, authenticated;
revoke all on function public.flp_ai_refusals_today(uuid) from public, anon, authenticated;
grant execute on function public.flp_ai_month_spend() to service_role;
grant execute on function public.flp_ai_refusals_today(uuid) to service_role;
