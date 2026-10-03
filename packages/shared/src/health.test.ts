import { describe, expect, it } from "vitest";
import { computeHealthScore, diffHealth, parseHealthInputs, type HealthInputs } from "./health";

const base: HealthInputs = {
  txCount: 120,
  historyDays: 90,
  income: 90000,
  spend: 60000,
  essentialSpend: 30000,
  essentialMonths: [10000, 10000, 10000],
  essentialThisMonth: 4000,
  incomeBuckets: [30000, 30000, 30000],
  balance: 40000,
  budgets: [{ categoryId: 1, limit: 1000, spent: 500 }],
};

describe("computeHealthScore", () => {
  it("scores 100 with nothing left to improve, and gives no tips", () => {
    const r = computeHealthScore(base);
    expect(r.score).toBe(100);
    expect(r.confidence).toBe("ok");
    expect(r.actions).toEqual([]);
    for (const c of Object.values(r.components)) {
      expect(c.score).toBe(100);
      expect(c.available).toBe(true);
    }
  });

  it("gives a fixed score for fixed inputs (hand-computed)", () => {
    const r = computeHealthScore({
      ...base,
      income: 30000,
      spend: 27000, // saved 10% -> half of the 20% target = 50
      essentialMonths: [6000, 6000, 6000], // 6000 a month
      balance: 3000, // half a month of buffer -> 0.5 / 3 = 16.67
      budgets: [{ categoryId: 7, limit: 1000, spent: 1250 }], // 25% over -> 50
      incomeBuckets: [10000, 10000, 10000], // CV 0 -> 100
    });
    expect(r.components.savings.score).toBeCloseTo(50, 5);
    expect(r.components.budget.score).toBeCloseTo(50, 5);
    expect(r.components.buffer.score).toBeCloseTo(16.6667, 3);
    expect(r.components.stability.score).toBe(100);
    // 0.30*50 + 0.25*50 + 0.25*16.667 + 0.20*100 = 51.67
    expect(r.score).toBe(52);
  });

  it("ranks tips by how many points they could win, with concrete numbers", () => {
    const r = computeHealthScore({
      ...base,
      income: 30000,
      spend: 27000,
      essentialMonths: [6000, 6000, 6000],
      balance: 3000,
      budgets: [{ categoryId: 7, limit: 1000, spent: 1250 }],
      incomeBuckets: [10000, 10000, 10000],
    });
    expect(r.actions.map((a) => a.id)).toEqual(["build_buffer", "save_more", "fix_budget"]);
    expect(r.actions[0]!.params).toEqual({ months: 0.5, targetMonths: 3, missing: 15000 });
    expect(r.actions[1]!.params).toEqual({ ratePct: 10, targetPct: 20, extraMonthly: 1000 });
    expect(r.actions[2]!.params).toEqual({ overCount: 1, categoryId: 7, overBy: 250 });
  });

  it("scores income stability from the coefficient of variation", () => {
    const r = computeHealthScore({ ...base, incomeBuckets: [10000, 20000, 30000] });
    // mean 20000, population std 8164.97 -> CV 0.408 -> 1 - 0.408 / 0.5 = 18.35
    expect(r.components.stability.raw).toBeCloseTo(0.408, 3);
    expect(r.components.stability.score).toBeCloseTo(18.35, 1);
    expect(r.actions.some((a) => a.id === "smooth_income")).toBe(true);
  });

  it("uses a neutral score and asks for budgets when a component cannot be measured", () => {
    const r = computeHealthScore({
      txCount: 3,
      historyDays: 5,
      income: 0,
      spend: 200,
      essentialSpend: 0,
      essentialMonths: [],
      essentialThisMonth: 0,
      incomeBuckets: [],
      balance: 100,
      budgets: [],
    });
    expect(r.score).toBe(50);
    expect(r.confidence).toBe("low");
    expect(Object.values(r.components).every((c) => !c.available && c.score === 50)).toBe(true);
    expect(r.actions.map((a) => a.id)).toEqual(["set_budgets"]);
  });

  it("flags low confidence for short histories and few transactions", () => {
    expect(computeHealthScore({ ...base, historyDays: 20 }).confidence).toBe("low");
    expect(computeHealthScore({ ...base, txCount: 10 }).confidence).toBe("low");
  });

  it("never lets a negative balance or overspending push scores outside 0-100", () => {
    const r = computeHealthScore({
      ...base,
      spend: 200000,
      balance: -5000,
      budgets: [{ categoryId: 1, limit: 100, spent: 900 }],
    });
    expect(r.components.savings.score).toBe(0);
    expect(r.components.buffer.score).toBe(0);
    expect(r.components.budget.score).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("improves monotonically as spending falls", () => {
    const scores = [80000, 70000, 60000, 50000].map(
      (spend) => computeHealthScore({ ...base, spend }).score,
    );
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});

describe("diffHealth", () => {
  it("reports what moved, biggest first, in score points", () => {
    const before = computeHealthScore({
      ...base,
      budgets: [{ categoryId: 1, limit: 1000, spent: 1250 }],
    });
    const after = computeHealthScore({ ...base, spend: 80000 });
    const diff = diffHealth(before, after);
    const budget = diff.find((d) => d.component === "budget")!;
    expect(budget).toEqual({ component: "budget", from: 50, to: 100, points: 12.5 });
    const savings = diff.find((d) => d.component === "savings")!;
    expect(savings.to).toBeLessThan(savings.from);
    expect(Math.abs(diff[0]!.points)).toBeGreaterThanOrEqual(Math.abs(diff.at(-1)!.points));
  });

  it("is empty when nothing changed", () => {
    const r = computeHealthScore(base);
    expect(diffHealth(r, r)).toEqual([]);
  });
});

describe("parseHealthInputs", () => {
  it("maps the database aggregates to typed inputs", () => {
    const parsed = parseHealthInputs({
      tx_count: 10,
      history_days: 30,
      income: "1000.5",
      spend: 400,
      essential_spend: 200,
      essential_months: [100, 90],
      essential_this_month: 30,
      income_buckets: [500, 500.5],
      balance: 900,
      budgets: [{ category_id: 3, limit: 100, spent: 40 }],
    });
    expect(parsed).toEqual({
      txCount: 10,
      historyDays: 30,
      income: 1000.5,
      spend: 400,
      essentialSpend: 200,
      essentialMonths: [100, 90],
      essentialThisMonth: 30,
      incomeBuckets: [500, 500.5],
      balance: 900,
      budgets: [{ categoryId: 3, limit: 100, spent: 40 }],
    });
  });

  it("survives an empty account", () => {
    const parsed = parseHealthInputs({ tx_count: 0, history_days: 0 });
    expect(parsed.txCount).toBe(0);
    expect(parsed.historyDays).toBe(1);
    expect(parsed.budgets).toEqual([]);
  });
});

describe("buffer on a monthly basis", () => {
  const fresh = {
    ...base,
    historyDays: 1,
    txCount: 2,
    essentialMonths: [] as number[],
  };

  it("uses this month so far, unscaled, until a month has completed", () => {
    // 25,000 in and 4,000 of essentials in one day: the balance is 21,000
    const r = computeHealthScore({ ...fresh, balance: 21000, essentialThisMonth: 4000 });
    expect(r.components.buffer.available).toBe(true);
    expect(r.components.buffer.basis).toBe("month_so_far");
    expect(r.components.buffer.raw).toBeCloseTo(5.25, 5); // 21000 / 4000, not 21000 / 120000
    expect(r.components.buffer.score).toBe(100);
  });

  it("never multiplies a short history up to a month", () => {
    const r = computeHealthScore({ ...fresh, balance: 6000, essentialThisMonth: 12000 });
    expect(r.components.buffer.raw).toBeCloseTo(0.5, 5); // 6000 / 12000
    expect(r.components.buffer.score).toBeCloseTo(16.6667, 3);
  });

  it("counts rent paid once a month once, whenever in the month you look", () => {
    // rent 12,000 paid once, plus 3,000 of other essentials, over two complete months
    const months = computeHealthScore({
      ...base,
      balance: 30000,
      essentialMonths: [15000, 15000],
      essentialThisMonth: 0,
    });
    expect(months.components.buffer.basis).toBe("months");
    expect(months.components.buffer.raw).toBeCloseTo(2, 5); // 30000 / 15000
  });

  it("averages the complete months, up to three", () => {
    const r = computeHealthScore({
      ...base,
      balance: 30000,
      essentialMonths: [10000, 20000, 30000],
      essentialThisMonth: 1000,
    });
    expect(r.components.buffer.raw).toBeCloseTo(1.5, 5); // 30000 / 20000
    expect(r.components.buffer.basis).toBe("months");
  });

  it("falls back to this month when the complete months logged no essentials", () => {
    const r = computeHealthScore({
      ...base,
      balance: 8000,
      essentialMonths: [0],
      essentialThisMonth: 4000,
    });
    expect(r.components.buffer.basis).toBe("month_so_far");
    expect(r.components.buffer.raw).toBeCloseTo(2, 5);
  });

  it("is neutral when there are no essentials to measure against", () => {
    const r = computeHealthScore({ ...fresh, essentialThisMonth: 0 });
    expect(r.components.buffer.available).toBe(false);
    expect(r.components.buffer.score).toBe(50);
  });

  it("does not inflate the save-more tip for a one-day history", () => {
    const r = computeHealthScore({
      ...fresh,
      income: 25000,
      spend: 24000,
      balance: 1000,
      essentialThisMonth: 100,
    });
    const tip = r.actions.find((a) => a.id === "save_more");
    // needs 5,000 saved to reach 20%, has 1,000: 4,000 more, not 4,000 x 30
    expect(tip?.params.extraMonthly).toBe(4000);
  });
});
