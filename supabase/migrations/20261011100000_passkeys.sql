-- Passkeys (WebAuthn): fingerprint / face / screen-lock unlock for the app lock screen.
-- A passkey replaces typing the PIN on this device; it does not replace the OTP login. The private
-- key never leaves the phone. Only the public key and a signature counter are stored, in tables
-- clients cannot touch: the `passkey` Edge Function (service role) writes them after it has verified
-- the signed challenge, and clients only list or remove their own passkeys through the functions below.

create table public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_name text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index user_passkeys_user_idx on public.user_passkeys (user_id);

-- One pending challenge per person; it is deleted when used and ignored after 5 minutes.
create table public.passkey_challenges (
  user_id uuid primary key references auth.users (id) on delete cascade,
  challenge text not null,
  kind text not null check (kind in ('register', 'authenticate')),
  created_at timestamptz not null default now()
);

alter table public.user_passkeys enable row level security;
alter table public.passkey_challenges enable row level security;
revoke all on public.user_passkeys from anon, authenticated;
revoke all on public.passkey_challenges from anon, authenticated;

create or replace function public.list_passkeys()
returns table (id uuid, device_name text, created_at timestamptz, last_used_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.device_name, p.created_at, p.last_used_at
  from public.user_passkeys p
  where p.user_id = auth.uid()
  order by p.created_at;
$$;

create or replace function public.delete_passkey(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.user_passkeys where id = p_id and user_id = auth.uid();
end;
$$;

revoke all on function public.list_passkeys() from public, anon;
revoke all on function public.delete_passkey(uuid) from public, anon;
grant execute on function public.list_passkeys() to authenticated;
grant execute on function public.delete_passkey(uuid) to authenticated;
