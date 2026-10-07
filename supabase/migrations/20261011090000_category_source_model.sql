-- A fourth way a payment can get its category: the on-device pattern model (ML_CATEGORIZE=on).
-- Rows it labels are stored with category_source = 'model', so the explain card can say so and the
-- accuracy numbers can tell the model's labels from rule and AI labels. Nothing else changes.
alter table public.transactions
  drop constraint if exists transactions_category_source_check;

alter table public.transactions
  add constraint transactions_category_source_check
  check (category_source in ('rule', 'ai', 'user', 'model'));
