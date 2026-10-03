-- Phase 10: voice commands. Consent to send voice recordings and spoken-command text to OpenAI.
-- Separate from the coach consent: the recording itself leaves the device, and the transcript can
-- name a merchant. Audio is never stored; the functions only write an audit entry.

alter table public.profiles add column voice_consent_at timestamptz;
grant update (voice_consent_at) on public.profiles to authenticated;

-- Reset demo also clears the voice consent.
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
