-- Retention: purge_expired_data() removes operational data that has outlived its purpose.
--
-- The periods are the constants at the top of the function, and nowhere else. docs/pitch/data-retention.md
-- lists the same values; change both together.
--
--   rate-limit slots    1 day    audit_log rows with entity = 'limit' (the longest window is 10 minutes)
--   audit entries      90 days   every other audit_log row (counts and outcomes, never content)
--   model events       30 days   model_events (system_health() never looks back further than 30 days)
--   coach history      90 days   coach_messages (the stored chat text)
--   passkey challenges  1 day    passkey_challenges (a challenge is only valid for 5 minutes)
--
-- NOT purged: a person's own transactions, budgets, goals, savings, scores and progress. They stay
-- until the person deletes them or deletes their account (delete-account Edge Function).
--
-- Only the service role (and the database owner, which pg_cron runs as) can call it.

create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- retention periods: the one place they are defined
  rate_limit_days constant int := 1;
  audit_days constant int := 90;
  model_event_days constant int := 30;
  coach_message_days constant int := 90;
  passkey_challenge_days constant int := 1;
  n_limits bigint;
  n_audit bigint;
  n_model bigint;
  n_coach bigint;
  n_challenges bigint;
begin
  delete from public.audit_log
   where entity = 'limit' and created_at < now() - make_interval(days => rate_limit_days);
  get diagnostics n_limits = row_count;

  delete from public.audit_log
   where entity is distinct from 'limit' and created_at < now() - make_interval(days => audit_days);
  get diagnostics n_audit = row_count;

  delete from public.model_events
   where created_at < now() - make_interval(days => model_event_days);
  get diagnostics n_model = row_count;

  delete from public.coach_messages
   where created_at < now() - make_interval(days => coach_message_days);
  get diagnostics n_coach = row_count;

  delete from public.passkey_challenges
   where created_at < now() - make_interval(days => passkey_challenge_days);
  get diagnostics n_challenges = row_count;

  return jsonb_build_object(
    'rate_limit_rows', n_limits,
    'audit_rows', n_audit,
    'model_events', n_model,
    'coach_messages', n_coach,
    'passkey_challenges', n_challenges
  );
end;
$$;

revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

-- Schedule it daily at 03:17 UTC when pg_cron can be enabled (Supabase cloud and the local stack
-- both ship it). If it cannot, the migration still succeeds and the function is run by hand:
--   select public.purge_expired_data();
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('purge-expired-data')
    where exists (select 1 from cron.job where jobname = 'purge-expired-data');
  perform cron.schedule('purge-expired-data', '17 3 * * *', 'select public.purge_expired_data()');
exception when others then
  raise notice 'pg_cron not scheduled (%); run select public.purge_expired_data() by hand', sqlerrm;
end;
$$;
