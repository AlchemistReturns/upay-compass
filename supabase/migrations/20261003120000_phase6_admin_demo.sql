-- Phase 6: admin insights (aggregates only) and demo reset.
--
-- admin_insights(): only an admin may call it. It returns numbers over groups of people, never a
-- row about one person, and hides any figure computed from fewer than `k` people (small groups
-- could identify someone). Each call is written to the audit log.
--
-- reset_demo(): wipes the caller's own app data so the demo can start again from a clean account.
-- It keeps the account itself (phone, PIN, onboarding choices).

create or replace function public.admin_insights()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k constant int := 5;
  since30 constant timestamptz := now() - interval '30 days';
  n_users int;
  n_spenders int;
  spend_total numeric;
  cats jsonb;
  n_scored int;
  v_avg_score numeric;
  score_groups jsonb;
  n_goal_users int;
  n_goals int;
  n_goals_done int;
  n_roundup_users int;
  roundup_total numeric;
  n_learners int;
  n_graduates int;
  v_avg_modules numeric;
  n_modules int;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.audit_log (user_id, action, entity)
  values (auth.uid(), 'admin_insights', 'aggregates');

  select count(*) into n_users from public.profiles where onboarded;

  -- Spending by category, last 30 days (saving into a goal is not spending)
  select count(distinct t.user_id), coalesce(sum(t.amount), 0)
    into n_spenders, spend_total
    from public.transactions t
    join public.categories c on c.id = t.category_id
   where t.direction = 'out' and c.key <> 'savings' and t.occurred_at >= since30;

  select coalesce(jsonb_agg(item order by (item ->> 'total')::numeric desc), '[]'::jsonb)
    into cats
    from (
      select jsonb_build_object(
               'key', c.key, 'name_en', c.name_en, 'name_bn', c.name_bn,
               'total', round(sum(t.amount)),
               'share', round(sum(t.amount) / nullif(spend_total, 0), 3),
               'people', count(distinct t.user_id)) as item
        from public.transactions t
        join public.categories c on c.id = t.category_id
       where t.direction = 'out' and c.key <> 'savings' and t.occurred_at >= since30
       group by c.id
      having count(distinct t.user_id) >= k
       order by sum(t.amount) desc
       limit 6
    ) q;

  -- Latest health score per person
  with latest as (
    select distinct on (h.user_id) h.user_id, h.score, p.income_type
      from public.health_scores h
      join public.profiles p on p.id = h.user_id
     order by h.user_id, h.computed_at desc
  )
  select count(*), round(avg(score), 1) into n_scored, v_avg_score from latest;

  with latest as (
    select distinct on (h.user_id) h.user_id, h.score, p.income_type
      from public.health_scores h
      join public.profiles p on p.id = h.user_id
     order by h.user_id, h.computed_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'income_type', income_type, 'people', people, 'avg_score', avg_score)), '[]'::jsonb)
    into score_groups
    from (
      select income_type, count(*) as people, round(avg(score), 1) as avg_score
        from latest where income_type is not null
       group by income_type having count(*) >= k
    ) g;

  -- Goals
  select count(distinct user_id), count(*), count(*) filter (where status = 'completed')
    into n_goal_users, n_goals, n_goals_done
    from public.goals where status <> 'archived';

  -- Round-up savings
  select count(distinct user_id), coalesce(sum(amount), 0)
    into n_roundup_users, roundup_total
    from public.goal_contributions where source = 'roundup';

  -- Learning
  select count(*) into n_modules from public.learn_modules;
  select count(*), coalesce(round(avg(done), 1), 0), count(*) filter (where done >= n_modules)
    into n_learners, v_avg_modules, n_graduates
    from (select user_id, count(*) as done from public.user_progress group by user_id) q;

  return jsonb_build_object(
    'min_group_size', k,
    'generated_at', now(),
    'people', case when n_users >= k then jsonb_build_object('onboarded', n_users)
                   else jsonb_build_object('suppressed', true) end,
    'spending', case when n_spenders >= k
                     then jsonb_build_object('people', n_spenders, 'total', round(spend_total),
                                             'top_categories', cats)
                     else jsonb_build_object('suppressed', true) end,
    'health', case when n_scored >= k
                   then jsonb_build_object('people', n_scored, 'avg_score', v_avg_score,
                                           'by_income_type', score_groups)
                   else jsonb_build_object('suppressed', true) end,
    'goals', case when n_goal_users >= k
                  then jsonb_build_object('people', n_goal_users, 'goals', n_goals,
                         'completed', n_goals_done,
                         'completion_rate', round(n_goals_done::numeric / nullif(n_goals, 0), 3))
                  else jsonb_build_object('suppressed', true) end,
    'roundups', case when n_roundup_users >= k
                     then jsonb_build_object('people', n_roundup_users, 'total', round(roundup_total))
                     else jsonb_build_object('suppressed', true) end,
    'learning', case when n_learners >= k
                     then jsonb_build_object('people', n_learners, 'avg_modules', v_avg_modules,
                            'graduates', n_graduates, 'modules', n_modules)
                     else jsonb_build_object('suppressed', true) end
  );
end;
$$;

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
         coach_consent_at = null, opening_balance = 0
   where id = uid;

  delete from public.goal_contributions where user_id = uid;
  delete from public.goals where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.category_rules where user_id = uid;
  delete from public.nudges where user_id = uid;
  delete from public.health_scores where user_id = uid;
  delete from public.forecasts where user_id = uid;
  delete from public.coach_messages where user_id = uid;
  delete from public.user_progress where user_id = uid;
  delete from public.gamification where user_id = uid;

  insert into public.audit_log (user_id, action, entity) values (uid, 'reset_demo', 'account');
end;
$$;

revoke all on function public.admin_insights() from public, anon;
revoke all on function public.reset_demo() from public, anon;
grant execute on function public.admin_insights() to authenticated;
grant execute on function public.reset_demo() to authenticated;
