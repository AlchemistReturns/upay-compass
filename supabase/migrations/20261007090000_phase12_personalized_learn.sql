-- Phase 12 (F28): personalized "Made for you" learn modules.
-- Additive only: one new table and one function. Nothing existing changes.
--
-- Rows are written only by the generate-learn-modules Edge Function with the service role, and only
-- after the text has passed the validator in packages/shared/src/learn-validate.ts. Users can read
-- their own rows, and change only their own progress on them (finished, quick-check score,
-- thumbs up/down, "not for me") through update_personalized_module(), so the content and the facts
-- it was written from can never be edited from the browser.

create table public.personalized_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id text not null,
  language text not null check (language in ('bn', 'en')),
  -- the validated module: title, summary, sections, try_this, quick_check, minutes
  content jsonb not null,
  -- the numbers and ids the text was written from (no names, merchants or transactions)
  facts jsonb not null,
  -- why it was picked; the app renders the sentence from this id, never from model text
  reason_id text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  quick_check_score int check (quick_check_score between 0 and 3),
  feedback smallint check (feedback in (-1, 1)),
  dismissed_at timestamptz,
  unique (user_id, topic_id, language)
);

create index personalized_modules_user_idx
  on public.personalized_modules (user_id, language, generated_at desc);

alter table public.personalized_modules enable row level security;
create policy "read own personalized modules" on public.personalized_modules
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.personalized_modules from anon, authenticated;
grant select on public.personalized_modules to authenticated;
-- Not added to the realtime publication: the other learn tables (learn_modules, user_progress,
-- gamification) are not in it either; the app refreshes after its own writes.

-- The only way a user changes a row: their own progress on their own module. A null argument
-- leaves that field as it is. p_feedback 0 clears the thumbs; p_dismissed false undoes "not for me".
-- Finishing a personalized module does not touch user_progress, streaks or badges.
create or replace function public.update_personalized_module(
  p_id uuid,
  p_completed boolean default null,
  p_quick_check_score int default null,
  p_feedback smallint default null,
  p_dismissed boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  questions int;
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select jsonb_array_length(content -> 'quick_check') into questions
    from public.personalized_modules
   where id = p_id and user_id = uid;
  if not found then
    raise exception 'unknown module' using errcode = '22023';
  end if;
  if p_quick_check_score is not null
     and (p_quick_check_score < 0 or p_quick_check_score > coalesce(questions, 0)) then
    raise exception 'invalid score' using errcode = '22023';
  end if;
  if p_feedback is not null and p_feedback not in (-1, 0, 1) then
    raise exception 'invalid feedback' using errcode = '22023';
  end if;

  update public.personalized_modules
     set completed_at = case
           when p_completed is null then completed_at
           when p_completed then coalesce(completed_at, now())
           else null end,
         quick_check_score = coalesce(p_quick_check_score, quick_check_score),
         feedback = case
           when p_feedback is null then feedback
           when p_feedback = 0 then null
           else p_feedback end,
         dismissed_at = case
           when p_dismissed is null then dismissed_at
           when p_dismissed then coalesce(dismissed_at, now())
           else null end
   where id = p_id and user_id = uid
  returning jsonb_build_object(
    'id', id,
    'completed_at', completed_at,
    'quick_check_score', quick_check_score,
    'feedback', feedback,
    'dismissed_at', dismissed_at)
    into result;
  return result;
end;
$$;

revoke all on function public.update_personalized_module(uuid, boolean, int, smallint, boolean)
  from public, anon;
grant execute on function public.update_personalized_module(uuid, boolean, int, smallint, boolean)
  to authenticated;
