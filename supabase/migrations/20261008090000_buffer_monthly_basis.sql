-- Emergency buffer on a monthly basis. health_inputs() now also returns essential spending per
-- complete calendar month and for the current month so far. Same signature and security as before
-- (security invoker, the caller's own rows); the existing keys are unchanged, two are added.

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
    'budgets', v_budgets
  );
end;
$$;
