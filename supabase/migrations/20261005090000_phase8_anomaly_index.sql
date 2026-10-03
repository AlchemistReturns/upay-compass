-- Phase 8: unusual-payment detection looks up a user's earlier payments by category and time.
-- The existing index is (user_id, occurred_at desc) only, so category lookups would scan.
create index if not exists transactions_user_category_occurred_idx
  on public.transactions (user_id, category_id, occurred_at desc);
