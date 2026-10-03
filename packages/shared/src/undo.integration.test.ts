import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/** Undo support: a deleted payment goes back exactly as it was, and a budget save returns its id. */
describe.skipIf(!url || !anon)("undo", () => {
  let a: TestUser;
  beforeAll(async () => {
    a = await signIn("+8801700000004");
  });

  it("restores a deleted payment with the same id, time and category", async () => {
    const made = await a.client
      .from("transactions")
      .insert({
        user_id: a.id,
        amount: 77,
        direction: "out",
        channel: "merchant",
        counterparty: "Undo test",
        note: "n",
        category_id: 1,
        category_source: "rule",
        needs_review: false,
        is_simulated: false,
        occurred_at: "2026-10-01T05:00:00.000Z",
      })
      .select("*")
      .single();
    expect(made.error).toBeNull();
    const row = made.data!;
    const gone = await a.client.from("transactions").delete().eq("id", row.id);
    expect(gone.error).toBeNull();
    const back = await a.client.from("transactions").insert(row).select("*").single();
    expect(back.error).toBeNull();
    expect(back.data).toMatchObject({
      id: row.id,
      amount: row.amount,
      category_id: 1,
      occurred_at: row.occurred_at,
    });
    await a.client.from("transactions").delete().eq("id", row.id);
  });

  it("a budget upsert returns the id so a new budget can be undone", async () => {
    const r = await a.client
      .from("budgets")
      .upsert(
        { user_id: a.id, category_id: 2, limit_amount: 1234, alert_threshold: 0.8 },
        { onConflict: "user_id,category_id" },
      )
      .select("id")
      .single();
    expect(r.error).toBeNull();
    expect(r.data!.id).toBeTruthy();
    await a.client.from("budgets").delete().eq("id", r.data!.id);
  });
});
