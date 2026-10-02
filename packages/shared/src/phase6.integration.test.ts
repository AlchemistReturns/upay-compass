import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * Admin insights and demo reset. Needs a running Supabase stack with the functions served.
 * Admin tests need +8801700000003 to have role 'admin' (set it once in the database, see the dev guide).
 */
describe.skipIf(!url || !anon)("phase 6: admin insights, demo reset", () => {
  let user: TestUser;
  let admin: TestUser;
  let isAdmin = false;
  let resetUser: TestUser;

  beforeAll(async () => {
    user = await signIn("+8801700000002");
    admin = await signIn("+8801700000003");
    resetUser = await signIn("+8801700000004");
    const me = await admin.client.from("profiles").select("role").eq("id", admin.id).single();
    isAdmin = me.data?.role === "admin";
  });

  it("a regular user cannot read admin insights or seed the cohort", async () => {
    const r = await user.client.rpc("admin_insights");
    expect(r.error).not.toBeNull();
    const seed = await user.client.functions.invoke("seed-demo", { body: {} });
    expect(seed.error).not.toBeNull();
  });

  it("nobody can make themselves admin", async () => {
    const r = await user.client.from("profiles").update({ role: "admin" }).eq("id", user.id);
    expect(r.error).not.toBeNull();
  });

  it("nobody can edit their own wallet balance from the browser", async () => {
    const r = await user.client
      .from("profiles")
      .update({ opening_balance: 999999 })
      .eq("id", user.id);
    expect(r.error).not.toBeNull();
  });

  it("anonymous visitors cannot read private tables", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const visitor = createClient(url!, anon!, { auth: { persistSession: false } });
    for (const table of ["profiles", "transactions", "goals", "gamification"]) {
      const r = await visitor.from(table).select("*").limit(1);
      expect(r.error, table).not.toBeNull();
    }
    const cats = await visitor.from("categories").select("id").limit(1);
    expect(cats.error).toBeNull();
  });

  it("reset_demo wipes the caller's own data and nobody else's", async () => {
    const other = await user.client.from("goals").select("id");
    const before = other.data?.length ?? 0;
    const g = await resetUser.client
      .from("goals")
      .insert({ user_id: resetUser.id, title: "to be wiped", target_amount: 100 });
    expect(g.error).toBeNull();
    const reset = await resetUser.client.rpc("reset_demo");
    expect(reset.error).toBeNull();
    const mine = await resetUser.client.from("goals").select("id");
    expect(mine.data).toEqual([]);
    const after = await user.client.from("goals").select("id");
    expect(after.data?.length ?? 0).toBe(before);
  });

  it.skipIf(!process.env.RLS_TEST_SEED)(
    "seeding the cohort makes the insights real, and they hold no per-person data",
    async () => {
      if (!isAdmin) return;
      const seed = await admin.client.functions.invoke("seed-demo", { body: {} });
      expect(seed.error).toBeNull();
      expect((seed.data as { people: number }).people).toBe(15);

      const r = await admin.client.rpc("admin_insights");
      expect(r.error).toBeNull();
      const sections = ["spending", "health", "goals", "roundups", "learning"] as const;
      type Insights = Record<(typeof sections)[number], Record<string, unknown>>;
      const out = r.data as Insights;
      expect(out.spending.suppressed).toBeUndefined();
      expect((out.spending.top_categories as unknown[]).length).toBeGreaterThan(0);
      expect(out.health.avg_score).toBeGreaterThan(0);
      expect((out.health.by_income_type as unknown[]).length).toBe(3);
      expect(out.goals.completion_rate).toBeGreaterThan(0);
      expect(out.roundups.total).toBeGreaterThan(0);
      expect(out.learning.graduates).toBeGreaterThanOrEqual(3);
      const text = JSON.stringify(out);
      expect(text).not.toMatch(/\+?8801\d{9}/); // no phone numbers
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no user ids
    },
    300_000,
  );

  it("an admin sees small groups suppressed rather than shown", async () => {
    if (!isAdmin) return;
    const r = await admin.client.rpc("admin_insights");
    expect(r.error).toBeNull();
    const out = r.data as { min_group_size: number };
    expect(out.min_group_size).toBe(5);
  });
});
