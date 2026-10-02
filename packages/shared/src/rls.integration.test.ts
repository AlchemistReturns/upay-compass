import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * RLS check with two real users. Needs a running Supabase stack, so it only runs when
 * RLS_TEST_URL and RLS_TEST_ANON_KEY are set:
 *   RLS_TEST_URL=http://127.0.0.1:54321 RLS_TEST_ANON_KEY=<pnpm sb status> pnpm --filter @compass/shared test
 */
const url = process.env.RLS_TEST_URL;
const anon = process.env.RLS_TEST_ANON_KEY;

async function signIn(phone: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  const sent = await client.auth.signInWithOtp({ phone });
  if (sent.error) throw sent.error;
  const { data, error } = await client.auth.verifyOtp({ phone, token: "123456", type: "sms" });
  if (error || !data.user) throw error ?? new Error("no user");
  return { client, id: data.user.id };
}

describe.skipIf(!url || !anon)("RLS with two users", () => {
  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };

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
