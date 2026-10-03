import { describe, expect, it } from "vitest";
import {
  costPerActiveUserMonth,
  evaluateHealth,
  percentileOrNull,
  summarizeEvents,
  type HealthSnapshot,
  type ModelEvent,
} from "./health-monitor.ts";
import { estimateCostUsd, priceFor } from "./model-pricing.ts";

describe("percentileOrNull", () => {
  it("interpolates like percentile_cont", () => {
    expect(percentileOrNull([1, 2, 3, 4], 0.5)).toBe(2.5);
    // rank = 0.95 * 19 = 18.05, so 19 + 0.05 * (20 - 19)
    expect(
      percentileOrNull(
        Array.from({ length: 20 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBeCloseTo(19.05, 10);
  });
  it("handles unsorted, single and empty input", () => {
    expect(percentileOrNull([9, 1, 5], 0.5)).toBe(5);
    expect(percentileOrNull([7], 0.95)).toBe(7);
    expect(percentileOrNull([], 0.5)).toBeNull();
  });
});

describe("estimateCostUsd", () => {
  it("prices tokens per million", () => {
    // 1,000,000 * 0.25 + 500,000 * 2.00 = 0.25 + 1.00
    const { usd, unpriced } = estimateCostUsd([
      { model: "gpt-5-mini", tokens_in: 1_000_000, tokens_out: 500_000 },
    ]);
    expect(usd).toBeCloseTo(1.25, 10);
    expect(unpriced).toEqual([]);
  });
  it("matches a dated model name and names models it cannot price", () => {
    expect(priceFor("gpt-5-mini-2025-08-07")).toEqual({ input: 0.25, output: 2 });
    const r = estimateCostUsd([{ model: "mystery-1", tokens_in: 10, tokens_out: 10 }]);
    expect(r.usd).toBe(0);
    expect(r.unpriced).toEqual(["mystery-1"]);
  });
});

const base: HealthSnapshot = {
  hours: 24,
  bucket_hours: 1,
  generated_at: "2026-10-04T00:00:00.000Z",
  min_group_size: 5,
  overall: {
    calls: 100,
    errors: 2,
    fallbacks: 3,
    checked: 40,
    stopped: 10,
    p50_ms: 2000,
    p95_ms: 18000,
  },
  functions: [],
  series: [],
  // 24 h: 0.025 + 0.02 = $0.045 a day, x30 = $1.35 a month, over 6 people = $0.225
  models: [{ model: "gpt-5-mini", calls: 100, tokens_in: 100_000, tokens_out: 10_000 }],
  active_users: { people: 6 },
  accuracy: { people: 8, payments: 200, by_rule: 150, by_ai: 20, corrected: 20, needs_review: 10 },
  forecast: { people: 8, better: 7, median_improvement_pct: 8 },
};

const metric = (s: HealthSnapshot, id: string) =>
  evaluateHealth(s).metrics.find((m) => m.id === id)!;

describe("evaluateHealth", () => {
  it("applies each rule on its boundary values", () => {
    expect(metric(base, "responding")).toMatchObject({ status: "ok", value: 2000 });
    // 100 calls, 2 errors + 3 fallbacks: 95 of 100 answered by the AI, exactly the ok line
    expect(metric(base, "ai_available")).toMatchObject({ status: "ok", value: 95 });
    // 10 of 40 stopped = 25%, between 20 and 40
    expect(metric(base, "safety")).toMatchObject({ status: "watch", value: 25 });
    // 20 of 200 corrected = 10% (ok up to 12), so 90% left as filed
    expect(metric(base, "accuracy")).toMatchObject({ status: "ok", value: 90 });
    expect(metric(base, "forecast")).toMatchObject({ status: "watch", value: 8 });
    expect(metric(base, "cost").status).toBe("watch");
    expect(metric(base, "cost").value).toBeCloseTo(0.225, 10);
    expect(costPerActiveUserMonth(base)).toBeCloseTo(0.225, 10);
  });

  it("calls an outage a problem and the overall status the worst one", () => {
    const outage: HealthSnapshot = {
      ...base,
      overall: { ...base.overall, fallbacks: 60, errors: 5 },
    };
    // 65 of 100 unavailable: 35% answered, below 85
    expect(metric(outage, "ai_available")).toMatchObject({ status: "problem", value: 35 });
    expect(evaluateHealth(outage).overall).toBe("problem");
    expect(evaluateHealth(base).overall).toBe("watch");
  });

  it("never alerts on tiny samples", () => {
    const tiny: HealthSnapshot = {
      ...base,
      overall: {
        calls: 19,
        errors: 19,
        fallbacks: 0,
        checked: 19,
        stopped: 19,
        p50_ms: 90_000,
        p95_ms: 99_000,
      },
      accuracy: {
        ...(base.accuracy as object),
        payments: 49,
        corrected: 49,
      } as HealthSnapshot["accuracy"],
      forecast: { people: 4, better: 0, median_improvement_pct: -50 },
      active_users: { people: 4 },
    };
    const result = evaluateHealth(tiny);
    expect(result.metrics.every((m) => m.status === "unknown" && m.value === null)).toBe(true);
    expect(result.overall).toBe("unknown");
  });

  it("marks figures hidden for small groups", () => {
    const hidden: HealthSnapshot = {
      ...base,
      active_users: { suppressed: true },
      accuracy: { suppressed: true },
      forecast: { suppressed: true },
    };
    for (const id of ["accuracy", "forecast", "cost"]) {
      expect(metric(hidden, id)).toMatchObject({ status: "unknown", value: null, hidden: true });
    }
  });

  it("flags a forecast that loses to the baseline", () => {
    const worse = { ...base, forecast: { people: 6, better: 1, median_improvement_pct: -3 } };
    expect(metric(worse, "forecast")).toMatchObject({ status: "problem", value: -3 });
  });
});

describe("summarizeEvents", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const ev = (minAgo: number, over: Partial<ModelEvent>): ModelEvent => ({
    at: now - minAgo * 60_000,
    function_name: "coach-chat",
    status: "ok",
    latency_ms: 1000,
    model: "gpt-5-mini",
    tokens_in: 100,
    tokens_out: 50,
    fallback_used: false,
    reason_code: null,
    ...over,
  });
  const extras = {
    active_users: { suppressed: true } as const,
    accuracy: { suppressed: true } as const,
    forecast: { suppressed: true } as const,
  };

  it("counts, percentiles and tokens match a hand calculation", () => {
    const events = [
      ev(10, { latency_ms: 1000 }),
      ev(20, { latency_ms: 3000, fallback_used: true, reason_code: "openai_500" }),
      ev(30, { function_name: "voice-command", latency_ms: 2000, reason_code: "check_unclear" }),
      ev(40, {
        function_name: "voice-command",
        latency_ms: 500,
        status: "error",
        reason_code: "model_failed",
      }),
      ev(50, { function_name: "voice-command", latency_ms: 4000 }),
      ev(60 * 30, { latency_ms: 9999 }), // 30 hours ago: outside a 24 h window
    ];
    const s = summarizeEvents(events, 24, now, extras);
    expect(s.overall).toMatchObject({
      calls: 5,
      errors: 1,
      fallbacks: 1,
      // voice-command requests that reached the validator: the two with status ok
      checked: 2,
      stopped: 1,
      // sorted 500, 1000, 2000, 3000, 4000: median 2000; p95 = 3000 + 0.8 * (4000 - 3000) = 3800
      p50_ms: 2000,
      p95_ms: 3800,
    });
    expect(s.functions.map((f) => [f.function_name, f.calls])).toEqual([
      ["coach-chat", 2],
      ["voice-command", 3],
    ]);
    expect(s.models).toEqual([{ model: "gpt-5-mini", calls: 5, tokens_in: 500, tokens_out: 250 }]);
    expect(s.series).toHaveLength(24);
    expect(s.series.reduce((n, p) => n + p.calls, 0)).toBe(5);
  });
});
