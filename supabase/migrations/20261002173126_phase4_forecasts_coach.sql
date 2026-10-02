-- Phase 4: forecasts, coach messages, coach consent.
-- Forecasts and coach messages are written only by Edge Functions (service role), so a number or a
-- reply in the history always comes from code, never from the browser.

-- ---------------------------------------------------------------------------------------------
-- Forecast snapshots (30-day projected balance, risk flags, and the details behind them)
-- ---------------------------------------------------------------------------------------------
create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  horizon_days int not null check (horizon_days > 0),
  projected_balance jsonb not null,
  risk_flags jsonb not null default '[]'::jsonb,
  -- recurring items found, safety buffer, confidence and backtest figures
  details jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

create index forecasts_user_computed_idx on public.forecasts (user_id, computed_at desc);

alter table public.forecasts enable row level security;
create policy "read own forecasts" on public.forecasts
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.forecasts from authenticated;
grant select on public.forecasts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Coach chat history. Users can read and delete (clear chat) their own messages.
-- ---------------------------------------------------------------------------------------------
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index coach_messages_user_created_idx on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;
create policy "read own coach messages" on public.coach_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "delete own coach messages" on public.coach_messages
  for delete to authenticated using (auth.uid() = user_id);
revoke all on public.coach_messages from authenticated;
grant select, delete on public.coach_messages to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Consent to share a compact summary of the user's numbers with the AI coach.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column coach_consent_at timestamptz;
grant update (coach_consent_at) on public.profiles to authenticated;

alter publication supabase_realtime add table public.forecasts;
