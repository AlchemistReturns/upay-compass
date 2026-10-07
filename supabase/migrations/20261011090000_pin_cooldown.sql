-- PIN attempts back off instead of wiping the PIN after 5 tries.
-- Wrong attempts 1-2 cost nothing; the 3rd to 7th each start a longer wait (30 s, 1, 2, 5, 15 min)
-- during which verify_pin refuses to check anything (so waiting is the only way forward and a
-- script cannot guess faster). The 8th wrong attempt clears the PIN, as before: the client signs
-- the person out and they must prove the phone again with an OTP and set a new PIN.
-- A typo streak no longer throws a person out; a guesser gets about the same few tries.

alter table public.user_pins
  add column locked_until timestamptz;

-- Same signature as before; the result gains `locked_seconds` (0 when not waiting).
create or replace function public.verify_pin(pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.user_pins%rowtype;
  max_attempts constant int := 8;
  free_attempts constant int := 2;
  waits constant int[] := array[30, 60, 120, 300, 900];
  new_failed int;
  wait_s int;
  left_s int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into rec from public.user_pins where user_id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'reset', true, 'locked_seconds', 0);
  end if;

  -- Still waiting: do not check the PIN and do not count the try.
  if rec.locked_until is not null and rec.locked_until > now() then
    left_s := ceil(extract(epoch from (rec.locked_until - now())))::int;
    return jsonb_build_object(
      'ok', false,
      'attempts_left', max_attempts - rec.failed_attempts,
      'reset', false,
      'locked_seconds', left_s
    );
  end if;

  if pin is not null and rec.pin_hash = extensions.crypt(pin, rec.pin_hash) then
    update public.user_pins set failed_attempts = 0, locked_until = null
      where user_id = auth.uid();
    return jsonb_build_object(
      'ok', true, 'attempts_left', max_attempts, 'reset', false, 'locked_seconds', 0
    );
  end if;

  new_failed := rec.failed_attempts + 1;
  if new_failed >= max_attempts then
    delete from public.user_pins where user_id = auth.uid();
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'reset', true, 'locked_seconds', 0);
  end if;

  wait_s := case
    when new_failed <= free_attempts then 0
    else waits[least(new_failed - free_attempts, array_length(waits, 1))]
  end;
  update public.user_pins
    set failed_attempts = new_failed,
        locked_until = case when wait_s > 0 then now() + make_interval(secs => wait_s) else null end
    where user_id = auth.uid();
  return jsonb_build_object(
    'ok', false,
    'attempts_left', max_attempts - new_failed,
    'reset', false,
    'locked_seconds', wait_s
  );
end;
$$;

revoke all on function public.verify_pin(text) from public, anon;
grant execute on function public.verify_pin(text) to authenticated;
