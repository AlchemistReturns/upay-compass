-- Explicit savings. Savings is its own balance: money moved into it leaves the wallet, and the
-- savings score is measured from what was explicitly put there.
--
--   savings balance = goal contributions (money allocated to goals, including round-ups)
--                   + free savings (deposits less withdrawals)
--   wallet balance  = opening + money in - money out - savings balance
--
-- Existing goal contributions and round-ups therefore now come out of the wallet (they used to
-- only earmark money). All data is simulated, so no real money is affected. Nothing is rewritten:
-- the balance is derived, so this takes effect for every account at once.
-- Clients cannot write savings_entries directly; they call deposit_to_savings and
-- withdraw_from_savings, which check the balance first.

create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index savings_entries_user_idx on public.savings_entries (user_id, created_at desc);

alter table public.savings_entries enable row level security;
create policy "read own savings entries" on public.savings_entries
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.savings_entries from anon, authenticated;
grant select on public.savings_entries to authenticated;

-- Money allocated to goals, money held without a goal, and the total.
create or replace function public.savings_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with a as (
    select coalesce(sum(amount), 0) as v from public.goal_contributions where user_id = auth.uid()
  ), f as (
    select coalesce(sum(case kind when 'deposit' then amount else -amount end), 0) as v
      from public.savings_entries where user_id = auth.uid()
  )
  select jsonb_build_object('allocated', a.v, 'free', f.v, 'total', a.v + f.v) from a, f;
$$;

create or replace function public.savings_balance()
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select (public.savings_summary() ->> 'total')::numeric;
$$;

-- The wallet is what is left to spend: savings has left it.
create or replace function public.wallet_balance()
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select opening_balance from public.profiles where id = auth.uid())
    + coalesce((select sum(case direction when 'in' then amount else -amount end)
                from public.transactions where user_id = auth.uid()), 0)
    - public.savings_balance();
$$;

-- Move money from the wallet into savings.
create or replace function public.deposit_to_savings(p_amount numeric)
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
  -- serialize this person's money moves, so two taps cannot both pass the balance check
  perform 1 from public.profiles where id = auth.uid() for update;
  if public.wallet_balance() < p_amount then raise exception 'insufficient_balance'; end if;
  insert into public.savings_entries (user_id, kind, amount)
  values (auth.uid(), 'deposit', p_amount) returning id into v_id;
  return v_id;
end;
$$;

-- Move free savings (not allocated to a goal) back into the wallet.
create or replace function public.withdraw_from_savings(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_free numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  v_free := (public.savings_summary() ->> 'free')::numeric;
  if v_free < p_amount then raise exception 'insufficient_savings'; end if;
  insert into public.savings_entries (user_id, kind, amount)
  values (auth.uid(), 'withdrawal', p_amount) returning id into v_id;
  return v_id;
end;
$$;

-- Putting money into a goal now takes it from the wallet (round-ups still apply automatically).
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
  perform 1 from public.profiles where id = auth.uid() for update;
  if public.wallet_balance() < p_amount then raise exception 'insufficient_balance'; end if;
  insert into public.goal_contributions (goal_id, user_id, amount, source)
  values (p_goal_id, auth.uid(), p_amount, 'manual')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.savings_summary() from public, anon;
revoke all on function public.savings_balance() from public, anon;
revoke all on function public.deposit_to_savings(numeric) from public, anon;
revoke all on function public.withdraw_from_savings(numeric) from public, anon;
grant execute on function public.savings_summary() to authenticated;
grant execute on function public.savings_balance() to authenticated;
grant execute on function public.deposit_to_savings(numeric) to authenticated;
grant execute on function public.withdraw_from_savings(numeric) to authenticated;

-- A month counts as a saving month when money went into goals or free savings that month.
create or replace function public.savings_activity()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'first_day',
      (select (min(occurred_at) at time zone 'Asia/Dhaka')::date::text
         from public.transactions where user_id = auth.uid()),
    'months',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'month', to_char(m.start, 'YYYY-MM'),
                'active',
                  exists (
                    select 1 from public.goal_contributions c
                     where c.user_id = auth.uid()
                       and (c.created_at at time zone 'Asia/Dhaka') >= m.start
                       and (c.created_at at time zone 'Asia/Dhaka') < m.start + interval '1 month')
                  or exists (
                    select 1 from public.savings_entries e
                     where e.user_id = auth.uid() and e.kind = 'deposit'
                       and (e.created_at at time zone 'Asia/Dhaka') >= m.start
                       and (e.created_at at time zone 'Asia/Dhaka') < m.start + interval '1 month')
              ) order by m.start desc), '[]'::jsonb)
         from (select (date_trunc('month', now() at time zone 'Asia/Dhaka')
                        - make_interval(months => i)) as start
                 from generate_series(0, 5) as i) m)
  );
$$;

-- health_inputs(): the savings rate is measured from explicit saving, and the buffer sees the
-- savings balance as well as the wallet. Same signature and security; two keys are added.

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
  v_ess_months jsonb;
  v_ess_now numeric;
  v_saved numeric;
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

  -- Income per COMPLETE calendar month (Bangladesh time), newest first, up to three. Calendar
  -- months, not rolling 30-day windows: a steady monthly income that lands on the 5th and the 25th
  -- would otherwise split unevenly across the windows and look unstable (found by the persona
  -- fairness audit). Months from the first transaction's month onward are skipped, because the
  -- user was not there for all of it.
  select coalesce(jsonb_agg(total order by i), '[]'::jsonb) into v_buckets
  from (
    select i, coalesce((
      select sum(t.amount) from public.transactions t
      where t.user_id = v_uid and t.direction = 'in'
        and (t.occurred_at at time zone 'Asia/Dhaka') >= m.start
        and (t.occurred_at at time zone 'Asia/Dhaka') < m.start + interval '1 month'
    ), 0) as total
    from (
      select i, date_trunc('month', now() at time zone 'Asia/Dhaka') - make_interval(months => i) as start
      from generate_series(1, 3) as i
    ) m
    where m.start > date_trunc('month', v_first at time zone 'Asia/Dhaka')
  ) b;

  -- Essential spending per COMPLETE calendar month (Bangladesh time), newest first, up to three,
  -- under the same rule as the income buckets (months before the first transaction's month are
  -- skipped), plus this month's essentials so far. The emergency buffer divides the balance by
  -- the average of these months, or by this month so far until one has completed, with no scaling
  -- of a short history up to a month: what the person logged is that month's spending. (Before,
  -- a single day of essentials was multiplied by 30 and scored the buffer near zero.)
  select coalesce(jsonb_agg(total order by i), '[]'::jsonb) into v_ess_months
  from (
    select i, coalesce((
      select sum(t.amount) from public.transactions t
      join public.categories c on c.id = t.category_id
      where t.user_id = v_uid and t.direction = 'out' and c.is_essential
        and (t.occurred_at at time zone 'Asia/Dhaka') >= m.start
        and (t.occurred_at at time zone 'Asia/Dhaka') < m.start + interval '1 month'
    ), 0) as total
    from (
      select i, date_trunc('month', now() at time zone 'Asia/Dhaka') - make_interval(months => i) as start
      from generate_series(1, 3) as i
    ) m
    where m.start > date_trunc('month', v_first at time zone 'Asia/Dhaka')
  ) e;

  select coalesce(sum(t.amount), 0) into v_ess_now
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.user_id = v_uid and t.direction = 'out' and c.is_essential
    and (t.occurred_at at time zone 'Asia/Dhaka') >= date_trunc('month', now() at time zone 'Asia/Dhaka');

  -- Explicit saving over the window: payments filed under Savings (for example a DPS), plus money
  -- put into the savings account (goal contributions, round-ups, deposits) less withdrawals.
  select coalesce((
           select sum(t.amount) from public.transactions t
            where t.user_id = v_uid and t.direction = 'out' and t.category_id = v_savings_id
              and t.occurred_at >= now() - make_interval(days => v_history)), 0)
       + coalesce((
           select sum(c.amount) from public.goal_contributions c
            where c.user_id = v_uid
              and c.created_at >= now() - make_interval(days => v_history)), 0)
       + coalesce((
           select sum(case e.kind when 'deposit' then e.amount else -e.amount end)
             from public.savings_entries e
            where e.user_id = v_uid
              and e.created_at >= now() - make_interval(days => v_history)), 0)
    into v_saved;

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
    'essential_months', v_ess_months,
    'essential_this_month', v_ess_now,
    'income_buckets', v_buckets,
    'balance', public.wallet_balance(),
    'saved', v_saved,
    'savings_balance', public.savings_balance(),
    'budgets', v_budgets
  );
end;
$$;

-- Reset demo also clears the savings account.
create or replace function public.reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.profiles
     set roundup_enabled = false, roundup_goal_id = null,
         coach_consent_at = null, voice_consent_at = null, opening_balance = 0
   where id = uid;

  delete from public.savings_entries where user_id = uid;
  delete from public.goal_contributions where user_id = uid;
  delete from public.goals where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.category_rules where user_id = uid;
  delete from public.nudges where user_id = uid;
  delete from public.health_scores where user_id = uid;
  delete from public.readiness_scores where user_id = uid;
  delete from public.forecasts where user_id = uid;
  delete from public.coach_messages where user_id = uid;
  delete from public.user_progress where user_id = uid;
  delete from public.gamification where user_id = uid;

  insert into public.audit_log (user_id, action, entity) values (uid, 'reset_demo', 'account');
end;
$$;
