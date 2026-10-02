-- Categories are public reference data; allow the pre-login app shell to read them.
drop policy "categories readable" on public.categories;

create policy "categories readable" on public.categories
  for select to anon, authenticated using (true);
