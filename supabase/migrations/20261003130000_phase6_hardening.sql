-- Phase 6 hardening, found by scripts/audit-rls.mjs.
--
-- 1. The wallet opening balance is server-controlled: only the loading functions (service role)
--    write it, so a user cannot edit their own balance from the browser.
-- 2. Row level security already blocks anonymous users everywhere, but Supabase also grants them
--    table privileges by default. Remove those (defense in depth); the category list stays
--    readable before login.
-- 3. Trigger functions are not meant to be called by anyone.

revoke update (opening_balance) on public.profiles from authenticated;

revoke all on all tables in schema public from anon;
grant select on public.categories to anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke all on function public.apply_roundup() from public, anon, authenticated;
revoke all on function public.budgets_check_budget() from public, anon, authenticated;
revoke all on function public.goal_contribution_added() from public, anon, authenticated;
revoke all on function public.goal_contribution_removed() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.transactions_check_budget() from public, anon, authenticated;
