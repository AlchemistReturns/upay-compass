import { beforeAll, describe, expect, it } from "vitest";
import { computeHealthScore, parseHealthInputs } from "./health";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/** The emergency buffer is measured per calendar month from what the person logged. */
describe.skipIf(!url || !anon)("buffer on a monthly basis (database)", () => {
  let a: TestUser;
  let foodId: number;
  let billsId: number;

  beforeAll(async () => {
    a = await signIn("+8801700000003");
    const cats = await a.client.from("categories").select("id,key");
    foodId = cats.data!.find((c) => c.key === "food")!.id;
    billsId = cats.data!.find((c) => c.key === "bills")!.id;
    await a.client.from("transactions").delete().eq("user_id", a.id);
    await a.client.from("profiles").update({ opening_balance: 0 }).eq("id", a.id);
  });

  const add = (amount: number, direction: "in" | "out", categoryId: number | null, when: string) =>
    a.client.from("transactions").insert({
      user_id: a.id,
      amount,
      direction,
      channel: direction === "in" ? "add_money" : "merchant",
      counterparty: "Buffer test",
      category_id: categoryId,
      occurred_at: when,
    });

  it("a day of history is not scaled up to a month", async () => {
    const now = Date.now();
    await add(25000, "in", null, new Date(now - 2 * 3_600_000).toISOString());
    await add(4000, "out", foodId, new Date(now - 3_600_000).toISOString());
    const { data } = await a.client.rpc("health_inputs");
    const inputs = parseHealthInputs(data);
    expect(inputs.essentialThisMonth).toBeGreaterThanOrEqual(4000);
    const r = computeHealthScore(inputs);
    expect(r.components.buffer.basis).toBe("month_so_far");
    // 21,000 in the wallet over 4,000 of essentials so far, not over 120,000
    expect(r.components.buffer.raw).toBeCloseTo(5.25, 2);
    expect(r.components.buffer.score).toBe(100);
  });

  it("complete months are reported per calendar month, newest first", async () => {
    // rent paid once in each of the last two complete months, with a first payment before them
    const month = (back: number) => {
      const d = new Date();
      d.setUTCDate(10);
      d.setUTCMonth(d.getUTCMonth() - back);
      return d.toISOString();
    };
    await add(100, "out", foodId, month(3));
    await add(12000, "out", billsId, month(2));
    await add(12000, "out", billsId, month(1));
    const { data } = await a.client.rpc("health_inputs");
    const inputs = parseHealthInputs(data);
    expect(inputs.essentialMonths.slice(0, 2)).toEqual([12000, 12000]);
    const r = computeHealthScore(inputs);
    expect(r.components.buffer.basis).toBe("months");
  });
});
