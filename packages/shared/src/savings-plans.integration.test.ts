import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * Savings plans (a DPS plan started from a goal), with real local test users:
 * own rows only, no edits except the Undo, and the export includes them. Account deletion is
 * covered in privacy.integration.test.ts (savings_plans is in its USER_TABLES list and seeded there).
 * The export case needs the functions served and the service key:
 *   RLS_TEST_URL=http://127.0.0.1:54321 RLS_TEST_ANON_KEY=<anon> RLS_TEST_SERVICE_KEY=<service_role> \
 *     pnpm --filter @compass/shared test
 */
const service = process.env.RLS_TEST_SERVICE_KEY;

const plan = (user: TestUser, goalId: string, reference: string) => ({
  user_id: user.id,
  goal_id: goalId,
  monthly_amount: 2000,
  tenure_months: 12,
  illustrative_rate: 0.07,
  projected_maturity: 24_929.75,
  reference,
});

describe.skipIf(!url || !anon)("savings_plans", () => {
  let a: TestUser;
  let b: TestUser;
  let goalA: string;
  let goalB: string;
  const tag = Date.now().toString(36).toUpperCase();

  beforeAll(async () => {
    a = await signIn("+8801700000001");
    b = await signIn("+8801700000002");
    const ga = await a.client
      .from("goals")
      .insert({ user_id: a.id, title: "dps-a", target_amount: 30_000 })
      .select("id")
      .single();
    const gb = await b.client
      .from("goals")
      .insert({ user_id: b.id, title: "dps-b", target_amount: 30_000 })
      .select("id")
      .single();
    goalA = ga.data!.id;
    goalB = gb.data!.id;
  });

  // deleting the goals takes their plans with them (on delete cascade)
  afterAll(async () => {
    await a.client.from("goals").delete().eq("id", goalA);
    await b.client.from("goals").delete().eq("id", goalB);
  });

  it("lets a person create and read their own plan", async () => {
    const made = await a.client
      .from("savings_plans")
      .insert(plan(a, goalA, `DPS-A${tag}`))
      .select("id,status,monthly_amount,reference")
      .single();
    expect(made.error).toBeNull();
    expect(made.data).toMatchObject({ status: "requested", reference: `DPS-A${tag}` });

    const mine = await a.client.from("savings_plans").select("id").eq("goal_id", goalA);
    expect(mine.data?.map((r) => r.id)).toContain(made.data!.id);
  });

  it("hides one person's plans from another", async () => {
    await b.client.from("savings_plans").insert(plan(b, goalB, `DPS-B${tag}`));
    const seenByB = await b.client.from("savings_plans").select("user_id,reference");
    expect(seenByB.error).toBeNull();
    expect(seenByB.data!.length).toBeGreaterThan(0);
    for (const row of seenByB.data!) expect(row.user_id).toBe(b.id);
    expect(seenByB.data!.map((r) => r.reference)).not.toContain(`DPS-A${tag}`);

    const direct = await b.client.from("savings_plans").select("id").eq("goal_id", goalA);
    expect(direct.data).toEqual([]);
  });

  it("refuses a plan for someone else's goal or in someone else's name", async () => {
    const onTheirGoal = await b.client.from("savings_plans").insert(plan(b, goalA, `DPS-X${tag}`));
    expect(onTheirGoal.error).not.toBeNull();
    const asThem = await b.client.from("savings_plans").insert(plan(a, goalB, `DPS-Y${tag}`));
    expect(asThem.error).not.toBeNull();
  });

  it("refuses bad values", async () => {
    const bad = (over: object) =>
      a.client
        .from("savings_plans")
        .insert({ ...plan(a, goalA, `DPS-Z${tag}`), ...over })
        .then((r) => r.error);
    expect(await bad({ monthly_amount: 0 })).not.toBeNull();
    expect(await bad({ tenure_months: 0 })).not.toBeNull();
    expect(await bad({ status: "cancelled" })).not.toBeNull();
  });

  it("does not allow edits or deletes from the browser, only the Undo on your own plan", async () => {
    const row = await a.client
      .from("savings_plans")
      .insert(plan(a, goalA, `DPS-U${tag}`))
      .select("id")
      .single();
    const id = row.data!.id;

    // no update/delete privilege: the call errors or changes nothing
    await a.client.from("savings_plans").update({ monthly_amount: 1 }).eq("id", id);
    await a.client.from("savings_plans").delete().eq("id", id);
    const still = await a.client.from("savings_plans").select("monthly_amount,status").eq("id", id);
    expect(still.data).toEqual([{ monthly_amount: 2000, status: "requested" }]);

    expect((await b.client.rpc("cancel_savings_plan", { p_plan_id: id })).error).not.toBeNull();
    expect((await a.client.rpc("cancel_savings_plan", { p_plan_id: id })).error).toBeNull();
    const cancelled = await a.client.from("savings_plans").select("status").eq("id", id);
    expect(cancelled.data).toEqual([{ status: "cancelled" }]);
    // already cancelled: a second Undo is an error, not a silent success
    expect((await a.client.rpc("cancel_savings_plan", { p_plan_id: id })).error).not.toBeNull();
  });

  describe.skipIf(!service)("export", () => {
    const admin = () => createClient(url!, service!, { auth: { persistSession: false } });

    async function call(fn: string, user: TestUser) {
      const token = (await user.client.auth.getSession()).data.session!.access_token;
      return fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    it("includes the plans in the export, and only the caller's", async () => {
      await admin().from("audit_log").delete().eq("user_id", a.id).eq("entity", "limit");
      const res = await call("export-my-data", a);
      expect(res.status).toBe(200);
      const doc = await res.json();
      const refs = (doc.savings_plans as { reference: string; user_id: string }[]).map(
        (p) => p.reference,
      );
      expect(refs).toContain(`DPS-A${tag}`);
      expect(refs).not.toContain(`DPS-B${tag}`);
      for (const p of doc.savings_plans as { user_id: string }[]) expect(p.user_id).toBe(a.id);
      expect(doc.export.row_counts.savings_plans).toBe(refs.length);
    });
  });
});
