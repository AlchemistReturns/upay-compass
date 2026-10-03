import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

type Created = { candidates: number; created: number };

/** Unusual-payment alerts end to end. Needs a running stack with the functions served. */
describe.skipIf(!url || !anon)("phase 8: unusual payment nudges", () => {
  let a: TestUser;
  let foodId: number;
  let txId: string;

  beforeAll(async () => {
    a = await signIn("+8801700000004");
    const cats = await a.client.from("categories").select("id,key");
    foodId = cats.data!.find((c) => c.key === "food")!.id;
  });

  const unusualFor = async (id: string) => {
    const { data } = await a.client
      .from("nudges")
      .select("type,data,dedupe_key")
      .eq("type", "unusual_transaction");
    return (data ?? []).filter(
      (n) => (n.data as { transaction_id?: string }).transaction_id === id,
    );
  };

  it("a payment ten times the usual produces exactly one alert, once, with the numbers", async () => {
    const reset = await a.client.functions.invoke("reset-demo", { body: { persona: "gig" } });
    expect(reset.error).toBeNull();

    // a payment at an ordinary merchant, ten times what a meal there costs (the gig persona's
    // Biryani House meals cost Rs 80 to 220)
    const ins = await a.client
      .from("transactions")
      .insert({
        user_id: a.id,
        amount: 1800,
        direction: "out",
        channel: "merchant",
        counterparty: "Biryani House",
        note: "",
        category_id: foodId,
        category_source: "rule",
        is_simulated: false,
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(ins.error).toBeNull();
    txId = ins.data!.id as string;

    const first = (await a.client.functions.invoke("generate-nudges", { body: {} }))
      .data as Created;
    expect(first.created).toBeGreaterThanOrEqual(1);
    const found = await unusualFor(txId);
    expect(found).toHaveLength(1);
    const d = found[0]!.data as Record<string, number | string>;
    expect(d.amount).toBe(1800);
    expect(Number(d.z)).toBeGreaterThan(3.5);
    expect(Number(d.typical)).toBeGreaterThan(50);
    expect(Number(d.typical)).toBeLessThan(250);
    expect(d.bucket).toBe("merchant");

    // asking again never repeats it
    await a.client.functions.invoke("generate-nudges", { body: {} });
    expect(await unusualFor(txId)).toHaveLength(1);
  }, 120_000);

  it("the old flat 'category at twice its usual week' alert is no longer raised", async () => {
    const { data } = await a.client.from("nudges").select("type").eq("type", "overspend");
    expect(data).toEqual([]);
  });

  it("an ordinary payment raises nothing", async () => {
    const ins = await a.client
      .from("transactions")
      .insert({
        user_id: a.id,
        amount: 140,
        direction: "out",
        channel: "merchant",
        counterparty: "Biryani House",
        note: "",
        category_id: foodId,
        category_source: "rule",
        is_simulated: false,
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    await a.client.functions.invoke("generate-nudges", { body: {} });
    expect(await unusualFor(ins.data!.id as string)).toHaveLength(0);
  });
});
