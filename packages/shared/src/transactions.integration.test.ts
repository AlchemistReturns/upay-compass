import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/** Phase 2 tables and RPCs, with two real users. Skipped unless RLS_TEST_URL/RLS_TEST_ANON_KEY are set. */
describe.skipIf(!url || !anon)("transactions, rules and dashboard RPCs", () => {
  let a: TestUser;
  let b: TestUser;
  let foodId: number;
  let transportId: number;
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();

  async function cleanup() {
    await a.client.from("transactions").delete().eq("user_id", a.id);
    await a.client.from("category_rules").delete().eq("user_id", a.id);
  }

  beforeAll(async () => {
    a = await signIn("+8801700000001");
    b = await signIn("+8801700000002");
    const cats = await a.client.from("categories").select("id,key");
    foodId = cats.data!.find((c) => c.key === "food")!.id;
    transportId = cats.data!.find((c) => c.key === "transport")!.id;
    await cleanup();
    await a.client.from("profiles").update({ opening_balance: 500 }).eq("id", a.id);
  });

  afterAll(async () => {
    await cleanup();
    await a.client.from("profiles").update({ opening_balance: 0 }).eq("id", a.id);
  });

  it("inserts own transactions and hides them from other users", async () => {
    const rows = [
      {
        amount: 1000,
        direction: "in",
        channel: "add_money",
        counterparty: "Salary",
        occurred_at: day(1),
      },
      {
        amount: 200,
        direction: "out",
        channel: "merchant",
        counterparty: "Pathao",
        occurred_at: day(2),
      },
      {
        amount: 300,
        direction: "out",
        channel: "merchant",
        counterparty: "Pathao",
        occurred_at: day(3),
      },
    ].map((r) => ({ ...r, user_id: a.id, category_id: foodId }));
    const ins = await a.client.from("transactions").insert(rows);
    expect(ins.error).toBeNull();

    const seenByB = await b.client.from("transactions").select("id");
    expect(seenByB.data).toEqual([]);
  });

  it("cannot insert a transaction for another user", async () => {
    const r = await b.client.from("transactions").insert({
      user_id: a.id,
      amount: 1,
      direction: "out",
      channel: "merchant",
      occurred_at: day(0),
    });
    expect(r.error).not.toBeNull();
  });

  it("rejects invalid rows", async () => {
    const r = await a.client.from("transactions").insert({
      user_id: a.id,
      amount: -5,
      direction: "out",
      channel: "merchant",
      occurred_at: day(0),
    });
    expect(r.error).not.toBeNull();
  });

  it("external_id makes ingestion idempotent", async () => {
    const row = {
      user_id: a.id,
      external_id: "sim-1",
      amount: 10,
      direction: "out",
      channel: "merchant",
      occurred_at: day(0),
    };
    expect((await a.client.from("transactions").insert(row)).error).toBeNull();
    expect((await a.client.from("transactions").insert(row)).error).not.toBeNull();
    const up = await a.client
      .from("transactions")
      .upsert(row, { onConflict: "user_id,external_id", ignoreDuplicates: true });
    expect(up.error).toBeNull();
    await a.client.from("transactions").delete().eq("external_id", "sim-1");
  });

  it("dashboard_summary, spend_by_category, wallet_balance and weekly_trend add up", async () => {
    const from = day(30);
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const sum = await a.client.rpc("dashboard_summary", { p_from: from, p_to: to });
    expect(sum.data?.[0]).toMatchObject({ income: 1000, expense: 500, tx_count: 3 });

    const cats = await a.client.rpc("spend_by_category", { p_from: from, p_to: to });
    expect(cats.data).toEqual([{ category_id: foodId, total: 500, tx_count: 2 }]);

    expect((await a.client.rpc("wallet_balance")).data).toBe(500 + 1000 - 500);

    const trend = await a.client.rpc("weekly_trend", { p_weeks: 8 });
    expect(trend.data).toHaveLength(8);
    const totalIn = trend.data!.reduce(
      (n: number, w: { income: number }) => n + Number(w.income),
      0,
    );
    expect(totalIn).toBe(1000);
  });

  it("another user sees zeros, not my numbers", async () => {
    const sum = await b.client.rpc("dashboard_summary", { p_from: day(30), p_to: day(-1) });
    expect(sum.data?.[0]).toMatchObject({ income: 0, expense: 0, tx_count: 0 });
  });

  it("set_transaction_category saves the rule and applies it to matching transactions", async () => {
    const list = await a.client.from("transactions").select("id").eq("counterparty", "Pathao");
    const res = await a.client.rpc("set_transaction_category", {
      p_transaction_id: list.data![0]!.id,
      p_category_id: transportId,
    });
    expect(res.error).toBeNull();

    const after = await a.client
      .from("transactions")
      .select("category_id,category_source")
      .eq("counterparty", "Pathao");
    expect(
      after.data!.every((t) => t.category_id === transportId && t.category_source === "user"),
    ).toBe(true);

    const rule = await a.client.from("category_rules").select("keyword,category_id");
    expect(rule.data).toEqual([{ keyword: "pathao", category_id: transportId }]);
  });

  it("cannot recategorize someone else's transaction", async () => {
    const mine = await a.client.from("transactions").select("id").limit(1);
    const res = await b.client.rpc("set_transaction_category", {
      p_transaction_id: mine.data![0]!.id,
      p_category_id: foodId,
    });
    expect(res.error).not.toBeNull();
  });

  it("audit_log is append-only for users", async () => {
    const ins = await a.client
      .from("audit_log")
      .insert({ user_id: a.id, action: "test", entity: "transaction", detail: { ok: true } });
    expect(ins.error).toBeNull();
    const upd = await a.client.from("audit_log").update({ action: "x" }).eq("user_id", a.id);
    expect(upd.error).not.toBeNull();
    const del = await a.client.from("audit_log").delete().eq("user_id", a.id);
    expect(del.error).not.toBeNull();
    const forged = await b.client.from("audit_log").insert({ user_id: a.id, action: "forged" });
    expect(forged.error).not.toBeNull();
    expect((await b.client.from("audit_log").select("id")).data).toEqual([]);
  });
});
