import { describe, expect, it } from "vitest";
import {
  DEFAULT_DPS_TENURE,
  DPS_TENURES,
  ILLUSTRATIVE_DPS_ANNUAL_RATE,
  MIN_DPS_MONTHLY,
  monthlyForTarget,
  monthsUntil,
  projectMaturity,
  suggestSavingsPlan,
  type PlanForecast,
} from "./savings-plan";

const NOW = new Date("2026-10-02T08:00:00Z"); // 2 Oct 2026 in Dhaka

/** A flat 30-day forecast at `balance` with the given buffer. */
const flat = (balance: number, safetyBuffer = 2000): PlanForecast => ({
  insufficient: false,
  safetyBuffer,
  series: Array.from({ length: 31 }, (_, i) => ({ day: `d${i}`, balance })),
});

describe("projectMaturity", () => {
  it("compounds monthly, deposits at the start of each month", () => {
    const m = projectMaturity(1000, 12, 0.07);
    expect(m.totalDeposited).toBe(12000);
    // 1000 x ((1 + .07/12)^12 - 1) / (.07/12) x (1 + .07/12)
    expect(m.maturity).toBeCloseTo(12_464.88, 2);
    expect(m.interest).toBeCloseTo(m.maturity - 12000, 2);
  });

  it("is deposits only at a zero rate", () => {
    expect(projectMaturity(500, 24, 0)).toEqual({
      totalDeposited: 12000,
      maturity: 12000,
      interest: 0,
    });
  });

  it("uses the named illustrative rate by default", () => {
    expect(projectMaturity(1000, 12)).toEqual(
      projectMaturity(1000, 12, ILLUSTRATIVE_DPS_ANNUAL_RATE),
    );
  });

  it("grows with tenure and never falls below the deposits", () => {
    let last = 0;
    for (const t of DPS_TENURES) {
      const m = projectMaturity(1000, t);
      expect(m.maturity).toBeGreaterThan(last);
      expect(m.maturity).toBeGreaterThanOrEqual(m.totalDeposited);
      last = m.maturity;
    }
  });
});

describe("monthlyForTarget", () => {
  it("is the smallest whole amount that reaches the target", () => {
    for (const [target, tenure] of [
      [50_000, 12],
      [120_000, 24],
      [9_999, 6],
      [1, 36],
    ] as const) {
      const p = monthlyForTarget(target, tenure);
      expect(projectMaturity(p, tenure).maturity).toBeGreaterThanOrEqual(target);
      if (p > 1) expect(projectMaturity(p - 1, tenure).maturity).toBeLessThan(target);
    }
  });

  it("is 0 for nothing to save", () => {
    expect(monthlyForTarget(0, 12)).toBe(0);
  });
});

describe("monthsUntil", () => {
  it("counts whole 30-day months and ignores missing or passed dates", () => {
    expect(monthsUntil(null, NOW)).toBeNull();
    expect(monthsUntil("2026-10-20", NOW)).toBeNull(); // under a month
    expect(monthsUntil("2026-09-01", NOW)).toBeNull(); // in the past
    expect(monthsUntil("2027-10-02", NOW)).toBe(12); // 365 days
  });
});

describe("suggestSavingsPlan", () => {
  it("suggests the longest preset that ends by the date, with the amount that reaches the goal", () => {
    const s = suggestSavingsPlan({
      target: 60_000,
      saved: 10_000,
      targetDate: "2027-10-02", // 12 months away
      now: NOW,
    });
    expect(s.status).toBe("ok");
    expect(s.remaining).toBe(50_000);
    expect(s.tenureMonths).toBe(12);
    expect(s.monthlyAmount).toBe(monthlyForTarget(50_000, 12));
    expect(s.reachesTarget).toBe(true);
    expect(s.shortfall).toBe(0);
    expect(s.meetsDate).toBe(true);
    expect(s.totalDeposited).toBe(s.monthlyAmount * 12);
    expect(s.projectedMaturity).toBeGreaterThanOrEqual(50_000);
    expect(s.annualRate).toBe(ILLUSTRATIVE_DPS_ANNUAL_RATE);
  });

  it("falls back to the shortest preset, and says it misses the date, when the date is too near", () => {
    const s = suggestSavingsPlan({
      target: 30_000,
      saved: 0,
      targetDate: "2026-12-15", // 2 months
      now: NOW,
    });
    expect(s.tenureMonths).toBe(DPS_TENURES[0]);
    expect(s.meetsDate).toBe(false);
    expect(s.reachesTarget).toBe(true);
  });

  it("uses the default tenure with no target date", () => {
    const s = suggestSavingsPlan({ target: 24_000, saved: 0, targetDate: null, now: NOW });
    expect(s.tenureMonths).toBe(DEFAULT_DPS_TENURE);
    expect(s.meetsDate).toBeNull();
  });

  it("treats a date that has passed like no date", () => {
    const s = suggestSavingsPlan({ target: 24_000, saved: 0, targetDate: "2026-01-01", now: NOW });
    expect(s.tenureMonths).toBe(DEFAULT_DPS_TENURE);
    expect(s.meetsDate).toBeNull();
  });

  it("recomputes the monthly amount when the person picks a tenure", () => {
    const base = { target: 60_000, saved: 0, targetDate: null, now: NOW };
    const short = suggestSavingsPlan({ ...base, tenureMonths: 6 });
    const long = suggestSavingsPlan({ ...base, tenureMonths: 36 });
    expect(short.tenureMonths).toBe(6);
    expect(long.tenureMonths).toBe(36);
    expect(short.monthlyAmount).toBeGreaterThan(long.monthlyAmount);
    expect(long.reachesTarget).toBe(true);
  });

  it("with a monthly amount, picks the shortest tenure that reaches the goal", () => {
    const s = suggestSavingsPlan({
      target: 60_000,
      saved: 0,
      targetDate: null,
      now: NOW,
      monthlyAmount: 2500,
    });
    expect(s.tenureMonths).toBe(24);
    expect(s.reachesTarget).toBe(true);
    expect(projectMaturity(2500, 12).maturity).toBeLessThan(60_000);
  });

  it("with an amount too small for any tenure, suggests the closest and reports the shortfall", () => {
    const s = suggestSavingsPlan({
      target: 500_000,
      saved: 0,
      targetDate: null,
      now: NOW,
      monthlyAmount: 1000,
    });
    expect(s.tenureMonths).toBe(36);
    expect(s.reachesTarget).toBe(false);
    expect(s.shortfall).toBeCloseTo(500_000 - s.projectedMaturity, 2);
  });

  it("with an amount and a target date, never goes past the date", () => {
    const s = suggestSavingsPlan({
      target: 500_000,
      saved: 0,
      targetDate: "2027-10-02", // 12 months
      now: NOW,
      monthlyAmount: 1000,
    });
    expect(s.tenureMonths).toBe(12);
    expect(s.meetsDate).toBe(true);
    expect(s.reachesTarget).toBe(false);
  });

  describe("edge cases", () => {
    it("suggests nothing when the goal is already reached", () => {
      for (const saved of [5000, 7000]) {
        const s = suggestSavingsPlan({ target: 5000, saved, targetDate: null, now: NOW });
        expect(s.status).toBe("goal_reached");
        expect(s.monthlyAmount).toBe(0);
        expect(s.tenureMonths).toBe(0);
        expect(s.projectedMaturity).toBe(0);
        expect(s.affordability).toBeNull();
      }
    });

    it("raises a tiny amount to the minimum and says so", () => {
      const s = suggestSavingsPlan({ target: 60, saved: 0, targetDate: null, now: NOW });
      expect(s.raisedToMinimum).toBe(true);
      expect(s.monthlyAmount).toBe(MIN_DPS_MONTHLY);
      expect(s.reachesTarget).toBe(true);
      const big = suggestSavingsPlan({ target: 60_000, saved: 0, targetDate: null, now: NOW });
      expect(big.raisedToMinimum).toBe(false);
    });

    it("rounds a fractional remainder instead of leaking floats", () => {
      const s = suggestSavingsPlan({ target: 1000.1, saved: 0.2, targetDate: null, now: NOW });
      expect(s.remaining).toBe(999.9);
    });
  });

  describe("affordability", () => {
    const base = { target: 24_000, saved: 0, targetDate: null, now: NOW, tenureMonths: 12 };

    it("is not computed without a forecast", () => {
      expect(suggestSavingsPlan(base).affordability).toBeNull();
    });

    it("is yes when the balance stays above the safety buffer", () => {
      const s = suggestSavingsPlan({ ...base, forecast: flat(20_000), balance: 20_000 });
      expect(s.affordability?.verdict).toBe("yes");
      expect(s.affordability?.amount).toBe(s.monthlyAmount);
    });

    it("flags tight when the first deposit takes the balance under the buffer", () => {
      const probe = suggestSavingsPlan(base);
      const balance = 2000 + probe.monthlyAmount - 50; // ends 50 under the buffer, above zero
      const s = suggestSavingsPlan({ ...base, forecast: flat(balance), balance });
      expect(s.affordability?.verdict).toBe("tight");
    });

    it("flags no when the balance would go below zero", () => {
      const s = suggestSavingsPlan({ ...base, forecast: flat(500), balance: 500 });
      expect(s.affordability?.verdict).toBe("no");
    });

    it("is insufficient when the forecast has too little history", () => {
      const s = suggestSavingsPlan({
        ...base,
        forecast: { insufficient: true, safetyBuffer: 0, series: [] },
        balance: 5000,
      });
      expect(s.affordability?.verdict).toBe("insufficient");
    });
  });
});
