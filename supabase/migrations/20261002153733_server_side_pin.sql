-- Server-side app PIN.
-- The bcrypt hash and the failed-attempt counter live in a table that clients cannot read
-- or write. Clients only call has_pin / set_pin / verify_pin.

create table public.user_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies and no grants: only the security definer functions below can touch it.
alter table public.user_pins enable row level security;
revoke all on public.user_pins from anon, authenticated;

create or replace function public.has_pin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_pins where user_id = auth.uid());
$$;

-- First-time PIN only. A forgotten PIN is cleared by 5 wrong attempts in verify_pin.
create or replace function public.set_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if new_pin is null or new_pin !~ '^\d{4,6}$' then
    raise exception 'invalid_pin';
  end if;
  if exists (select 1 from public.user_pins where user_id = auth.uid()) then
    raise exception 'pin_already_set';
  end if;
  insert into public.user_pins (user_id, pin_hash)
  values (auth.uid(), extensions.crypt(new_pin, extensions.gen_salt('bf', 8)));
end;
$$;

-- Returns {ok, attempts_left, reset}. The 5th wrong attempt deletes the PIN (reset = true),
-- and the client signs the user out so they must log in with an OTP and set a new PIN.
create or replace function public.verify_pin(pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.user_pins%rowtype;
  max_attempts constant int := 5;
  new_failed int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into rec from public.user_pins where user_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'reset', true);
  end if;

  if pin is not null and rec.pin_hash = extensions.crypt(pin, rec.pin_hash) then
    update public.user_pins set failed_attempts = 0 where user_id = auth.uid();
    return jsonb_build_object('ok', true, 'attempts_left', max_attempts, 'reset', false);
  end if;

  new_failed := rec.failed_attempts + 1;
  if new_failed >= max_attempts then
    delete from public.user_pins where user_id = auth.uid();
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'reset', true);
  end if;

  update public.user_pins set failed_attempts = new_failed where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'attempts_left', max_attempts - new_failed, 'reset', false);
end;
$$;

revoke all on function public.has_pin() from public, anon;
revoke all on function public.set_pin(text) from public, anon;
revoke all on function public.verify_pin(text) from public, anon;
grant execute on function public.has_pin() to authenticated;
grant execute on function public.set_pin(text) to authenticated;
grant execute on function public.verify_pin(text) to authenticated;
