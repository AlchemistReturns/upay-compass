import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

type Snapshot = { score: number; confidence: string; changed: boolean };

/** Credit readiness: only the function writes snapshots. Needs a running stack with functions served. */
describe.skipIf(!url || !anon)("phase 7: readiness scores", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await signIn("+8801700000004");
    b = await signIn("+8801700000002");
  });

  it("clients cannot write or edit readiness snapshots", async () => {
    const ins = await a.client
      .from("readiness_scores")
      .insert({ user_id: a.id, score: 100, breakdown: {} });
    expect(ins.error).not.toBeNull();
    const upd = await a.client.from("readiness_scores").update({ score: 100 }).eq("user_id", a.id);
    expect(upd.error).not.toBeNull();
  });

  it("savings_activity lists the last six months, newest first, and the first day", async () => {
    const r = await a.client.rpc("savings_activity");
    expect(r.error).toBeNull();
    const data = r.data as {
      first_day: string | null;
      months: { month: string; active: boolean }[];
    };
    expect(data.months).toHaveLength(6);
    const names = data.months.map((m) => m.month);
    expect([...names].sort().reverse()).toEqual(names);
  });

  it("the function scores a loaded demo account, stores one snapshot, and a repeat changes nothing", async () => {
    const reset = await a.client.functions.invoke("reset-demo", { body: { persona: "gig" } });
    expect(reset.error).toBeNull();

    const first = await a.client.functions.invoke("compute-readiness-score", { body: {} });
    expect(first.error).toBeNull();
    const s1 = first.data as Snapshot;
    expect(s1.score).toBeGreaterThanOrEqual(0);
    expect(s1.score).toBeLessThanOrEqual(100);

    const again = (await a.client.functions.invoke("compute-readiness-score", { body: {} }))
      .data as Snapshot;
    expect(again.score).toBe(s1.score);
    expect(again.changed).toBe(false);

    const rows = await a.client
      .from("readiness_scores")
      .select("score,breakdown")
      .order("computed_at", { ascending: false });
    expect(rows.data!.length).toBeGreaterThanOrEqual(1);
    const breakdown = rows.data![0]!.breakdown as { components: Record<string, { score: number }> };
    expect(Object.keys(breakdown.components).sort()).toEqual([
      "budget",
      "income",
      "punctuality",
      "savings",
    ]);
  }, 120_000);

  it("one user's readiness history is invisible to another", async () => {
    const seen = await b.client.from("readiness_scores").select("id").eq("user_id", a.id);
    expect(seen.data).toEqual([]);
  });

  it("the function refuses a request with no token", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const visitor = createClient(url!, anon!, { auth: { persistSession: false } });
    const r = await visitor.functions.invoke("compute-readiness-score", { body: {} });
    expect(r.error).not.toBeNull();
  });
});
