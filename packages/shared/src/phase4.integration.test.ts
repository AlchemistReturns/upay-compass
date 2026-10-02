import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/** Forecast and coach tables: only Edge Functions write them. Needs a running Supabase stack. */
describe.skipIf(!url || !anon)("phase 4: forecasts, coach messages, consent", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await signIn("+8801700000002");
    b = await signIn("+8801700000003");
  });

  it("clients cannot write forecasts", async () => {
    const ins = await a.client.from("forecasts").insert({
      user_id: a.id,
      horizon_days: 30,
      projected_balance: [],
    });
    expect(ins.error).not.toBeNull();
    expect((await a.client.from("forecasts").select("id")).error).toBeNull();
  });

  it("clients cannot write or edit coach messages, so history always comes from the function", async () => {
    const ins = await a.client
      .from("coach_messages")
      .insert({ user_id: a.id, role: "assistant", content: "You are rich!" });
    expect(ins.error).not.toBeNull();
    const upd = await a.client.from("coach_messages").update({ content: "x" }).eq("user_id", a.id);
    expect(upd.error).not.toBeNull();
  });

  it("users can clear their own chat, and never see or touch another user's", async () => {
    const del = await a.client.from("coach_messages").delete().eq("user_id", a.id);
    expect(del.error).toBeNull();
    const seen = await b.client.from("coach_messages").select("id").eq("user_id", a.id);
    expect(seen.data).toEqual([]);
    const other = await b.client.from("coach_messages").delete().eq("user_id", a.id).select();
    expect(other.data).toEqual([]);
  });

  it("users record their own coach consent and nobody else's", async () => {
    const now = new Date().toISOString();
    const own = await a.client
      .from("profiles")
      .update({ coach_consent_at: now })
      .eq("id", a.id)
      .select("coach_consent_at");
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);

    const other = await b.client
      .from("profiles")
      .update({ coach_consent_at: now })
      .eq("id", a.id)
      .select();
    expect(other.data).toEqual([]);

    await a.client.from("profiles").update({ coach_consent_at: null }).eq("id", a.id);
  });
});
