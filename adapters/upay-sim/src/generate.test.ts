import { describe, expect, it } from "vitest";
import { categorize, transactionSchema } from "@compass/shared";
import { PERSONAS, PERSONA_CONFIGS, SimulatedFeed, addDays, generateTransactions } from "./index";

const END = "2026-10-02";

describe.each(PERSONAS)("%s persona", (persona) => {
  const txs = generateTransactions({ persona, endDay: END });

  it("is deterministic for the same seed and persona", () => {
    expect(generateTransactions({ persona, endDay: END })).toEqual(txs);
  });

  it("changes with the seed", () => {
    expect(generateTransactions({ persona, endDay: END, seed: "other" })).not.toEqual(txs);
  });

  it("agrees on overlapping days when the window moves forward", () => {
    const later = generateTransactions({ persona, endDay: addDays(END, 3) });
    const laterIds = new Map(later.map((t) => [t.id, t]));
    const cutoff = addDays(END, -115); // well inside both windows
    const shared = txs.filter((t) => t.occurred_at.slice(0, 10) >= cutoff);
    expect(shared.length).toBeGreaterThan(20);
    for (const t of shared) expect(laterIds.get(t.id)).toEqual(t);
  });

  it("produces valid, uniquely identified, time-ordered transactions over ~90 days", () => {
    expect(txs.length).toBeGreaterThan(100);
    expect(txs.length).toBeLessThan(400);
    expect(new Set(txs.map((t) => t.id)).size).toBe(txs.length);
    for (const t of txs) expect(transactionSchema.safeParse(t).success).toBe(true);
    const times = txs.map((t) => t.occurred_at);
    expect([...times].sort()).toEqual(times);
    const spanDays = (Date.parse(times.at(-1)!) - Date.parse(times[0]!)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(110);
    expect(spanDays).toBeLessThan(121);
  });

  it("never lets the wallet go negative", () => {
    let balance = PERSONA_CONFIGS[persona].openingBalance;
    for (const t of txs) {
      balance += t.direction === "in" ? t.amount : -t.amount;
      expect(balance).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes some merchants the keyword rules cannot know, but mostly categorizable ones", () => {
    const unknown = txs.filter((t) => categorize(t) === null);
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.length / txs.length).toBeLessThan(0.1);
  });
});

describe("persona traits", () => {
  it("the salaried persona gets a salary on the 1st of each month", () => {
    const txs = generateTransactions({ persona: "salaried", endDay: END });
    const salaries = txs.filter((t) => t.direction === "in");
    expect(salaries).toHaveLength(4);
    expect(salaries.every((t) => t.amount === 42000 && t.note === "salary")).toBe(true);
  });

  it("the gig persona is paid weekly in uneven amounts", () => {
    const txs = generateTransactions({ persona: "gig", endDay: END });
    const payouts = txs.filter((t) => t.counterparty === "Pathao Rides Payout");
    expect(payouts.length).toBeGreaterThanOrEqual(12);
    const amounts = payouts.map((t) => t.amount);
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeGreaterThan(2000);
  });

  it("the student persona gets a monthly allowance", () => {
    const txs = generateTransactions({ persona: "student", endDay: END });
    expect(txs.filter((t) => t.note === "monthly allowance")).toHaveLength(4);
  });
});

describe("SimulatedFeed", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("returns the same history for any user and honors `since`", async () => {
    const feed = new SimulatedFeed("gig", { now });
    const all = await feed.getTransactions("user-a", new Date(0));
    expect(await feed.getTransactions("user-b", new Date(0))).toEqual(all);

    const since = new Date("2026-09-15T00:00:00Z");
    const recent = await feed.getTransactions("user-a", since);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThan(all.length);
    expect(recent.every((t) => new Date(t.occurred_at) >= since)).toBe(true);
  });

  it("exposes the persona's opening balance", () => {
    expect(new SimulatedFeed("salaried").openingBalance).toBe(31400);
  });
});
