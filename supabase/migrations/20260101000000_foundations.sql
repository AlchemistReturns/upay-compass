-- Phase 0: profiles, categories, signup trigger, RLS.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text,
  language text not null default 'bn' check (language in ('bn', 'en')),
  income_type text check (income_type in ('student', 'gig', 'salaried')),
  monthly_income numeric check (monthly_income >= 0),
  onboarded boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Users may only edit these columns; role/phone/id stay server-controlled.
revoke update on public.profiles from authenticated;
grant update (full_name, language, income_type, monthly_income, onboarded)
  on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.categories (
  id serial primary key,
  key text not null unique,
  name_en text not null,
  name_bn text not null,
  icon text not null,
  is_essential boolean not null default false
);

alter table public.categories enable row level security;

create policy "categories readable" on public.categories
  for select to authenticated using (true);

-- Reference data lives in a migration so `db push` to the cloud project includes it.
insert into public.categories (key, name_en, name_bn, icon, is_essential) values
  ('food',          'Food',               'খাবার',            'utensils',      true),
  ('transport',     'Transport',          'যাতায়াত',         'bus',           true),
  ('recharge_data', 'Recharge & Data',    'রিচার্জ ও ডেটা',   'smartphone',    true),
  ('bills',         'Bills & Utilities',  'বিল ও ইউটিলিটি',   'receipt',       true),
  ('education',     'Education',          'শিক্ষা',           'graduation-cap', true),
  ('shopping',      'Shopping',           'কেনাকাটা',         'shopping-bag',  false),
  ('family',        'Family & Transfers', 'পরিবার ও লেনদেন',  'users',         false),
  ('health',        'Health',             'স্বাস্থ্য',        'heart-pulse',   true),
  ('entertainment', 'Entertainment',      'বিনোদন',           'clapperboard',  false),
  ('savings',       'Savings',            'সঞ্চয়',           'piggy-bank',    false),
  ('income',        'Income',             'আয়',              'banknote',      false),
  ('other',         'Other',              'অন্যান্য',          'circle-help',   false)
on conflict (key) do update set
  name_en = excluded.name_en,
  name_bn = excluded.name_bn,
  icon = excluded.icon,
  is_essential = excluded.is_essential;
