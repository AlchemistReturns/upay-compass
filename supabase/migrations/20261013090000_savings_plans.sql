-- Savings plans: a monthly-savings (DPS) PLAN started from a goal.
--
-- This is a plan stored in Compass, handed to the savings-plan adapter (adapters/upay-sim) that a
-- real upay product API can replace. No real deposit is opened and no money moves. The rate is an
-- ILLUSTRATIVE constant (ILLUSTRATIVE_DPS_ANNUAL_RATE in packages/shared/src/savings-plan.ts), kept
-- on each row so the figure shown at the time stays reproducible.
--
-- Own rows only: people can read their plans and request new ones. The one change allowed after
-- that is cancelling a plan that is still "requested" (the Undo), through cancel_savings_plan().
-- Plans go when their goal or the account is deleted (on delete cascade). purge_expired_data() does
-- not touch them: they stay until the person deletes them.

create table public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  monthly_amount numeric not null check (monthly_amount > 0),
  tenure_months int not null check (tenure_months between 1 and 120),
  illustrative_rate numeric not null check (illustrative_rate >= 0 and illustrative_rate < 1),
  projected_maturity numeric not null check (projected_maturity >= 0),
  status text not null default 'requested' check (status in ('requested', 'cancelled')),
  reference text not null unique check (char_length(reference) between 4 and 40),
  created_at timestamptz not null default now()
);

create index savings_plans_user_id_idx on public.savings_plans (user_id);
create index savings_plans_goal_id_idx on public.savings_plans (goal_id);

alter table public.savings_plans enable row level security;

create policy "read own savings plans" on public.savings_plans
  for select to authenticated
  using (auth.uid() = user_id);

-- A plan can only be requested for one of the person's own goals.
create policy "insert own savings plans" on public.savings_plans
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'requested'
    and exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()
    )
  );

revoke all on public.savings_plans from anon, authenticated;
grant select on public.savings_plans to authenticated;
grant insert (
  user_id, goal_id, monthly_amount, tenure_months, illustrative_rate, projected_maturity, reference
) on public.savings_plans to authenticated;

-- Undo: a plan that is still "requested" can be cancelled by its owner. Nothing else changes.
create or replace function public.cancel_savings_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  update public.savings_plans
     set status = 'cancelled'
   where id = p_plan_id and user_id = uid and status = 'requested';
  if not found then
    raise exception 'plan not found or already cancelled';
  end if;
end;
$$;

revoke all on function public.cancel_savings_plan(uuid) from public, anon;
grant execute on function public.cancel_savings_plan(uuid) to authenticated;
