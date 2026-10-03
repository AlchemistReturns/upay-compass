import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/** Budgets, nudges, goal contributions, round-ups and score storage. Needs a running stack. */
describe.skipIf(!url || !anon)("phase 3: budgets, goals, round-ups, nudges", () => {
  let a: TestUser;
  let b: TestUser;
  let foodId: number;
  let transportId: number;
  let shoppingId: number;

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const spend = (over: Record<string, unknown> = {}) => ({
    user_id: a.id,
    amount: 100,
    direction: "out",
    channel: "merchant",
    counterparty: "Test",
    category_id: foodId,
    occurred_at: new Date().toISOString(),
    ...over,
  });
  const nudgesFor = async (budgetId: string) => {
    const { data } = await a.client.from("nudges").select("type,data");
    return (data ?? []).filter((n) => n.data?.budget_id === budgetId);
  };
  const savedOf = async (goalId: string) =>
    Number(
      (await a.client.from("goals").select("saved_amount").eq("id", goalId).single()).data!
        .saved_amount,
    );
  const contributionsOf = async (goalId: string) =>
    (
      await a.client
        .from("goal_contributions")
        .select("id,amount,source,transaction_id")
        .eq("goal_id", goalId)
    ).data ?? [];

  async function cleanup() {
    await a.client.rpc("set_roundup", { p_enabled: false, p_goal_id: null });
    await a.client.from("transactions").delete().eq("user_id", a.id);
    await a.client.from("budgets").delete().eq("user_id", a.id);
    await a.client.from("goals").delete().eq("user_id", a.id);
    await b.client.from("goals").delete().eq("user_id", b.id);
  }

  beforeAll(async () => {
    a = await signIn("+8801700000002");
    b = await signIn("+8801700000003");
    const cats = await a.client.from("categories").select("id,key");
    const id = (k: string) => cats.data!.find((c) => c.key === k)!.id as number;
    foodId = id("food");
    transportId = id("transport");
    shoppingId = id("shopping");
    await cleanup();
  });

  afterAll(cleanup);

  describe("budgets and alerts", () => {
    let budgetId: string;

    it("creates a budget, rejects duplicates and bad values, and hides it from other users", async () => {
      const ins = await a.client
        .from("budgets")
        .insert({ user_id: a.id, category_id: foodId, limit_amount: 1000, alert_threshold: 0.8 })
        .select("id")
        .single();
      expect(ins.error).toBeNull();
      budgetId = ins.data!.id;

      const dup = await a.client
        .from("budgets")
        .insert({ user_id: a.id, category_id: foodId, limit_amount: 500 });
      expect(dup.error).not.toBeNull();
      const bad = await a.client
        .from("budgets")
        .insert({ user_id: a.id, category_id: transportId, limit_amount: 0 });
      expect(bad.error).not.toBeNull();
      const badThreshold = await a.client.from("budgets").insert({
        user_id: a.id,
        category_id: transportId,
        limit_amount: 100,
        alert_threshold: 1.5,
      });
      expect(badThreshold.error).not.toBeNull();

      expect((await b.client.from("budgets").select("id")).data).toEqual([]);
    });

    it("budget_progress sums this month's spending in the category", async () => {
      expect((await a.client.from("transactions").insert(spend({ amount: 700 }))).error).toBeNull();
      const p = await a.client.rpc("budget_progress");
      expect(p.data).toEqual([
        {
          budget_id: budgetId,
          category_id: foodId,
          limit_amount: 1000,
          alert_threshold: 0.8,
          spent: 700,
        },
      ]);
      expect(await nudgesFor(budgetId)).toHaveLength(0);
    });

    it("fires a threshold nudge once, then an exceeded nudge once", async () => {
      await a.client.from("transactions").insert(spend({ amount: 150 })); // 850 >= 80%
      expect((await nudgesFor(budgetId)).map((n) => n.type)).toEqual(["budget_threshold"]);

      await a.client.from("transactions").insert(spend({ amount: 10 })); // still over threshold
      expect(await nudgesFor(budgetId)).toHaveLength(1);

      await a.client.from("transactions").insert(spend({ amount: 200 })); // 1060 >= limit
      const types = (await nudgesFor(budgetId)).map((n) => n.type).sort();
      expect(types).toEqual(["budget_exceeded", "budget_threshold"]);

      await a.client.from("transactions").insert(spend({ amount: 50 }));
      expect(await nudgesFor(budgetId)).toHaveLength(2);
    });

    it("does not alert for spending from earlier months", async () => {
      const t = await a.client
        .from("budgets")
        .insert({ user_id: a.id, category_id: transportId, limit_amount: 100 })
        .select("id")
        .single();
      await a.client
        .from("transactions")
        .insert(spend({ amount: 500, category_id: transportId, occurred_at: daysAgo(40) }));
      expect(await nudgesFor(t.data!.id)).toHaveLength(0);
      const p = await a.client.rpc("budget_progress");
      expect(p.data!.find((r: { budget_id: string }) => r.budget_id === t.data!.id).spent).toBe(0);
    });

    it("setting a budget below what is already spent alerts straight away", async () => {
      await a.client.from("transactions").insert(spend({ amount: 300, category_id: shoppingId }));
      const s = await a.client
        .from("budgets")
        .insert({ user_id: a.id, category_id: shoppingId, limit_amount: 200 })
        .select("id")
        .single();
      expect((await nudgesFor(s.data!.id)).map((n) => n.type)).toEqual(["budget_exceeded"]);
    });

    it("nudges are read-only except for the read flag, and private", async () => {
      const mine = await a.client.from("nudges").select("id,type");
      expect(mine.data!.length).toBeGreaterThan(0);
      const nudgeId = mine.data![0]!.id;

      const forged = await a.client
        .from("nudges")
        .insert({ user_id: a.id, type: "x", dedupe_key: "forged" });
      expect(forged.error).not.toBeNull();
      expect(
        (await a.client.from("nudges").update({ type: "hacked" }).eq("id", nudgeId)).error,
      ).not.toBeNull();

      const read = await a.client.from("nudges").update({ read: true }).eq("id", nudgeId).select();
      expect(read.error).toBeNull();
      expect(read.data).toHaveLength(1);

      expect((await b.client.from("nudges").select("id")).data).toEqual([]);
      const other = await b.client.from("nudges").update({ read: true }).eq("id", nudgeId).select();
      expect(other.data).toEqual([]);
    });
  });

  describe("goal contributions", () => {
    let goalId: string;
    let bGoalId: string;

    it("contributes, undoes, and completes a goal; clients cannot forge any of it", async () => {
      // goals are funded from the wallet, so there must be money in it
      await a.client.from("transactions").insert({
        user_id: a.id,
        amount: 5000,
        direction: "in",
        channel: "add_money",
        counterparty: "Funding",
        occurred_at: new Date().toISOString(),
      });
      const g = await a.client
        .from("goals")
        .insert({ user_id: a.id, title: "Phone", target_amount: 1000 })
        .select("id")
        .single();
      goalId = g.data!.id;
      const bg = await b.client
        .from("goals")
        .insert({ user_id: b.id, title: "Bike", target_amount: 500 })
        .select("id")
        .single();
      bGoalId = bg.data!.id;

      const c = await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: 400 });
      expect(c.error).toBeNull();
      expect(await savedOf(goalId)).toBe(400);

      expect(
        (await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: 0 })).error,
      ).not.toBeNull();
      expect(
        (await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: -5 })).error,
      ).not.toBeNull();
      expect(
        (await a.client.rpc("contribute_to_goal", { p_goal_id: bGoalId, p_amount: 10 })).error,
      ).not.toBeNull();

      const direct = await a.client
        .from("goal_contributions")
        .insert({ goal_id: goalId, user_id: a.id, amount: 999, source: "manual" });
      expect(direct.error).not.toBeNull();
      expect(
        (await a.client.from("goals").update({ saved_amount: 999 }).eq("id", goalId)).error,
      ).not.toBeNull();

      const undo = await a.client.rpc("undo_goal_contribution", { p_contribution_id: c.data });
      expect(undo.error).toBeNull();
      expect(await savedOf(goalId)).toBe(0);
      expect(
        (await b.client.rpc("undo_goal_contribution", { p_contribution_id: c.data })).error,
      ).not.toBeNull();

      const full = await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: 1000 });
      const status = await a.client.from("goals").select("status").eq("id", goalId).single();
      expect(status.data!.status).toBe("completed");
      await a.client.rpc("undo_goal_contribution", { p_contribution_id: full.data });
      const back = await a.client.from("goals").select("status").eq("id", goalId).single();
      expect(back.data!.status).toBe("active");
    });

    it("contributions are private", async () => {
      await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: 50 });
      expect((await b.client.from("goal_contributions").select("id")).data).toEqual([]);
      for (const c of await contributionsOf(goalId)) {
        await a.client.rpc("undo_goal_contribution", { p_contribution_id: c.id });
      }
      expect(await savedOf(goalId)).toBe(0);
    });

    describe("round-ups", () => {
      it("cannot target someone else's goal", async () => {
        const r = await a.client.rpc("set_roundup", { p_enabled: true, p_goal_id: bGoalId });
        expect(r.error).not.toBeNull();
        const profile = await a.client
          .from("profiles")
          .select("roundup_enabled")
          .eq("id", a.id)
          .single();
        expect(profile.data!.roundup_enabled).toBe(false);
        const direct = await a.client
          .from("profiles")
          .update({ roundup_goal_id: bGoalId, roundup_enabled: true })
          .eq("id", a.id);
        expect(direct.error).not.toBeNull();
      });

      it("rounds each outgoing transaction up to the next 10 and reconciles with the goal", async () => {
        expect(
          (await a.client.rpc("set_roundup", { p_enabled: true, p_goal_id: goalId })).error,
        ).toBeNull();

        const amounts = [123, 130, 99.5, 7, 1];
        for (const amount of amounts) {
          await a.client.from("transactions").insert(spend({ amount, category_id: null }));
        }
        await a.client
          .from("transactions")
          .insert(spend({ amount: 555, direction: "in", category_id: null }));

        const contribs = await contributionsOf(goalId);
        const expected = amounts
          .map((n) => Math.ceil(n / 10) * 10 - n)
          .filter((r) => r > 0)
          .sort((x, y) => x - y);
        expect(contribs.every((c) => c.source === "roundup" && c.transaction_id)).toBe(true);
        expect(contribs.map((c) => Number(c.amount)).sort((x, y) => x - y)).toEqual(expected);
        const sum = contribs.reduce((n, c) => n + Number(c.amount), 0);
        expect(await savedOf(goalId)).toBe(sum);
        expect(sum).toBe(7 + 0.5 + 3 + 9);
      });

      it("deleting a transaction takes its round-up back; undo works; turning off stops it", async () => {
        const tx = await a.client
          .from("transactions")
          .insert(spend({ amount: 41, category_id: null }))
          .select("id")
          .single();
        const before = await savedOf(goalId);
        expect(before).toBeGreaterThan(0);
        await a.client.from("transactions").delete().eq("id", tx.data!.id);
        expect(await savedOf(goalId)).toBe(before - 9);

        const first = (await contributionsOf(goalId))[0]!;
        expect(
          (await a.client.rpc("undo_goal_contribution", { p_contribution_id: first.id })).error,
        ).toBeNull();
        expect(await savedOf(goalId)).toBe(before - 9 - Number(first.amount));

        await a.client.rpc("set_roundup", { p_enabled: false, p_goal_id: null });
        const count = (await contributionsOf(goalId)).length;
        await a.client.from("transactions").insert(spend({ amount: 12, category_id: null }));
        expect((await contributionsOf(goalId)).length).toBe(count);
      });
    });
  });

  describe("health scores and inputs", () => {
    it("clients cannot write score snapshots", async () => {
      const r = await a.client
        .from("health_scores")
        .insert({ user_id: a.id, score: 100, breakdown: {} });
      expect(r.error).not.toBeNull();
      expect((await a.client.from("health_scores").select("id")).error).toBeNull();
    });

    it("health_inputs reports the caller's own aggregates", async () => {
      await a.client.from("transactions").delete().eq("user_id", a.id);
      await a.client
        .from("transactions")
        .insert([
          spend({ amount: 1000, direction: "in", category_id: null, occurred_at: daysAgo(2) }),
          spend({ amount: 300, category_id: foodId, occurred_at: daysAgo(1) }),
        ]);
      const inputs = await a.client.rpc("health_inputs");
      expect(inputs.error).toBeNull();
      expect(inputs.data).toMatchObject({
        tx_count: 2,
        income: 1000,
        spend: 300,
        essential_spend: 300,
      });
      // Another user gets their own aggregates, never mine.
      const bRows = await b.client
        .from("transactions")
        .select("id", { count: "exact", head: true });
      const theirs = await b.client.rpc("health_inputs");
      expect(theirs.data.tx_count).toBe(bRows.count ?? 0);
      expect(theirs.data.tx_count).not.toBe(2);
    });
  });
});
