import { describe, expect, it } from "vitest";
import { categorize, forecastCashflow, isEssentialCategory, type FlowTx } from "@compass/shared";
import { generateTransactions, walletOpeningBalance } from "./index";

const addDay = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * The demo must show a low-balance warning for the gig worker whatever day it is run on, not just
 * on the day the persona was tuned. Sweeps 45 consecutive "today" dates.
 */
describe("demo storyline holds on any day", () => {
  it("the gig worker's forecast shows a low-balance warning every day for 45 days", () => {
    const missed: string[] = [];
    for (let i = 0; i < 45; i++) {
      const day = addDay("2026-10-01", i);
      const history: FlowTx[] = generateTransactions({
        persona: "gig",
        endDay: day,
        days: 120,
      }).map((t) => {
        const c = categorize(t);
        return {
          direction: t.direction,
          channel: t.channel,
          counterparty: t.counterparty,
          amount: t.amount,
          occurred_at: t.occurred_at,
          essential: c ? isEssentialCategory(c.category) : false,
        };
      });
      const balance =
        walletOpeningBalance("gig", history) +
        history.reduce((n, t) => n + (t.direction === "in" ? t.amount : -t.amount), 0);
      const f = forecastCashflow({
        now: new Date(`${day}T08:00:00Z`),
        balance,
        transactions: history,
      });
      if (f.risks.length === 0) missed.push(day);
    }
    expect(missed).toEqual([]);
  });
});
