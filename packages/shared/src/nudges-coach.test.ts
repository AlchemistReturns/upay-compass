import { describe, expect, it } from "vitest";
import {
  buildCoachContext,
  collectNumbers,
  detectAffordIntent,
  extractAmounts,
  type CoachContextInput,
} from "./coach-context";
import { forecastCashflow, canAfford } from "./forecast";
import { generateNudges, type NudgeInputs } from "./nudge-rules";
import type { RecurringItem } from "./recurring";

const baseInputs: NudgeInputs = {
  today: "2026-10-02",
  categoryWeekly: [],
  goals: [],
  recurring: [],
  forecast: null,
};

const rent: RecurringItem = {
  key: "landlord|send_money|out",
  direction: "out",
  channel: "send_money",
  counterparty: "Landlord",
  cadence: "monthly",
  occurrences: 3,
  typicalAmount: 10000,
  amountStable: true,
  expectedAmount: 10000,
  lastDay: "2026-09-05",
  nextDay: "2026-10-05",
  dayOfMonth: 5,
};

describe("generateNudges", () => {
  it("flags a category at 2x its usual week, with a dedupe key per week", () => {
    const n = generateNudges({
      ...baseInputs,
      categoryWeekly: [
        { categoryId: 1, thisWeek: 1500, avgPriorWeek: 600 },
        { categoryId: 2, thisWeek: 900, avgPriorWeek: 600 }, // under 2x
        { categoryId: 3, thisWeek: 250, avgPriorWeek: 80 }, // 3x but only 170 more: too small to nag
      ],
    });
    expect(n).toEqual([
      {
        type: "overspend",
        data: { category_id: 1, spent: 1500, average: 600 },
        dedupe_key: "overspend:1:2026-09-28",
      },
    ]);
  });

  it("flags bills due within 3 days, once per due date", () => {
    expect(generateNudges({ ...baseInputs, recurring: [rent] })).toEqual([
      {
        type: "bill_due",
        data: { name: "Landlord", amount: 10000, due: "2026-10-05", days: 3 },
        dedupe_key: "bill_due:landlord|send_money|out:2026-10-05",
      },
    ]);
    expect(
      generateNudges({ ...baseInputs, recurring: [{ ...rent, nextDay: "2026-10-06" }] }),
    ).toEqual([]);
    expect(generateNudges({ ...baseInputs, recurring: [{ ...rent, direction: "in" }] })).toEqual(
      [],
    );
  });

  it("flags goals that are behind, once a month", () => {
    const goal = (over: Partial<NudgeInputs["goals"][number]>): NudgeInputs["goals"][number] => ({
      id: "g1",
      title: "Phone",
      targetDate: "2026-12-31",
      ageDays: 30,
      projection: {
        status: "behind",
        remaining: 5000,
        avgMonthly: 800,
        monthsLeft: 6,
        projectedDate: "2027-04-01",
        requiredMonthly: 2000,
      },
      ...over,
    });
    const behind = generateNudges({ ...baseInputs, goals: [goal({})] });
    expect(behind).toHaveLength(1);
    expect(behind[0]).toMatchObject({ type: "goal_behind", dedupe_key: "goal_behind:g1:2026-10" });

    const onTrack = goal({ projection: { ...goal({}).projection, status: "on_track" } });
    expect(generateNudges({ ...baseInputs, goals: [onTrack] })).toEqual([]);

    const none = (ageDays: number) =>
      goal({
        ageDays,
        projection: {
          ...goal({}).projection,
          status: "no_contributions",
          avgMonthly: 0,
          monthsLeft: null,
          projectedDate: null,
        },
      });
    expect(generateNudges({ ...baseInputs, goals: [none(3)] })).toEqual([]); // grace period
    expect(generateNudges({ ...baseInputs, goals: [none(20)] })).toHaveLength(1);
  });

  it("flags a forecast dip within 14 days, once a week", () => {
    const risky = {
      insufficient: false,
      confidence: "ok" as const,
      horizonDays: 30,
      today: "2026-10-02",
      startBalance: 3000,
      series: [],
      safetyBuffer: 2100,
      risks: [{ day: "2026-10-09", balance: 1500, level: "low" as const }],
      firstRiskDay: "2026-10-09",
      lowest: { day: "2026-10-12", balance: 900 },
      recurring: [],
      weekdaySpend: [0, 0, 0, 0, 0, 0, 0],
      weekdayIncome: [0, 0, 0, 0, 0, 0, 0],
      expectedIncome: 0,
      expectedBills: 0,
    };
    const n = generateNudges({ ...baseInputs, forecast: risky });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ type: "forecast_risk", dedupe_key: "forecast_risk:2026-09-28" });
    expect(n[0]!.data).toMatchObject({
      day: "2026-10-09",
      buffer: 2100,
      level: "low",
      lowest: 900,
    });

    expect(
      generateNudges({ ...baseInputs, forecast: { ...risky, firstRiskDay: "2026-10-30" } }),
    ).toEqual([]);
    expect(generateNudges({ ...baseInputs, forecast: { ...risky, insufficient: true } })).toEqual(
      [],
    );
  });
});

describe("reading an affordability question", () => {
  it.each([
    ["Can I afford ৳5,000 for a phone?", 5000],
    ["৫০০০ টাকা দিয়ে একটা ফোন কিনতে পারব?", 5000],
    ["Can I buy a 12k laptop", 12000],
    ["should I get a phone for 2.5 thousand taka", 2500],
    ["can i buy something in 2026 for 8000", 8000],
    ["পারব কি ১ লাখ টাকার বাইক কিনতে?", 100000],
  ])("%s -> %s", (text, amount) => {
    expect(detectAffordIntent(text)).toEqual({ amount });
  });

  it.each([
    "Why did I overspend this week?",
    "I spent 5000 yesterday on food",
    "Should I buy shares?",
    "can I buy a phone",
    "what is my balance in 2026",
  ])("is not an affordability question: %s", (text) => {
    expect(detectAffordIntent(text)).toBeNull();
  });

  it("extracts amounts in both scripts", () => {
    expect(extractAmounts("৳1,250 and 3k").map((a) => a.amount)).toEqual([1250, 3000]);
  });
});

describe("buildCoachContext", () => {
  const input: CoachContextInput = {
    language: "bn",
    incomeType: "gig",
    balance: 18432.6,
    last30: {
      income: 25000.4,
      spend: 21000.5,
      byCategory: [
        { category: "transport", total: 7300.2 },
        { category: "food", total: 4100.9 },
        { category: "other", total: 0 },
      ],
    },
    week: { thisWeek: [], usualWeek: [] },
    budgets: [{ category: "food", limit: 5000, spent: 4100 }],
    goals: [
      {
        title: "Phone",
        target: 20000,
        saved: 3000.4,
        targetDate: "2027-03-01",
        projectedDate: "2027-05-01",
        status: "active",
      },
    ],
    health: {
      score: 62,
      confidence: "ok",
      components: { savings: 40.2, budget: 100, buffer: 33.3, stability: 71.5 },
      actions: ["save_more", "build_buffer"],
    },
    forecast: null,
    txCount: 200,
    historyDays: 90,
  };

  it("rounds, summarizes, and carries nothing identifying", () => {
    const c = buildCoachContext(input);
    expect(c.walletBalance).toBe(18433);
    expect(c.last30Days).toMatchObject({ income: 25000, spending: 21001, saved: 3999 });
    expect(c.last30Days.spendingByCategory.map((x) => x.category)).toEqual(["transport", "food"]);
    expect(c.budgetsThisMonth[0]).toMatchObject({ status: "near" });
    expect(c.healthScore?.componentScores).toEqual({
      savings: 40,
      budget: 100,
      buffer: 33,
      stability: 72,
    });
    expect(c.forecast30Days).toEqual({ available: false });
    expect(c.dataSufficiency).toBe("ok");

    const text = JSON.stringify(c);
    expect(text).not.toMatch(/phone_number|\+?880\d{8,}|counterparty|full_name|email/i);
  });

  it("marks thin data so the coach asks for more history instead of guessing", () => {
    expect(buildCoachContext({ ...input, txCount: 5 }).dataSufficiency).toBe("thin");
    expect(buildCoachContext({ ...input, historyDays: 7 }).dataSufficiency).toBe("thin");
  });

  it("includes the forecast summary and a code-computed affordability answer", () => {
    const f = forecastCashflow({
      now: new Date("2026-10-02T08:00:00Z"),
      balance: 1000,
      transactions: [],
    });
    expect(buildCoachContext({ ...input, forecast: f }).forecast30Days).toEqual({
      available: false,
    });
    const afford = canAfford(500, 1000, f);
    expect(buildCoachContext(input, afford).affordability).toMatchObject({
      verdict: "insufficient",
      amount: 500,
    });
  });

  it("collects every number it exposes, for grounding checks", () => {
    const nums = collectNumbers(buildCoachContext(input));
    expect(nums.has(18433)).toBe(true);
    expect(nums.has(62)).toBe(true);
    expect(nums.has(2027)).toBe(true); // dates inside strings count too
  });
});
