-- Phase 5: learn hub, progress, streaks and badges.
-- Reference content is read-only for users. Progress and gamification state change only through
-- security definer functions, so a badge or a streak cannot be forged from the browser.

-- ---------------------------------------------------------------------------------------------
-- Learn modules (content lands in the next migration)
-- ---------------------------------------------------------------------------------------------
create table public.learn_modules (
  id serial primary key,
  slug text not null unique,
  position int not null,
  level int not null check (level between 1 and 3),
  minutes int not null default 3 check (minutes > 0),
  title_en text not null,
  title_bn text not null,
  summary_en text not null,
  summary_bn text not null,
  body_md_en text not null,
  body_md_bn text not null
);

alter table public.learn_modules enable row level security;
create policy "read learn modules" on public.learn_modules for select to authenticated using (true);
revoke all on public.learn_modules from anon, authenticated;
grant select on public.learn_modules to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Progress: one row per finished module. Written only by complete_module().
-- ---------------------------------------------------------------------------------------------
create table public.user_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  module_id int not null references public.learn_modules (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

alter table public.user_progress enable row level security;
create policy "read own progress" on public.user_progress
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Gamification: streak and badges. Written only by touch_activity() / complete_module().
-- badges: [{"id": "first_goal", "earned_at": "..."}]
-- ---------------------------------------------------------------------------------------------
create table public.gamification (
  user_id uuid primary key references auth.users (id) on delete cascade,
  streak_days int not null default 0,
  last_active date,
  badges jsonb not null default '[]'::jsonb
);

alter table public.gamification enable row level security;
create policy "read own gamification" on public.gamification
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.gamification from anon, authenticated;
grant select on public.gamification to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Badge rules. Evaluated in the database from the user's own rows.
--   first_goal       created at least one savings goal
--   streak_7         opened the app on 7 days in a row
--   budget_master    has a budget at least a week old and none is over its limit this month
--   module_graduate  finished every learn module
-- ---------------------------------------------------------------------------------------------
create or replace function public.award_badges(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  have text[];
  streak int;
  earned text[] := '{}';
  candidate text;
begin
  select coalesce(array_agg(b ->> 'id') filter (where b is not null), '{}'), max(g.streak_days)
    into have, streak
    from public.gamification g
    left join lateral jsonb_array_elements(g.badges) b on true
   where g.user_id = p_user;

  for candidate in
    select id from (values
      ('first_goal', exists (select 1 from public.goals where user_id = p_user)),
      ('streak_7', coalesce(streak, 0) >= 7),
      ('budget_master',
        exists (select 1 from public.budgets b
                 where b.user_id = p_user and b.created_at <= now() - interval '7 days')
        and not exists (
          select 1 from public.budgets b
           where b.user_id = p_user
             and b.limit_amount < coalesce((
               select sum(t.amount) from public.transactions t
                where t.user_id = p_user and t.category_id = b.category_id
                  and t.direction = 'out' and t.occurred_at >= public.dhaka_month_start()), 0))),
      ('module_graduate',
        (select count(*) from public.learn_modules) > 0
        and (select count(*) from public.user_progress where user_id = p_user)
            >= (select count(*) from public.learn_modules))
    ) as rules (id, ok)
    where ok
  loop
    if not (candidate = any (have)) then
      earned := earned || candidate;
    end if;
  end loop;

  if array_length(earned, 1) is not null then
    update public.gamification
       set badges = badges || (
         select jsonb_agg(jsonb_build_object('id', e, 'earned_at', now())) from unnest(earned) e)
     where user_id = p_user;
  end if;
  return earned;
end;
$$;

create or replace function public.gamification_state(p_user uuid, p_new text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'streak_days', g.streak_days,
    'badges', g.badges,
    'new_badges', to_jsonb(coalesce(p_new, '{}'::text[])))
  from public.gamification g where g.user_id = p_user;
$$;

-- Call when the app opens (and after something that may earn a badge, like creating a goal).
-- Updates the streak once per Bangladesh day, then awards any badges now earned.
create or replace function public.touch_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Dhaka')::date;
  fresh text[];
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.gamification (user_id, streak_days, last_active)
  values (uid, 1, today)
  on conflict (user_id) do update
    set streak_days = case
          when public.gamification.last_active = today then public.gamification.streak_days
          when public.gamification.last_active = today - 1 then public.gamification.streak_days + 1
          else 1 end,
        last_active = today;

  fresh := public.award_badges(uid);
  return public.gamification_state(uid, fresh);
end;
$$;

-- Mark a module finished (idempotent) and award Module Graduate when it was the last one.
create or replace function public.complete_module(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  module_row int;
  fresh text[];
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into module_row from public.learn_modules where slug = p_slug;
  if module_row is null then
    raise exception 'unknown module' using errcode = '22023';
  end if;

  insert into public.gamification (user_id) values (uid) on conflict (user_id) do nothing;
  insert into public.user_progress (user_id, module_id) values (uid, module_row)
    on conflict (user_id, module_id) do nothing;

  fresh := public.award_badges(uid);
  return public.gamification_state(uid, fresh);
end;
$$;

revoke all on function public.award_badges(uuid) from public, anon, authenticated;
revoke all on function public.gamification_state(uuid, text[]) from public, anon, authenticated;
revoke all on function public.touch_activity() from public, anon;
revoke all on function public.complete_module(text) from public, anon;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.complete_module(text) to authenticated;
