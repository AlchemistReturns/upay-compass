import { describe, expect, it } from "vitest";
import { evaluateAll } from "./anomaly-eval";

const END = "2026-10-02";

describe("unusual-payment detection on injected anomalies (45 injected payments, 5 seeds)", () => {
  const results = evaluateAll(END);
  const sum = (
    k:
      | "injected"
      | "statDetected"
      | "catDetected"
      | "flatDetected"
      | "statAlerts"
      | "catAlerts"
      | "flatAlerts",
  ) => results.reduce((n, r) => n + r[k], 0);
  const personaMonths = results.length * (90 / 30) * 5;

  it("injects 3 anomalies per persona per seed", () => {
    expect(sum("injected")).toBe(45);
  });

  it("finds at least 90% of them, more than the old flat rule", () => {
    // Measured when written: 96% (43 of 45) vs 69% (31 of 45) for the flat rule.
    expect(sum("statDetected") / sum("injected")).toBeGreaterThanOrEqual(0.9);
    expect(sum("statDetected")).toBeGreaterThan(sum("flatDetected"));
  });

  it("comparing with the merchant first beats the category-and-weekday bucket alone", () => {
    expect(sum("statDetected")).toBeGreaterThan(sum("catDetected"));
    expect(sum("statAlerts")).toBeLessThan(sum("catAlerts"));
  });

  it("raises far fewer false alarms than the old flat rule on the unmodified data", () => {
    // Measured when written: 1.76 against 9.40 per persona per month.
    expect(sum("statAlerts") / personaMonths).toBeLessThan(3);
    expect(sum("statAlerts")).toBeLessThan(sum("flatAlerts") / 3);
  });

  it("is deterministic", () => {
    expect(evaluateAll(END)).toEqual(results);
  }, 30_000);
});
