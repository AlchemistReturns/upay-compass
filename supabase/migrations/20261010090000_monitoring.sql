-- Monitoring: AI and product health that the Supabase dashboard cannot show.
--
-- model_events: one row per AI request (coach, voice, categorizer, learn). It holds counts,
-- durations, model names, token counts and reason codes ONLY. No content, no user id, no merchant,
-- no phone: a row cannot be traced to a person. Written by Edge Functions with the service role;
-- no policies and no grants for anon or authenticated, so the browser cannot read or write it.
--
-- system_health(hours): callable by any signed-in user (it powers the Performance page in the
-- account menu), aggregates only, one audit entry per call. model_events holds no person-level
-- data; figures computed from person-level data (payments, forecasts, active users) hide any group
-- under 5 people, the same rule as admin_insights().
--
-- Retention: purge_model_events() deletes rows older than 30 days. pg_cron is not enabled on this
-- project yet, so run it by hand (or schedule it later):
--   select public.purge_model_events();
--   -- later: select cron.schedule('purge-model-events', '17 3 * * *', 'select public.purge_model_events()');
--
-- reason_code convention (used by system_health): codes starting with 'check_' mean a validator
-- stopped or changed the model's output (a "safety check" doing its job). Every other code is a
-- technical reason (http_429, timeout, model_failed ...).

create table public.model_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  function_name text not null check (char_length(function_name) <= 64),
  -- error means the person got a failure; a request answered from the fallback path is 'ok'
  status text not null check (status in ('ok', 'error')),
  latency_ms integer check (latency_ms >= 0),
  model text check (char_length(model) <= 64),
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  fallback_used boolean not null default false,
  reason_code text check (reason_code ~ '^[a-z0-9_]{1,40}$'),
  language text check (language in ('bn', 'en'))
);

create index model_events_created_at_idx on public.model_events (created_at desc);

alter table public.model_events enable row level security;
-- deliberately no policies; service_role bypasses RLS
revoke all on public.model_events from anon, authenticated;
revoke all on sequence public.model_events_id_seq from anon, authenticated;

create or replace function public.purge_model_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from public.model_events where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_model_events() from public, anon, authenticated;

create or replace function public.system_health(p_hours int default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k constant int := 5;
  v_now timestamptz := now();
  v_since timestamptz;
  v_bucket int;
  v_n int;
  v_since30 constant timestamptz := now() - interval '30 days';
  v_overall jsonb;
  v_functions jsonb;
  v_series jsonb;
  v_models jsonb;
  v_active int;
  v_acc_people int;
  v_accuracy jsonb;
  v_fc_people int;
  v_forecast jsonb;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;

  insert into public.audit_log (user_id, action, entity)
  values (auth.uid(), 'system_health', 'aggregates');

  v_since := v_now - make_interval(hours => p_hours);
  -- about 24 to 28 buckets whatever the window
  v_bucket := greatest(1, round(p_hours / 28.0)::int);
  v_n := ceil(p_hours::numeric / v_bucket)::int;

  -- all functions together. Checked functions are the ones whose model output is validated by code;
  -- keep the list in step with CHECKED_FUNCTIONS in packages/shared/src/health-monitor.ts.
  select jsonb_build_object(
    'calls', count(*),
    'errors', count(*) filter (where status = 'error'),
    'fallbacks', count(*) filter (where fallback_used),
    'checked', count(*) filter (
      where status = 'ok'
        and function_name in ('categorize-transaction', 'voice-command', 'generate-learn-modules')
    ),
    'stopped', count(*) filter (
      where status = 'ok'
        and function_name in ('categorize-transaction', 'voice-command', 'generate-learn-modules')
        and reason_code like 'check\_%'
    ),
    'p50_ms', round((percentile_cont(0.5) within group (order by latency_ms))::numeric),
    'p95_ms', round((percentile_cont(0.95) within group (order by latency_ms))::numeric)
  ) into v_overall
  from public.model_events
  where created_at >= v_since and created_at <= v_now;

  -- per function
  select coalesce(jsonb_agg(r order by r ->> 'function_name'), '[]'::jsonb) into v_functions
  from (
    select jsonb_build_object(
      'function_name', function_name,
      'calls', count(*),
      'errors', count(*) filter (where status = 'error'),
      'fallbacks', count(*) filter (where fallback_used),
      'p50_ms', round((percentile_cont(0.5) within group (order by latency_ms))::numeric),
      'p95_ms', round((percentile_cont(0.95) within group (order by latency_ms))::numeric)
    ) as r
    from public.model_events
    where created_at >= v_since and created_at <= v_now
    group by function_name
  ) f;

  -- over time, oldest bucket first; b = 0 is the most recent
  select coalesce(jsonb_agg(item order by (item ->> 'b')::int desc), '[]'::jsonb) into v_series
  from (
    select jsonb_build_object(
      'b', g.b,
      't', v_now - make_interval(hours => (g.b + 1) * v_bucket),
      'calls', count(e.id),
      'errors', count(e.id) filter (where e.status = 'error'),
      'fallbacks', count(e.id) filter (where e.fallback_used),
      -- checked functions: the ones whose model output is validated by code. Keep in step with
      -- CHECKED_FUNCTIONS in packages/shared/src/health-monitor.ts.
      'checked', count(e.id) filter (
        where e.status = 'ok'
          and e.function_name in ('categorize-transaction', 'voice-command', 'generate-learn-modules')
      ),
      'stopped', count(e.id) filter (
        where e.status = 'ok'
          and e.function_name in ('categorize-transaction', 'voice-command', 'generate-learn-modules')
          and e.reason_code like 'check\_%'
      ),
      'p95_ms', round((percentile_cont(0.95) within group (order by e.latency_ms))::numeric),
      'tokens', coalesce((
        select jsonb_object_agg(m.model, jsonb_build_array(m.tin, m.tout))
        from (
          select e2.model, coalesce(sum(e2.tokens_in), 0) as tin, coalesce(sum(e2.tokens_out), 0) as tout
          from public.model_events e2
          where e2.model is not null
            and e2.created_at >= v_since and e2.created_at <= v_now
            and floor(extract(epoch from (v_now - e2.created_at)) / (v_bucket * 3600))::int = g.b
          group by e2.model
        ) m
      ), '{}'::jsonb)
    ) as item
    from generate_series(0, v_n - 1) as g(b)
    left join public.model_events e
      on e.created_at >= v_since and e.created_at <= v_now
     and floor(extract(epoch from (v_now - e.created_at)) / (v_bucket * 3600))::int = g.b
    group by g.b
  ) s;

  -- token totals per model (the app turns these into an estimate with its own price list)
  select coalesce(jsonb_agg(jsonb_build_object(
    'model', model, 'calls', calls, 'tokens_in', tin, 'tokens_out', tout
  ) order by model), '[]'::jsonb) into v_models
  from (
    select model, count(*) as calls,
           coalesce(sum(tokens_in), 0) as tin, coalesce(sum(tokens_out), 0) as tout
    from public.model_events
    where model is not null and created_at >= v_since and created_at <= v_now
    group by model
  ) m;

  -- people who used an AI feature in the window (rate-limit slots are written per request)
  select count(distinct user_id) into v_active
  from public.audit_log
  where user_id is not null and created_at >= v_since
    and action in ('coach_slot', 'voice_slot', 'categorize_slot', 'learn_slot');

  -- accuracy: spending payments of the last 30 days, by who filed them. Corrected = filed by a
  -- person's saved correction, which also covers later payments auto-filed by that correction.
  select count(distinct user_id) into v_acc_people
  from public.transactions where direction = 'out' and occurred_at >= v_since30;
  if v_acc_people < k then
    v_accuracy := jsonb_build_object('suppressed', true);
  else
    select jsonb_build_object(
      'people', v_acc_people,
      'payments', count(*),
      'by_rule', count(*) filter (where category_source = 'rule' and not needs_review),
      'by_ai', count(*) filter (where category_source = 'ai' and not needs_review),
      'corrected', count(*) filter (where category_source = 'user'),
      'needs_review', count(*) filter (where needs_review)
    ) into v_accuracy
    from public.transactions where direction = 'out' and occurred_at >= v_since30;
  end if;

  -- forecast: each person's latest stored backtest, model error against the seasonal-naive baseline
  with latest as (
    select distinct on (user_id) user_id, details -> 'backtest' as bt
    from public.forecasts
    order by user_id, computed_at desc
  ), usable as (
    select (bt ->> 'mae')::numeric as mae,
           (bt ->> 'naiveMae')::numeric as naive_mae,
           (bt ->> 'improvementPct')::numeric as improvement
    from latest
    where jsonb_typeof(bt) = 'object' and (bt ->> 'naiveMae')::numeric > 0
  )
  select count(*) into v_fc_people from usable;
  if v_fc_people < k then
    v_forecast := jsonb_build_object('suppressed', true);
  else
    with latest as (
      select distinct on (user_id) user_id, details -> 'backtest' as bt
      from public.forecasts
      order by user_id, computed_at desc
    ), usable as (
      select (bt ->> 'mae')::numeric as mae,
             (bt ->> 'naiveMae')::numeric as naive_mae,
             (bt ->> 'improvementPct')::numeric as improvement
      from latest
      where jsonb_typeof(bt) = 'object' and (bt ->> 'naiveMae')::numeric > 0
    )
    select jsonb_build_object(
      'people', count(*),
      'better', count(*) filter (where mae < naive_mae),
      'median_improvement_pct', round((percentile_cont(0.5) within group (order by improvement))::numeric)
    ) into v_forecast from usable;
  end if;

  return jsonb_build_object(
    'hours', p_hours,
    'bucket_hours', v_bucket,
    'generated_at', v_now,
    'min_group_size', k,
    'overall', v_overall,
    'functions', v_functions,
    'series', v_series,
    'models', v_models,
    'active_users', case when v_active < k
                         then jsonb_build_object('suppressed', true)
                         else jsonb_build_object('people', v_active) end,
    'accuracy', v_accuracy,
    'forecast', v_forecast
  );
end;
$$;

revoke all on function public.system_health(int) from public, anon;
grant execute on function public.system_health(int) to authenticated;
