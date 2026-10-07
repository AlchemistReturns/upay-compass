import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * RLS check with two real users. Needs a running Supabase stack, so it only runs when
 * RLS_TEST_URL and RLS_TEST_ANON_KEY are set:
 *   RLS_TEST_URL=http://127.0.0.1:54321 RLS_TEST_ANON_KEY=<pnpm sb status> pnpm --filter @compass/shared test
 */
describe.skipIf(!url || !anon)("RLS with two users", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await signIn("+8801700000001");
    b = await signIn("+8801700000002");
  });

  it("each user sees only their own profile", async () => {
    const { data } = await a.client.from("profiles").select("id");
    expect(data?.map((r) => r.id)).toEqual([a.id]);
  });

  it("cannot update another user's profile", async () => {
    const { data } = await b.client
      .from("profiles")
      .update({ full_name: "hacked" })
      .eq("id", a.id)
      .select();
    expect(data).toEqual([]);
  });

  it("cannot change own role", async () => {
    const { error } = await a.client.from("profiles").update({ role: "admin" }).eq("id", a.id);
    expect(error).not.toBeNull();
  });

  it("goals are private, and saved_amount is not client-writable", async () => {
    const ins = await a.client
      .from("goals")
      .insert({ user_id: a.id, title: "Phone", target_amount: 5000 })
      .select()
      .single();
    expect(ins.error).toBeNull();

    const seenByB = await b.client.from("goals").select("id").eq("id", ins.data!.id);
    expect(seenByB.data).toEqual([]);

    const forged = await b.client
      .from("goals")
      .insert({ user_id: a.id, title: "Forged", target_amount: 1 });
    expect(forged.error).not.toBeNull();

    const cheat = await a.client
      .from("goals")
      .update({ saved_amount: 999999 })
      .eq("id", ins.data!.id);
    expect(cheat.error).not.toBeNull();

    await a.client.from("goals").delete().eq("id", ins.data!.id);
  });
});

const service = process.env.RLS_TEST_SERVICE_KEY;

describe.skipIf(!url || !anon || !service)("server-side PIN", () => {
  let u: TestUser;
  const admin = () => createClient(url!, service!, { auth: { persistSession: false } });

  // The PIN table is closed to clients, so tests reset it with the service key.
  async function clearPin(userId = u.id) {
    await admin().from("user_pins").delete().eq("user_id", userId);
  }
  // Pretend the wait between tries has passed.
  async function endWait() {
    await admin()
      .from("user_pins")
      .update({ locked_until: new Date(Date.now() - 1000).toISOString() })
      .eq("user_id", u.id);
  }

  beforeAll(async () => {
    u = await signIn("+8801700000003");
    await clearPin();
  });

  it("the PIN table is not readable or writable by clients", async () => {
    const read = await u.client.from("user_pins").select("*");
    expect(read.error).not.toBeNull();
    const write = await u.client.from("user_pins").insert({ user_id: u.id, pin_hash: "x" });
    expect(write.error).not.toBeNull();
  });

  it("anonymous callers cannot use the PIN functions", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    expect((await anonClient.rpc("has_pin")).error).not.toBeNull();
    expect((await anonClient.rpc("verify_pin", { pin: "1234" })).error).not.toBeNull();
  });

  it("rejects malformed PINs", async () => {
    expect((await u.client.rpc("set_pin", { new_pin: "12" })).error).not.toBeNull();
    expect((await u.client.rpc("set_pin", { new_pin: "12ab" })).error).not.toBeNull();
    expect((await u.client.rpc("has_pin")).data).toBe(false);
  });

  it("sets once, verifies, and counts failures", async () => {
    expect((await u.client.rpc("set_pin", { new_pin: "4321" })).error).toBeNull();
    expect((await u.client.rpc("has_pin")).data).toBe(true);
    expect((await u.client.rpc("set_pin", { new_pin: "1111" })).error).not.toBeNull();

    const wrong = await u.client.rpc("verify_pin", { pin: "9999" });
    expect(wrong.data).toMatchObject({ ok: false, attempts_left: 7, reset: false });

    // a correct PIN resets the counter
    expect((await u.client.rpc("verify_pin", { pin: "4321" })).data).toMatchObject({ ok: true });
    const again = await u.client.rpc("verify_pin", { pin: "9999" });
    expect(again.data).toMatchObject({ attempts_left: 7, locked_seconds: 0 });
  });

  it("makes the person wait after repeated wrong tries, and the wait is enforced", async () => {
    await clearPin();
    await u.client.rpc("set_pin", { new_pin: "4321" });
    // two free wrong tries, the third starts a 30 second wait
    expect((await u.client.rpc("verify_pin", { pin: "9999" })).data).toMatchObject({
      locked_seconds: 0,
    });
    expect((await u.client.rpc("verify_pin", { pin: "9999" })).data).toMatchObject({
      locked_seconds: 0,
    });
    const third = await u.client.rpc("verify_pin", { pin: "9999" });
    expect(third.data).toMatchObject({ ok: false, attempts_left: 5, reset: false });
    expect((third.data as { locked_seconds: number }).locked_seconds).toBe(30);

    // during the wait even the right PIN is refused, and the try is not counted
    const during = await u.client.rpc("verify_pin", { pin: "4321" });
    expect(during.data).toMatchObject({ ok: false, attempts_left: 5, reset: false });
    expect((during.data as { locked_seconds: number }).locked_seconds).toBeGreaterThan(0);

    // after the wait the right PIN works and clears the counter
    await endWait();
    expect((await u.client.rpc("verify_pin", { pin: "4321" })).data).toMatchObject({ ok: true });
    expect((await u.client.rpc("verify_pin", { pin: "9999" })).data).toMatchObject({
      attempts_left: 7,
    });
  });

  it("clears the PIN on the 8th wrong try, so the next login must set a new one", async () => {
    await clearPin();
    await u.client.rpc("set_pin", { new_pin: "4321" });
    let last: unknown;
    for (let i = 0; i < 8; i++) {
      last = (await u.client.rpc("verify_pin", { pin: "9999" })).data;
      await endWait();
    }
    expect(last).toMatchObject({ ok: false, attempts_left: 0, reset: true });
    expect((await u.client.rpc("has_pin")).data).toBe(false);
  });

  it("users cannot see each other's PIN state", { timeout: 20_000 }, async () => {
    const other = await signIn("+8801700000001");
    await clearPin(other.id);
    expect((await u.client.rpc("set_pin", { new_pin: "2468" })).error).toBeNull();
    expect((await other.client.rpc("has_pin")).data).toBe(false);
    await clearPin();
  });
});
