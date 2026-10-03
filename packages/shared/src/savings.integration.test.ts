import { beforeAll, describe, expect, it } from "vitest";
import { parseHealthInputs } from "./health";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * The savings account: money moved into it leaves the wallet; goals are funded from the wallet.
 * Users cannot delete savings entries, so every expectation is relative to where the account
 * stands when the test starts (it can be re-run on the same stack).
 */
describe.skipIf(!url || !anon)("explicit savings", () => {
  let a: TestUser;
  let b: TestUser;
  let goalId: string;
  let wallet0: number;
  let free0: number;
  let allocated0: number;

  const wallet = async () => Number((await a.client.rpc("wallet_balance")).data);
  const summary = async () =>
    (await a.client.rpc("savings_summary")).data as {
      allocated: number;
      free: number;
      total: number;
    };
  const errorOf = (r: { error: { message: string } | null }) => r.error?.message ?? "";

  beforeAll(async () => {
    a = await signIn("+8801700000005");
    b = await signIn("+8801700000002");
    // goals (and with them their contributions) can be deleted; savings entries cannot
    await a.client.from("goals").delete().eq("user_id", a.id);
    await a.client.from("transactions").delete().eq("user_id", a.id);
    // 10,000 received, so there is money to move (health_inputs also needs a payment to exist)
    await a.client.from("transactions").insert({
      user_id: a.id,
      amount: 10000,
      direction: "in",
      channel: "add_money",
      counterparty: "Savings test",
      occurred_at: new Date().toISOString(),
    });
    const g = await a.client
      .from("goals")
      .insert({ user_id: a.id, title: "Savings test", target_amount: 5000 })
      .select("id")
      .single();
    goalId = g.data!.id as string;
    wallet0 = await wallet();
    const s = await summary();
    free0 = s.free;
    allocated0 = s.allocated;
  });

  it("starts with nothing allocated to the new goal", async () => {
    expect(allocated0).toBe(0);
  });

  it("a deposit leaves the wallet and sits in savings", async () => {
    const r = await a.client.rpc("deposit_to_savings", { p_amount: 3000 });
    expect(r.error).toBeNull();
    expect(await wallet()).toBe(wallet0 - 3000);
    expect(await summary()).toMatchObject({ free: free0 + 3000, allocated: 0 });
  });

  it("cannot deposit more than the wallet holds, or a bad amount", async () => {
    expect(
      errorOf(await a.client.rpc("deposit_to_savings", { p_amount: wallet0 - 3000 + 1 })),
    ).toMatch(/insufficient_balance/);
    expect(errorOf(await a.client.rpc("deposit_to_savings", { p_amount: 0 }))).toMatch(
      /invalid_amount/,
    );
    expect(await wallet()).toBe(wallet0 - 3000);
  });

  it("putting money into a goal takes it from the wallet too", async () => {
    const r = await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: 2000 });
    expect(r.error).toBeNull();
    expect(await wallet()).toBe(wallet0 - 5000);
    expect(await summary()).toMatchObject({ free: free0 + 3000, allocated: 2000 });
    const goal = await a.client.from("goals").select("saved_amount").eq("id", goalId).single();
    expect(Number(goal.data!.saved_amount)).toBe(2000);
  });

  it("a goal cannot be funded beyond the wallet", async () => {
    const tooMuch = wallet0 - 5000 + 1;
    expect(
      errorOf(await a.client.rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: tooMuch })),
    ).toMatch(/insufficient_balance/);
  });

  it("withdraws only free savings, not money allocated to a goal", async () => {
    expect(
      errorOf(await a.client.rpc("withdraw_from_savings", { p_amount: free0 + 3000 + 1 })),
    ).toMatch(/insufficient_savings/);
    const r = await a.client.rpc("withdraw_from_savings", { p_amount: 1000 });
    expect(r.error).toBeNull();
    expect(await wallet()).toBe(wallet0 - 4000);
    expect(await summary()).toMatchObject({ free: free0 + 2000, allocated: 2000 });
  });

  it("undoing a goal contribution returns the money to the wallet", async () => {
    const { data } = await a.client
      .from("goal_contributions")
      .select("id")
      .eq("goal_id", goalId)
      .limit(1);
    const undo = await a.client.rpc("undo_goal_contribution", {
      p_contribution_id: data![0]!.id,
    });
    expect(undo.error).toBeNull();
    expect(await wallet()).toBe(wallet0 - 2000);
  });

  it("the health inputs carry the savings balance and the wallet it leaves behind", async () => {
    const { data } = await a.client.rpc("health_inputs");
    const inputs = parseHealthInputs(data);
    const s = await summary();
    expect(inputs.savingsBalance).toBe(s.total);
    expect(inputs.balance).toBe(await wallet());
    // the 2,000 net deposited just now is part of the explicit saving over the window
    expect(inputs.saved).toBeGreaterThanOrEqual(2000);
  });

  it("savings entries cannot be written, deleted or read by anyone else", async () => {
    const forged = await a.client
      .from("savings_entries")
      .insert({ user_id: a.id, kind: "deposit", amount: 99999 });
    expect(forged.error).not.toBeNull();
    const theirs = await b.client.from("savings_entries").select("id").eq("user_id", a.id);
    expect(theirs.data).toEqual([]);
  });
});
