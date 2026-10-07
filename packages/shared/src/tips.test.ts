import { describe, expect, it } from "vitest";
import { GENERIC_TIP_COUNT, dayIndex, pickDailyTip } from "./tips";
import type { HealthResult } from "./health";

const health = (over: Partial<HealthResult> = {}): HealthResult => ({
  score: 60,
  confidence: "ok",
  components: {} as HealthResult["components"],
  actions: [],
  ...over,
});

describe("pickDailyTip", () => {
  it("puts a forecast dip first", () => {
    const tip = pickDailyTip({
      today: "2026-10-07",
      health: health({
        actions: [{ id: "save_more", component: "savings", params: {} }],
      }),
      forecast: {
        insufficient: false,
        lowest: { day: "2026-10-24", balance: -120.4 },
        firstRiskDay: "2026-10-22",
      },
    });
    expect(tip).toMatchObject({ id: "forecast_dip", personal: true, href: "/forecast" });
    expect(tip.params).toEqual({ day: "2026-10-24", amount: -120 });
  });

  it("falls back to the top health action", () => {
    const tip = pickDailyTip({
      today: "2026-10-07",
      health: health({ actions: [{ id: "set_budgets", component: "budget", params: {} }] }),
      forecast: { insufficient: false, lowest: null, firstRiskDay: null },
    });
    expect(tip).toMatchObject({ id: "health_set_budgets", personal: true, href: "/budgets" });
  });

  it("ignores an unreliable score and an insufficient forecast", () => {
    const tip = pickDailyTip({
      today: "2026-10-07",
      health: health({
        confidence: "low",
        actions: [{ id: "save_more", component: "savings", params: {} }],
      }),
      forecast: {
        insufficient: true,
        lowest: { day: "2026-10-24", balance: -5 },
        firstRiskDay: "2026-10-24",
      },
    });
    expect(tip.personal).toBe(false);
    expect(tip.id).toMatch(/^generic_\d$/);
  });

  it("rotates the generic tip by day, deterministically, within range", () => {
    const seen = new Set<number>();
    for (let d = 1; d <= 30; d++) {
      const day = `2026-10-${String(d).padStart(2, "0")}`;
      const a = dayIndex(day);
      expect(a).toBe(dayIndex(day));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(GENERIC_TIP_COUNT);
      seen.add(a);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("works with no data at all", () => {
    expect(pickDailyTip({ today: "2026-10-07", health: null, forecast: null }).personal).toBe(
      false,
    );
  });
});
