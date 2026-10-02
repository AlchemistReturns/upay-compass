-- Goals table (created in Phase 1 because onboarding can create a first goal).
-- goal_contributions and saved_amount updates arrive with Phase 3 RPCs.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  target_amount numeric not null check (target_amount > 0),
  saved_amount numeric not null default 0 check (saved_amount >= 0),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now()
);

create index goals_user_id_idx on public.goals (user_id);

alter table public.goals enable row level security;

create policy "own goals" on public.goals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Clients cannot write saved_amount directly; contributions go through RPCs later.
revoke insert, update on public.goals from authenticated;
grant insert (user_id, title, target_amount, target_date) on public.goals to authenticated;
grant update (title, target_amount, target_date, status) on public.goals to authenticated;
