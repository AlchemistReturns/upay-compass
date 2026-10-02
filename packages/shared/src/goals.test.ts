import { describe, expect, it } from "vitest";
import { projectGoal, roundUpAmount } from "./goals";

describe("roundUpAmount", () => {
  it.each([
    [123, 7],
    [130, 0],
    [99.5, 0.5],
    [5, 5],
    [0.1, 9.9],
    [1000, 0],
    [19.99, 0.01],
  ])("rounds %s up by %s", (amount, expected) => {
    expect(roundUpAmount(amount)).toBeCloseTo(expected, 10);
  });

  it("always lands on a multiple of 10 and never exceeds 9.99", () => {
    for (let i = 1; i <= 5000; i += 7) {
      const amount = i / 4;
      const total = Math.round((amount + roundUpAmount(amount)) * 100);
      expect(total % 1000).toBe(0);
      expect(roundUpAmount(amount)).toBeLessThan(10);
    }
  });
});

describe("projectGoal", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("projects remaining / average monthly contribution", () => {
    const p = projectGoal({
      target: 1000,
      saved: 400,
      targetDate: null,
      contributions: [{ amount: 400, created_at: daysAgo(30) }],
      now,
    });
    expect(p.status).toBe("on_track");
    expect(p.remaining).toBe(600);
    expect(p.avgMonthly).toBe(400);
    expect(p.monthsLeft).toBe(1.5);
    expect(p.projectedDate).toBe("2026-11-16"); // 45 days later
    expect(p.requiredMonthly).toBeNull();
  });

  it("is behind when the projection lands after the target date, and says what would work", () => {
    const p = projectGoal({
      target: 1000,
      saved: 400,
      targetDate: "2026-11-01",
      contributions: [{ amount: 400, created_at: daysAgo(30) }],
      now,
    });
    expect(p.status).toBe("behind");
    expect(p.requiredMonthly).toBe(581);
  });

  it("is on track when the projection lands before the target date", () => {
    const p = projectGoal({
      target: 1000,
      saved: 400,
      targetDate: "2026-12-31",
      contributions: [{ amount: 400, created_at: daysAgo(30) }],
      now,
    });
    expect(p.status).toBe("on_track");
  });

  it("has no projection without recent contributions", () => {
    const none = projectGoal({ target: 500, saved: 0, targetDate: null, contributions: [], now });
    expect(none).toMatchObject({
      status: "no_contributions",
      avgMonthly: 0,
      monthsLeft: null,
      projectedDate: null,
    });

    const stale = projectGoal({
      target: 500,
      saved: 100,
      targetDate: null,
      contributions: [{ amount: 100, created_at: daysAgo(120) }],
      now,
    });
    expect(stale.status).toBe("no_contributions");
  });

  it("treats a young contribution history as at least a 30-day span", () => {
    const p = projectGoal({
      target: 1000,
      saved: 300,
      targetDate: null,
      contributions: [{ amount: 300, created_at: daysAgo(5) }],
      now,
    });
    expect(p.avgMonthly).toBe(300);
  });

  it("averages over the span since the first contribution in the window", () => {
    const p = projectGoal({
      target: 1000,
      saved: 300,
      targetDate: null,
      contributions: [
        { amount: 100, created_at: daysAgo(60) },
        { amount: 100, created_at: daysAgo(30) },
        { amount: 100, created_at: daysAgo(1) },
      ],
      now,
    });
    expect(p.avgMonthly).toBe(150);
  });

  it("is completed once the target is reached", () => {
    const p = projectGoal({ target: 500, saved: 500, targetDate: null, contributions: [], now });
    expect(p).toMatchObject({ status: "completed", remaining: 0, monthsLeft: 0 });
  });
});
