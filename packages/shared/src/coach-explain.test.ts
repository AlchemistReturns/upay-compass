import { describe, expect, it } from "vitest";
import {
  buildCoachContext,
  detectReplyLanguage,
  explainAffordability,
  type CoachContextInput,
} from "./coach-context";
import { fallbackReply } from "./coach-fallback";
import { addDays } from "./dates";
import { canAfford, forecastCashflow } from "./forecast";
import type { FlowTx } from "./recurring";

const NOW = new Date("2026-10-02T08:00:00Z");

const tx = (
  day: string,
  direction: "in" | "out",
  channel: FlowTx["channel"],
  counterparty: string,
  amount: number,
  essential = false,
): FlowTx => ({
  direction,
  channel,
  counterparty,
  amount,
  occurred_at: `${day}T06:00:00Z`,
  essential,
});

/** 300 a day of essentials, rent of 10,000 on the 5th, salary of 30,000 on the 1st (see forecast.test). */
function steady(): FlowTx[] {
  const out: FlowTx[] = [];
  for (let d = "2026-07-05"; d <= "2026-10-02"; d = addDays(d, 1)) {
    out.push(tx(d, "out", "merchant", "Tea Stall", 300, true));
    const dom = Number(d.slice(8));
    if (dom === 5) out.push(tx(d, "out", "send_money", "Landlord", 10000));
    if (dom === 1) out.push(tx(d, "in", "add_money", "Employer", 30000));
  }
  return out;
}

const forecast = forecastCashflow({ now: NOW, balance: 20000, transactions: steady() });

const input = (
  language: "bn" | "en",
  over: Partial<CoachContextInput> = {},
): CoachContextInput => ({
  language,
  incomeType: "gig",
  balance: 20000,
  last30: {
    income: 30000,
    spend: 18000,
    byCategory: [{ category: "food", total: 9000 }],
  },
  week: { thisWeek: [], usualWeek: [] },
  budgets: [],
  goals: [],
  health: {
    score: 62,
    confidence: "ok",
    components: { savings: 80, budget: 50, buffer: 33, stability: 90 },
    actions: ["build_buffer"],
  },
  forecast,
  txCount: 120,
  historyDays: 90,
  ...over,
});

describe("explainAffordability", () => {
  it("states the answer and every figure in plain English, without field names", () => {
    const text = explainAffordability(canAfford(5000, 20000, forecast));
    expect(text).toContain("৳5,000");
    expect(text).toContain("from ৳20,000 to ৳15,000");
    expect(text).toContain("bottom out at ৳-3,700 on 2026-10-31");
    expect(text).toContain("safety buffer of ৳2,100");
    expect(text).toContain("first drop below zero on 2026-10-19");
    expect(text).toContain("Answer: no");
    expect(text).not.toMatch(/lowestAfter|verdict|affordability|firstNegativeDay/);
  });

  it("covers the tight, yes and not-enough-data cases", () => {
    expect(explainAffordability(canAfford(500, 20000, forecast))).toContain("possible but tight");
    const rich = forecastCashflow({ now: NOW, balance: 40000, transactions: steady() });
    expect(explainAffordability(canAfford(5000, 40000, rich))).toContain("Answer: yes");
    const none = forecastCashflow({ now: NOW, balance: 100, transactions: [] });
    expect(explainAffordability(canAfford(500, 100, none))).toContain(
      "not enough transaction history",
    );
  });

  it("is attached to the coach context only when the question was about affordability", () => {
    const afford = canAfford(5000, 20000, forecast);
    expect(buildCoachContext(input("en")).affordability).toBeUndefined();
    const ctx = buildCoachContext(input("en"), afford);
    expect(ctx.affordability?.explanation).toContain("Answer: no");
    expect(ctx.affordability?.verdict).toBe("no");
  });
});

describe("fallbackReply (when the AI is unavailable)", () => {
  it("summarizes the user's own numbers in English, including the forecast dip and the top tip", () => {
    const text = fallbackReply(buildCoachContext(input("en")));
    expect(text).toContain("Your wallet balance is ৳20,000");
    expect(text).toContain("earned ৳30,000 and spent ৳18,000");
    expect(text).toContain('"food" at ৳9,000');
    expect(text).toContain("may fall to ৳1,300 on 2026-10-31, below your safety buffer of ৳2,100");
    expect(text).toContain("financial health score is 62/100");
    expect(text).toContain("building up an emergency buffer");
    expect(text).not.toMatch(/build_buffer|save_more/);
    expect(text).toContain("AI assistant is unavailable");
  });

  it("answers an affordability question from the code's verdict", () => {
    const afford = canAfford(5000, 20000, forecast);
    const text = fallbackReply(buildCoachContext(input("en"), afford));
    expect(text).toContain("could push your balance below zero");
    expect(text).not.toContain("Heads up"); // the affordability answer replaces the generic warning
  });

  it("speaks Bangla when the language is Bangla", () => {
    const text = fallbackReply(buildCoachContext(input("bn")));
    expect(text).toContain("আপনার ওয়ালেটে এখন");
    expect(text).toContain("এআই সহায়ক এখন পাওয়া যাচ্ছে না");
    expect(text).not.toContain("Your wallet");
  });

  it("refuses to guess when there is too little history", () => {
    const text = fallbackReply(buildCoachContext(input("en", { txCount: 3, historyDays: 4 })));
    expect(text).toContain("don't have enough transaction history");
    expect(text).not.toContain("wallet balance is");
  });
});

describe("detectReplyLanguage", () => {
  it("follows the script the user wrote in, and falls back to the app language", () => {
    expect(detectReplyLanguage("Why did I overspend this week?", "bn")).toBe("en");
    expect(detectReplyLanguage("এই সপ্তাহে কেন বেশি খরচ হলো?", "en")).toBe("bn");
    expect(detectReplyLanguage("Can I afford ৫০০০ টাকা?", "en")).toBe("bn");
    expect(detectReplyLanguage("5000?", "bn")).toBe("bn");
    expect(detectReplyLanguage("5000?", "en")).toBe("en");
  });
});

describe("week comparison in the coach context", () => {
  it("gives this week against the usual week, rounded and sorted", () => {
    const c = buildCoachContext(
      input("en", {
        week: {
          thisWeek: [
            { category: "food", total: 1500.4 },
            { category: "transport", total: 2200.6 },
          ],
          usualWeek: [
            { category: "food", total: 700.2 },
            { category: "transport", total: 900.4 },
          ],
        },
      }),
    );
    expect(c.weekComparison.thisWeekSpending).toBe(3701); // 1500 + 2201
    expect(c.weekComparison.usualWeeklySpending).toBe(1600); // 700 + 900
    expect(c.weekComparison.thisWeekByCategory.map((x) => x.category)).toEqual([
      "transport",
      "food",
    ]);
  });
});

describe("coach context never exposes internal ids", () => {
  it("describes improvement areas in words", () => {
    const c = buildCoachContext(input("en"));
    expect(c.healthScore?.topImprovementAreas).toEqual(["building up an emergency buffer"]);
    expect(JSON.stringify(c)).not.toMatch(/build_buffer|save_more|set_budgets|smooth_income/);
  });
});
