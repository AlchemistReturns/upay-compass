-- Phase 7: credit readiness scorecard (informational only).
-- Snapshots are written only by the compute-readiness-score function (service role), so a
-- score always comes from code, never from the client. Same pattern as health_scores.

create table public.readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score int not null check (score between 0 and 100),
  breakdown jsonb not null,
  computed_at timestamptz not null default now()
);

create index readiness_scores_user_computed_idx
  on public.readiness_scores (user_id, computed_at desc);

alter table public.readiness_scores enable row level security;
create policy "read own readiness" on public.readiness_scores
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.readiness_scores from authenticated;
grant select on public.readiness_scores to authenticated;

alter publication supabase_realtime add table public.readiness_scores;

-- Which of the last six calendar months (Bangladesh time, newest first) had any saving
-- (a goal contribution or a round-up), and the day of the user's first transaction.
-- RLS applies (security invoker): the caller's own rows only.
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
                'active', exists (
                  select 1 from public.goal_contributions c
                   where c.user_id = auth.uid()
                     and (c.created_at at time zone 'Asia/Dhaka') >= m.start
                     and (c.created_at at time zone 'Asia/Dhaka') < m.start + interval '1 month')
              ) order by m.start desc), '[]'::jsonb)
         from (select (date_trunc('month', now() at time zone 'Asia/Dhaka')
                        - make_interval(months => i)) as start
                 from generate_series(0, 5) as i) m)
  );
$$;

revoke all on function public.savings_activity() from public, anon;
grant execute on function public.savings_activity() to authenticated;

-- Reset demo also clears the readiness history.
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
  delete from public.readiness_scores where user_id = uid;
  delete from public.forecasts where user_id = uid;
  delete from public.coach_messages where user_id = uid;
  delete from public.user_progress where user_id = uid;
  delete from public.gamification where user_id = uid;

  insert into public.audit_log (user_id, action, entity) values (uid, 'reset_demo', 'account');
end;
$$;
