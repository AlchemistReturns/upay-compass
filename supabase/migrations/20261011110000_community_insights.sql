-- Community insights for every signed-in person: the same kind of group figures the admin sees,
-- shown next to the caller's own number so they can see where they stand.
--
-- Group figures only: never a row about another person, and any figure computed from fewer than
-- `k` people is hidden (small groups could identify someone). The caller's own numbers are their own
-- data. Unlike admin_insights() this is not written to the audit log (it is the person's own page).

create or replace function public.community_insights()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  k constant int := 5;
  since30 constant timestamptz := now() - interval '30 days';
  n_spenders int;
  spend_total numeric;
  my_total numeric;
  cats jsonb;
  n_scored int;
  v_avg_score numeric;
  my_score numeric;
  my_type text;
  n_type int;
  type_avg numeric;
  n_goal_users int;
  n_goals int;
  n_goals_done int;
  my_goals int;
  my_goals_done int;
  n_roundup_users int;
  roundup_total numeric;
  my_roundup numeric;
  n_learners int;
  v_avg_modules numeric;
  n_modules int;
  my_modules int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Spending by category, last 30 days (saving into a goal is not spending)
  select count(distinct t.user_id), coalesce(sum(t.amount), 0)
    into n_spenders, spend_total
    from public.transactions t
    join public.categories c on c.id = t.category_id
   where t.direction = 'out' and c.key <> 'savings' and t.occurred_at >= since30;

  select coalesce(sum(t.amount), 0) into my_total
    from public.transactions t
    join public.categories c on c.id = t.category_id
   where t.user_id = uid and t.direction = 'out' and c.key <> 'savings' and t.occurred_at >= since30;

  select coalesce(jsonb_agg(item order by (item ->> 'share')::numeric desc), '[]'::jsonb)
    into cats
    from (
      select jsonb_build_object(
               'key', c.key, 'name_en', c.name_en, 'name_bn', c.name_bn,
               'share', round(sum(t.amount) / nullif(spend_total, 0), 3),
               'people', count(distinct t.user_id),
               'mine_share', case when my_total > 0 then round(
                   coalesce((select sum(m.amount) from public.transactions m
                              where m.user_id = uid and m.category_id = c.id and m.direction = 'out'
                                and m.occurred_at >= since30), 0) / my_total, 3) else null end) as item
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
    select distinct on (h.user_id) h.user_id, h.score
      from public.health_scores h
     order by h.user_id, h.computed_at desc
  )
  select count(*), round(avg(score), 1), max(score) filter (where user_id = uid)
    into n_scored, v_avg_score, my_score from latest;

  select income_type into my_type from public.profiles where id = uid;
  with latest as (
    select distinct on (h.user_id) h.user_id, h.score
      from public.health_scores h
     order by h.user_id, h.computed_at desc
  )
  select count(*), round(avg(l.score), 1) into n_type, type_avg
    from latest l join public.profiles p on p.id = l.user_id
   where my_type is not null and p.income_type = my_type;

  -- Goals
  select count(distinct user_id), count(*), count(*) filter (where status = 'completed')
    into n_goal_users, n_goals, n_goals_done
    from public.goals where status <> 'archived';
  select count(*), count(*) filter (where status = 'completed')
    into my_goals, my_goals_done
    from public.goals where user_id = uid and status <> 'archived';

  -- Round-up savings
  select count(distinct user_id), coalesce(sum(amount), 0)
    into n_roundup_users, roundup_total
    from public.goal_contributions where source = 'roundup';
  select coalesce(sum(amount), 0) into my_roundup
    from public.goal_contributions where user_id = uid and source = 'roundup';

  -- Learning
  select count(*) into n_modules from public.learn_modules;
  select count(*), coalesce(round(avg(done), 1), 0)
    into n_learners, v_avg_modules
    from (select user_id, count(*) as done from public.user_progress group by user_id) q;
  select count(*) into my_modules from public.user_progress where user_id = uid;

  return jsonb_build_object(
    'min_group_size', k,
    'generated_at', now(),
    'spending', case when n_spenders >= k
                     then jsonb_build_object('people', n_spenders, 'top_categories', cats)
                     else jsonb_build_object('suppressed', true) end,
    'health', case when n_scored >= k
                   then jsonb_build_object('people', n_scored, 'avg_score', v_avg_score,
                          'mine', my_score,
                          'type_people', case when n_type >= k then n_type else null end,
                          'type_avg', case when n_type >= k then type_avg else null end)
                   else jsonb_build_object('suppressed', true) end,
    'goals', case when n_goal_users >= k
                  then jsonb_build_object('people', n_goal_users,
                         'completion_rate', round(n_goals_done::numeric / nullif(n_goals, 0), 3),
                         'mine_goals', my_goals, 'mine_completed', my_goals_done)
                  else jsonb_build_object('suppressed', true) end,
    'roundups', case when n_roundup_users >= k
                     then jsonb_build_object('people', n_roundup_users,
                            'avg_per_person', round(roundup_total / n_roundup_users),
                            'mine', round(my_roundup))
                     else jsonb_build_object('suppressed', true) end,
    'learning', case when n_learners >= k
                     then jsonb_build_object('people', n_learners, 'avg_modules', v_avg_modules,
                            'modules', n_modules, 'mine', my_modules)
                     else jsonb_build_object('suppressed', true) end
  );
end;
$$;

revoke all on function public.community_insights() from public, anon;
grant execute on function public.community_insights() to authenticated;
