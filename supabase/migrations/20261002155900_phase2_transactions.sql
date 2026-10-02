-- Phase 2: transactions, category rules, audit log, dashboard RPCs.

-- Wallet opening balance (current balance = opening_balance + income - spend).
alter table public.profiles add column opening_balance numeric not null default 0;
grant update (opening_balance) on public.profiles to authenticated;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Id from the upstream feed; makes re-ingesting the same feed idempotent.
  external_id text,
  amount numeric not null check (amount > 0),
  direction text not null check (direction in ('in', 'out')),
  channel text not null
    check (channel in ('send_money', 'cash_out', 'merchant', 'recharge', 'bill', 'add_money')),
  counterparty text not null default '',
  note text not null default '',
  category_id int references public.categories (id),
  category_source text not null default 'rule' check (category_source in ('rule', 'ai', 'user')),
  needs_review boolean not null default false,
  is_simulated boolean not null default false,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);
-- Not partial: PostgREST upserts (ON CONFLICT) cannot infer a partial index. NULL external_ids stay distinct.
create unique index transactions_user_external_idx on public.transactions (user_id, external_id);

alter table public.transactions enable row level security;
create policy "own transactions" on public.transactions
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Corrections the user made; the keyword is the lower-cased counterparty.
create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword text not null check (keyword = lower(btrim(keyword)) and keyword <> ''),
  category_id int not null references public.categories (id),
  created_at timestamptz not null default now(),
  unique (user_id, keyword)
);

alter table public.category_rules enable row level security;
create policy "own category rules" on public.category_rules
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.audit_log (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
-- Users can write and read only their own audit rows; they cannot edit or delete them.
create policy "insert own audit" on public.audit_log
  for insert to authenticated with check (auth.uid() = user_id);
create policy "read own audit" on public.audit_log
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.audit_log from authenticated;
grant insert (user_id, action, entity, entity_id, detail), select on public.audit_log to authenticated;
grant usage on sequence public.audit_log_id_seq to authenticated;

alter publication supabase_realtime add table public.transactions;

-- A user correction: update the transaction, remember the rule, and re-apply it to the
-- user's other transactions from the same counterparty that were not hand-corrected.
create or replace function public.set_transaction_category(p_transaction_id uuid, p_category_id int)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_keyword text;
begin
  select lower(btrim(counterparty)) into v_keyword
  from public.transactions where id = p_transaction_id;
  if not found then
    raise exception 'transaction_not_found';
  end if;

  update public.transactions
  set category_id = p_category_id, category_source = 'user', needs_review = false
  where id = p_transaction_id;

  if v_keyword <> '' then
    insert into public.category_rules (user_id, keyword, category_id)
    values (auth.uid(), v_keyword, p_category_id)
    on conflict (user_id, keyword) do update set category_id = excluded.category_id;

    update public.transactions
    set category_id = p_category_id, category_source = 'user', needs_review = false
    where lower(btrim(counterparty)) = v_keyword and category_source <> 'user';
  end if;
end;
$$;

-- Dashboard aggregates. security invoker, so RLS limits every row to the caller.
create or replace function public.dashboard_summary(p_from timestamptz, p_to timestamptz)
returns table (income numeric, expense numeric, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(amount) filter (where direction = 'in'), 0),
    coalesce(sum(amount) filter (where direction = 'out'), 0),
    count(*)
  from public.transactions
  where user_id = auth.uid() and occurred_at >= p_from and occurred_at < p_to;
$$;

create or replace function public.spend_by_category(p_from timestamptz, p_to timestamptz)
returns table (category_id int, total numeric, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select category_id, sum(amount), count(*)
  from public.transactions
  where user_id = auth.uid() and direction = 'out'
    and occurred_at >= p_from and occurred_at < p_to
  group by category_id
  order by sum(amount) desc;
$$;

-- Weeks start on Monday in Bangladesh time. Empty weeks are returned as zeros.
create or replace function public.weekly_trend(p_weeks int default 8)
returns table (week_start date, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', (now() at time zone 'Asia/Dhaka'))::date - 7 * (greatest(p_weeks, 1) - 1),
      date_trunc('week', (now() at time zone 'Asia/Dhaka'))::date,
      interval '7 days'
    )::date as week_start
  )
  select
    w.week_start,
    coalesce(sum(t.amount) filter (where t.direction = 'in'), 0),
    coalesce(sum(t.amount) filter (where t.direction = 'out'), 0)
  from weeks w
  left join public.transactions t
    on t.user_id = auth.uid()
    and date_trunc('week', (t.occurred_at at time zone 'Asia/Dhaka'))::date = w.week_start
  group by w.week_start
  order by w.week_start;
$$;

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
                from public.transactions where user_id = auth.uid()), 0);
$$;

revoke all on function public.set_transaction_category(uuid, int) from public, anon;
revoke all on function public.dashboard_summary(timestamptz, timestamptz) from public, anon;
revoke all on function public.spend_by_category(timestamptz, timestamptz) from public, anon;
revoke all on function public.weekly_trend(int) from public, anon;
revoke all on function public.wallet_balance() from public, anon;
grant execute on function public.set_transaction_category(uuid, int) to authenticated;
grant execute on function public.dashboard_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.spend_by_category(timestamptz, timestamptz) to authenticated;
grant execute on function public.weekly_trend(int) to authenticated;
grant execute on function public.wallet_balance() to authenticated;
