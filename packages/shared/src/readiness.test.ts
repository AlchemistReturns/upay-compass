import { describe, expect, it } from "vitest";
import {
  LATE_ZERO_DAYS,
  computeReadiness,
  daysOffSchedule,
  diffReadiness,
  lastMonths,
  parseSavingsActivity,
  paymentScore,
  type ReadinessInputs,
} from "./readiness";
import type { FlowTx } from "./recurring";

const NOW = new Date("2026-04-20T08:00:00Z");

const rent = (day: string, amount = 6500): FlowTx => ({
  direction: "out",
  channel: "send_money",
  counterparty: "Landlord",
  amount,
  occurred_at: `${day}T06:00:00Z`,
});

/** Rent paid on the 5th, 5th, 8th (3 days late) and 5th again. */
const RENT_ONE_LATE = [
  rent("2026-01-05"),
  rent("2026-02-05"),
  rent("2026-03-08"),
  rent("2026-04-05"),
];
const RENT_ALL_ON_TIME = [
  rent("2026-01-05"),
  rent("2026-02-05"),
  rent("2026-03-05"),
  rent("2026-04-05"),
];

const base = (over: Partial<ReadinessInputs> = {}): ReadinessInputs => ({
  txCount: 120,
  historyDays: 90,
  incomeBuckets: [30000, 30000, 30000],
  budgets: [{ categoryId: 1, limit: 1000, spent: 1000 }],
  transactions: RENT_ONE_LATE,
  now: NOW,
  savingsMonths: [
    { month: "2026-04", active: true },
    { month: "2026-03", active: false },
    { month: "2026-02", active: true },
    { month: "2026-01", active: true },
    { month: "2025-12", active: false },
    { month: "2025-11", active: false },
  ],
  firstDay: "2026-02-10",
  ...over,
});

describe("one payment", () => {
  it("is 100 when on time (up to 1 day off), then falls in a straight line to 0", () => {
    expect(paymentScore(0)).toBe(100);
    expect(paymentScore(1)).toBe(100);
    expect(paymentScore(4)).toBeCloseTo(50); // 1 - (4-1)/6
    expect(paymentScore(3)).toBeCloseTo(66.6667, 3);
    expect(paymentScore(LATE_ZERO_DAYS)).toBe(0);
    expect(paymentScore(20)).toBe(0);
  });
});

describe("how far a payment is from its schedule", () => {
  it("monthly: against the usual day of the month", () => {
    // usual day = median(5,5,8,5) = 5
    expect(
      daysOffSchedule("monthly", ["2026-01-05", "2026-02-05", "2026-03-08", "2026-04-05"]),
    ).toEqual([0, 0, 3, 0]);
  });

  it("monthly: a payment on the 30th and then the 1st are one day apart, not 29", () => {
    // usual day = median(30,28,30,30,1) = 30 (clamped to 28 in February)
    expect(
      daysOffSchedule("monthly", [
        "2026-01-30",
        "2026-02-28",
        "2026-03-30",
        "2026-04-30",
        "2026-05-01",
      ]),
    ).toEqual([0, 0, 0, 0, 1]);
  });

  it("weekly: one late payment does not make the others look late", () => {
    // Thursdays, except the third one, which came on the Friday
    expect(
      daysOffSchedule("weekly", ["2026-04-02", "2026-04-09", "2026-04-17", "2026-04-23"]),
    ).toEqual([0, 0, 1, 0]);
  });
});

describe("computeReadiness", () => {
  it("combines the four components with weights 30/30/25/15 (hand-computed)", () => {
    const r = computeReadiness(base());
    // income: CV 0 -> 100. punctuality: payments 100,100,66.67,100 -> mean 91.667, 3 of 4 on time.
    // savings: observed months 2026-04,03,02 (first day 2026-02-10) -> active 04 and 02 -> 2/3 = 66.67.
    // budget: spent = limit -> 100.
    expect(r.components.income.score).toBe(100);
    expect(r.components.punctuality.score).toBeCloseTo(91.6667, 3);
    expect(r.components.punctuality.raw).toBeCloseTo(0.75);
    expect(r.components.punctuality.detail).toEqual({ bills: 1, payments: 4, onTime: 3 });
    expect(r.components.savings.score).toBeCloseTo(66.6667, 3);
    expect(r.components.savings.detail).toEqual({ observed: 3, active: 2 });
    expect(r.components.budget.score).toBe(100);
    // 0.30*100 + 0.30*91.6667 + 0.25*66.6667 + 0.15*100 = 30 + 27.5 + 16.6667 + 15 = 89.1667
    expect(r.score).toBe(89);
    expect(r.confidence).toBe("ok");
  });

  it("all bills on time and saving every month scores 100", () => {
    const r = computeReadiness(
      base({
        transactions: RENT_ALL_ON_TIME,
        savingsMonths: lastMonths("2026-04-20").map((month) => ({ month, active: true })),
        firstDay: "2025-10-01",
      }),
    );
    expect(r.score).toBe(100);
  });

  it("uneven income pulls the income component down (CV 0.5 -> 0)", () => {
    const r = computeReadiness(base({ incomeBuckets: [10000, 30000] }));
    expect(r.components.income.score).toBe(0);
    // 0 + 27.5 + 16.6667 + 15 = 59.1667
    expect(r.score).toBe(59);
  });

  it("a component without enough history is neutral 50 and marked unavailable", () => {
    const r = computeReadiness(
      base({ transactions: [], budgets: [], savingsMonths: [], firstDay: null, incomeBuckets: [] }),
    );
    for (const k of ["income", "punctuality", "savings", "budget"] as const) {
      expect(r.components[k].available).toBe(false);
      expect(r.components[k].score).toBe(50);
    }
    expect(r.score).toBe(50);
    expect(r.confidence).toBe("low");
  });

  it("fewer than two observed months leaves savings neutral", () => {
    const r = computeReadiness(base({ firstDay: "2026-04-01" }));
    expect(r.components.savings.available).toBe(false);
    expect(r.components.savings.detail).toEqual({ observed: 1, active: 1 });
  });

  it("low confidence on thin history", () => {
    expect(computeReadiness(base({ historyDays: 10 })).confidence).toBe("low");
    expect(computeReadiness(base({ txCount: 5 })).confidence).toBe("low");
  });

  it("ignores weekly non-bill payments such as a regular tea stall", () => {
    const tea = ["2026-04-02", "2026-04-09", "2026-04-16"].map((d): FlowTx => ({
      direction: "out",
      channel: "merchant",
      counterparty: "Tea Stall",
      amount: 40,
      occurred_at: `${d}T06:00:00Z`,
    }));
    const r = computeReadiness(base({ transactions: tea }));
    expect(r.components.punctuality.available).toBe(false);
  });
});

describe("what moved the score", () => {
  it("lists changed components, biggest mover first", () => {
    const before = computeReadiness(base({ transactions: RENT_ONE_LATE }));
    const after = computeReadiness(base({ transactions: RENT_ALL_ON_TIME }));
    const changes = diffReadiness(before, after);
    expect(changes).toEqual([{ component: "punctuality", from: 92, to: 100, points: 2.5 }]);
  });
});

describe("helpers", () => {
  it("lastMonths counts back from the month of the day, newest first", () => {
    expect(lastMonths("2026-02-10", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("parses the database's savings activity", () => {
    expect(
      parseSavingsActivity({
        first_day: "2026-01-02",
        months: [
          { month: "2026-04", active: true },
          { month: "2026-03", active: false },
        ],
      }),
    ).toEqual({
      firstDay: "2026-01-02",
      savingsMonths: [
        { month: "2026-04", active: true },
        { month: "2026-03", active: false },
      ],
    });
    expect(parseSavingsActivity(null)).toEqual({ firstDay: null, savingsMonths: [] });
  });
});
