-- Phase 3: budgets, goal contributions, round-ups, nudges, health scores.
-- Money-moving logic lives in security definer functions and triggers so clients cannot forge it.

-- ---------------------------------------------------------------------------------------------
-- Round-up settings on the profile. Written only through set_roundup() (it checks goal ownership).
-- ---------------------------------------------------------------------------------------------
alter table public.profiles
  add column roundup_enabled boolean not null default false,
  add column roundup_goal_id uuid references public.goals (id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Budgets (monthly limit per category)
-- ---------------------------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id int not null references public.categories (id),
  limit_amount numeric not null check (limit_amount > 0),
  period text not null default 'monthly' check (period = 'monthly'),
  alert_threshold numeric not null default 0.8 check (alert_threshold > 0 and alert_threshold <= 1),
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.budgets enable row level security;
create policy "own budgets" on public.budgets
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------------------------
-- Nudges (in-app alerts). Rendered client-side from type + data so they follow the UI language.
-- Created only by triggers/functions; users can read them and mark them read.
-- ---------------------------------------------------------------------------------------------
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table public.nudges enable row level security;
create policy "read own nudges" on public.nudges
  for select to authenticated using (auth.uid() = user_id);
create policy "mark own nudges read" on public.nudges
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.nudges from authenticated;
grant select on public.nudges to authenticated;
grant update (read) on public.nudges to authenticated;

create index nudges_user_created_idx on public.nudges (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Goal contributions. goals.saved_amount is kept in step by triggers, never written by clients.
-- ---------------------------------------------------------------------------------------------
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null check (amount > 0),
  source text not null check (source in ('manual', 'roundup')),
  -- Set for round-ups: deleting the transaction removes its round-up again.
  transaction_id uuid references public.transactions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index goal_contributions_roundup_tx_idx
  on public.goal_contributions (transaction_id) where source = 'roundup';
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, created_at desc);

alter table public.goal_contributions enable row level security;
create policy "read own contributions" on public.goal_contributions
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.goal_contributions from authenticated;
grant select on public.goal_contributions to authenticated;

create or replace function public.goal_contribution_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.goals
  set saved_amount = saved_amount + new.amount,
      status = case when status = 'active' and saved_amount + new.amount >= target_amount
                    then 'completed' else status end
  where id = new.goal_id;
  return new;
end;
$$;

create or replace function public.goal_contribution_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.goals
  set saved_amount = greatest(saved_amount - old.amount, 0),
      status = case when status = 'completed' and greatest(saved_amount - old.amount, 0) < target_amount
                    then 'active' else status end
  where id = old.goal_id;
  return old;
end;
$$;

create trigger goal_contribution_after_insert
  after insert on public.goal_contributions
  for each row execute function public.goal_contribution_added();
create trigger goal_contribution_before_delete
  before delete on public.goal_contributions
  for each row execute function public.goal_contribution_removed();

-- Manual contribution (simulated: it earmarks money, nothing real moves).
create or replace function public.contribute_to_goal(p_goal_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from public.goals where id = p_goal_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'goal_not_found';
  end if;
  insert into public.goal_contributions (goal_id, user_id, amount, source)
  values (p_goal_id, auth.uid(), p_amount, 'manual')
  returning id into v_id;
  return v_id;
end;
$$;

-- Undo any contribution (manual or round-up). The trigger takes the amount back off the goal.
create or replace function public.undo_goal_contribution(p_contribution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.goal_contributions where id = p_contribution_id and user_id = auth.uid();
  if not found then raise exception 'contribution_not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Round-up: opt-in, reversible. Each outgoing transaction rounds up to the next 10 taka.
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_roundup(p_enabled boolean, p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_enabled then
    if not exists (
      select 1 from public.goals where id = p_goal_id and user_id = auth.uid() and status = 'active'
    ) then
      raise exception 'goal_not_found';
    end if;
    update public.profiles set roundup_enabled = true, roundup_goal_id = p_goal_id
    where id = auth.uid();
  else
    update public.profiles set roundup_enabled = false where id = auth.uid();
  end if;
end;
$$;

create or replace function public.apply_roundup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_goal uuid;
  v_round numeric;
begin
  if new.direction <> 'out' then return new; end if;

  select roundup_enabled, roundup_goal_id into v_enabled, v_goal
  from public.profiles where id = new.user_id;
  if not coalesce(v_enabled, false) or v_goal is null then return new; end if;

  v_round := ceil(new.amount / 10) * 10 - new.amount;
  if v_round <= 0 then return new; end if;

  if not exists (
    select 1 from public.goals where id = v_goal and user_id = new.user_id and status = 'active'
  ) then
    return new;
  end if;

  insert into public.goal_contributions (goal_id, user_id, amount, source, transaction_id)
  values (v_goal, new.user_id, v_round, 'roundup', new.id);
  return new;
end;
$$;

create trigger transactions_apply_roundup
  after insert on public.transactions
  for each row execute function public.apply_roundup();

-- ---------------------------------------------------------------------------------------------
-- Budget alerts: one nudge per budget per month per level (threshold, exceeded).
-- ---------------------------------------------------------------------------------------------
create or replace function public.dhaka_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka';
$$;

create or replace function public.check_budget(p_user_id uuid, p_category_id int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.budgets%rowtype;
  v_spent numeric;
  v_month text := to_char(now() at time zone 'Asia/Dhaka', 'YYYY-MM');
begin
  select * into b from public.budgets where user_id = p_user_id and category_id = p_category_id;
  if not found then return; end if;

  select coalesce(sum(amount), 0) into v_spent
  from public.transactions
  where user_id = p_user_id and category_id = p_category_id and direction = 'out'
    and occurred_at >= public.dhaka_month_start();

  if v_spent >= b.limit_amount then
    insert into public.nudges (user_id, type, data, dedupe_key)
    values (p_user_id, 'budget_exceeded',
            jsonb_build_object('budget_id', b.id, 'category_id', b.category_id,
                               'limit', b.limit_amount, 'spent', v_spent),
            'budget:' || b.id || ':' || v_month || ':exceeded')
    on conflict (user_id, dedupe_key) do nothing;
  elsif v_spent >= b.limit_amount * b.alert_threshold then
    insert into public.nudges (user_id, type, data, dedupe_key)
    values (p_user_id, 'budget_threshold',
            jsonb_build_object('budget_id', b.id, 'category_id', b.category_id,
                               'limit', b.limit_amount, 'spent', v_spent,
                               'threshold', b.alert_threshold),
            'budget:' || b.id || ':' || v_month || ':threshold')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
end;
$$;

create or replace function public.transactions_check_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Back-filled history from earlier months must not raise this month's alerts.
  if new.direction = 'out' and new.category_id is not null
     and new.occurred_at >= public.dhaka_month_start() then
    perform public.check_budget(new.user_id, new.category_id);
  end if;
  return new;
end;
$$;

create trigger transactions_budget_after_insert
  after insert on public.transactions
  for each row execute function public.transactions_check_budget();
create trigger transactions_budget_after_update
  after update of amount, category_id, direction on public.transactions
  for each row execute function public.transactions_check_budget();

create or replace function public.budgets_check_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_budget(new.user_id, new.category_id);
  return new;
end;
$$;

create trigger budgets_check_after_write
  after insert or update of limit_amount, alert_threshold on public.budgets
  for each row execute function public.budgets_check_budget();

-- Progress per budget for the current month (Bangladesh time). RLS applies (security invoker).
create or replace function public.budget_progress()
returns table (
  budget_id uuid, category_id int, limit_amount numeric, alert_threshold numeric, spent numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.category_id, b.limit_amount, b.alert_threshold,
         coalesce(sum(t.amount), 0)
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id and t.category_id = b.category_id and t.direction = 'out'
    and t.occurred_at >= public.dhaka_month_start()
  where b.user_id = auth.uid()
  group by b.id
  order by b.created_at;
$$;

-- ---------------------------------------------------------------------------------------------
-- Health scores: history of snapshots. Written only by the compute-health-score function
-- (service role), so a score always comes from code, never from the client.
-- ---------------------------------------------------------------------------------------------
create table public.health_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score int not null check (score between 0 and 100),
  breakdown jsonb not null,
  computed_at timestamptz not null default now()
);

create index health_scores_user_computed_idx on public.health_scores (user_id, computed_at desc);

alter table public.health_scores enable row level security;
create policy "read own scores" on public.health_scores
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.health_scores from authenticated;
grant select on public.health_scores to authenticated;

-- Aggregates for the score, so the function does not pull every transaction.
-- Savings-category outflows count as saving, not spending. Income is split into three 30-day
-- buckets (newest first) for the stability measure.
create or replace function public.health_inputs()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_first timestamptz;
  v_count bigint;
  v_history int;
  v_savings_id int;
  v_income numeric;
  v_spend numeric;
  v_essential numeric;
  v_buckets jsonb;
  v_budgets jsonb;
begin
  select min(occurred_at), count(*) into v_first, v_count
  from public.transactions where user_id = v_uid;

  if v_first is null then
    return jsonb_build_object('tx_count', 0, 'history_days', 0);
  end if;

  v_history := least(90, greatest(1, ceil(extract(epoch from (now() - v_first)) / 86400)::int));
  select id into v_savings_id from public.categories where key = 'savings';

  select
    coalesce(sum(t.amount) filter (where t.direction = 'in'), 0),
    coalesce(sum(t.amount) filter (where t.direction = 'out'
                                   and t.category_id is distinct from v_savings_id), 0),
    coalesce(sum(t.amount) filter (where t.direction = 'out' and c.is_essential), 0)
  into v_income, v_spend, v_essential
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = v_uid and t.occurred_at >= now() - make_interval(days => v_history);

  select coalesce(jsonb_agg(total order by i), '[]'::jsonb) into v_buckets
  from (
    select i, coalesce((
      select sum(amount) from public.transactions
      where user_id = v_uid and direction = 'in'
        and occurred_at >= now() - make_interval(days => 30 * (i + 1))
        and occurred_at < now() - make_interval(days => 30 * i)
    ), 0) as total
    from generate_series(0, 2) as i
    where 30 * (i + 1) <= v_history + 2
  ) b;

  select coalesce(jsonb_agg(jsonb_build_object(
           'category_id', p.category_id, 'limit', p.limit_amount, 'spent', p.spent)), '[]'::jsonb)
  into v_budgets
  from public.budget_progress() p;

  return jsonb_build_object(
    'tx_count', v_count,
    'history_days', v_history,
    'income', v_income,
    'spend', v_spend,
    'essential_spend', v_essential,
    'income_buckets', v_buckets,
    'balance', public.wallet_balance(),
    'budgets', v_budgets
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Realtime and grants
-- ---------------------------------------------------------------------------------------------
alter publication supabase_realtime add table public.budgets;
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.goal_contributions;
alter publication supabase_realtime add table public.nudges;
alter publication supabase_realtime add table public.health_scores;

revoke all on function public.contribute_to_goal(uuid, numeric) from public, anon;
revoke all on function public.undo_goal_contribution(uuid) from public, anon;
revoke all on function public.set_roundup(boolean, uuid) from public, anon;
revoke all on function public.budget_progress() from public, anon;
revoke all on function public.health_inputs() from public, anon;
revoke all on function public.check_budget(uuid, int) from public, anon, authenticated;
revoke all on function public.dhaka_month_start() from public, anon;
grant execute on function public.contribute_to_goal(uuid, numeric) to authenticated;
grant execute on function public.undo_goal_contribution(uuid) to authenticated;
grant execute on function public.set_roundup(boolean, uuid) to authenticated;
grant execute on function public.budget_progress() to authenticated;
grant execute on function public.health_inputs() to authenticated;
grant execute on function public.dhaka_month_start() to authenticated;
