import { describe, expect, it } from "vitest";
import {
  backtestForecast,
  categorize,
  forecastCashflow,
  isEssentialCategory,
  type FlowTx,
} from "@compass/shared";
import { PERSONAS, PERSONA_CONFIGS, generateTransactions, type Persona } from "./index";

const NOW = new Date("2026-10-02T08:00:00Z");

function flowFor(persona: Persona, days: number): FlowTx[] {
  return generateTransactions({ persona, endDay: "2026-10-02", days }).map((t) => {
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
}

const net = (txs: FlowTx[]) =>
  txs.reduce((n, t) => n + (t.direction === "in" ? t.amount : -t.amount), 0);

describe.each(PERSONAS)("forecast on the %s persona", (persona) => {
  const history = flowFor(persona, 120);
  const balance = PERSONA_CONFIGS[persona].openingBalance + net(history);
  const forecast = forecastCashflow({ now: NOW, balance, transactions: history });

  it("has enough history to forecast, and finds the recurring payments", () => {
    expect(forecast.insufficient).toBe(false);
    expect(forecast.confidence).toBe("ok");
    expect(forecast.series).toHaveLength(31);
    expect(forecast.recurring.length).toBeGreaterThanOrEqual(5);
  });

  it("beats a seasonal-naive forecast on held-out days (backtest, 180 days of history)", () => {
    const long = flowFor(persona, 180);
    const b = backtestForecast({ now: NOW, balance: net(long), transactions: long }, 30)!;
    expect(b).not.toBeNull();
    expect(b.mae).toBeLessThan(b.naiveMae);
    // Measured at the time of writing: student 93%, gig 81%, salaried 80%.
    expect(b.improvementPct).toBeGreaterThanOrEqual(50);
  });
});

describe("demo storylines", () => {
  const forecastOf = (persona: Persona) => {
    const history = flowFor(persona, 120);
    const balance = PERSONA_CONFIGS[persona].openingBalance + net(history);
    return forecastCashflow({ now: NOW, balance, transactions: history });
  };

  it("the gig worker gets a visible low-balance warning soon", () => {
    const f = forecastOf("gig");
    expect(f.risks.length).toBeGreaterThan(0);
    expect(f.firstRiskDay! <= "2026-10-16").toBe(true);
    expect(f.lowest!.balance).toBeLessThan(f.safetyBuffer);
  });

  it("the student is comfortable", () => {
    expect(forecastOf("student").risks).toEqual([]);
  });

  it("the salaried worker only dips just before payday", () => {
    const f = forecastOf("salaried");
    expect(f.risks.every((r) => r.level === "low" && r.day >= "2026-10-28")).toBe(true);
  });
});
