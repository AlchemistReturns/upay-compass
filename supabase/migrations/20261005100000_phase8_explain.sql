-- Phase 8: "why this decision". Returns the facts the database knows about one payment: how its
-- category was decided (rule, AI or the user's own correction), which saved correction applies,
-- and the unusual-payment alert raised for it, if any. The app turns these facts into sentences
-- from translation templates; no text comes from a model. Security invoker: RLS applies, so a
-- user can only ever ask about their own payments.
create or replace function public.transaction_explain(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'category_source', t.category_source,
    'needs_review', t.needs_review,
    'category_key', c.key,
    'user_rule_keyword', (
      select r.keyword from public.category_rules r
       where r.user_id = t.user_id and r.keyword = lower(btrim(t.counterparty))),
    'anomaly', (
      select jsonb_build_object(
               'rule', n.data ->> 'rule',
               'bucket', n.data ->> 'bucket',
               'amount', (n.data ->> 'amount')::numeric,
               'typical', (n.data ->> 'typical')::numeric,
               'z', (n.data ->> 'z')::numeric,
               'observations', (n.data ->> 'observations')::int)
        from public.nudges n
       where n.user_id = t.user_id and n.type = 'unusual_transaction'
         and n.data ->> 'transaction_id' = t.id::text
       limit 1)
  )
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.id = p_id;
$$;

revoke all on function public.transaction_explain(uuid) from public, anon;
grant execute on function public.transaction_explain(uuid) to authenticated;
