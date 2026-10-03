import { estimateCostUsd } from "./model-pricing.ts";
import { percentile } from "./recurring.ts";

/**
 * AI and product health, as plain numbers. Everything here is pure: the Edge Functions write
 * counts, the system_health() function aggregates them, and this file turns the aggregates into
 * "ok / watch / problem" with fixed, documented rules. No model text is involved anywhere, and
 * rules return ids and numbers (the app words them from translation templates).
 */

/** Functions whose model output is validated by code. Keep in step with system_health() in SQL. */
export const CHECKED_FUNCTIONS = [
  "categorize-transaction",
  "voice-command",
  "generate-learn-modules",
] as const;

export type Suppressed = { suppressed: true };

export type Totals = {
  calls: number;
  errors: number;
  fallbacks: number;
  /** requests whose model output went through a validator */
  checked: number;
  /** of those, requests where the validator stopped or changed the output */
  stopped: number;
  p50_ms: number | null;
  p95_ms: number | null;
};

export type FunctionStats = Pick<Totals, "calls" | "errors" | "fallbacks" | "p50_ms" | "p95_ms"> & {
  function_name: string;
};

export type SeriesPoint = Pick<
  Totals,
  "calls" | "errors" | "fallbacks" | "checked" | "stopped" | "p95_ms"
> & {
  /** start of the bucket, ISO time */
  t: string;
  /** model name to [tokens in, tokens out] */
  tokens: Record<string, [number, number]>;
};

export type ModelTotals = { model: string; calls: number; tokens_in: number; tokens_out: number };

export type HealthSnapshot = {
  hours: number;
  bucket_hours: number;
  generated_at: string;
  min_group_size: number;
  overall: Totals;
  functions: FunctionStats[];
  series: SeriesPoint[];
  models: ModelTotals[];
  active_users: { people: number } | Suppressed;
  accuracy:
    | {
        people: number;
        payments: number;
        by_rule: number;
        by_ai: number;
        corrected: number;
        needs_review: number;
      }
    | Suppressed;
  forecast: { people: number; better: number; median_improvement_pct: number } | Suppressed;
};

/* ------------------------------------------------------------------------------------------ */
/* Percentile                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/**
 * The p-th percentile (p from 0 to 1) of finite values, with linear interpolation between
 * neighbours (the same method as Postgres percentile_cont, via the shared `percentile`). Unlike
 * that one, empty input gives null: "no requests" must not read as "0 ms".
 */
export function percentileOrNull(values: readonly number[], p: number): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length === 0 ? null : percentile(finite, p);
}

/* ------------------------------------------------------------------------------------------ */
/* Status rules                                                                               */
/* ------------------------------------------------------------------------------------------ */

export type Status = "ok" | "watch" | "problem" | "unknown";
export type MetricId = "responding" | "ai_available" | "safety" | "accuracy" | "forecast" | "cost";

/**
 * Thresholds, deliberately conservative: it is better to say "watch" late than to cry wolf. Each
 * metric needs a minimum sample, and below it the status is "unknown" so a handful of requests can
 * never raise an alert. They are starting points to be tuned against real traffic.
 *
 * - responding: slowest 5% of requests (p95). The coach streams a whole answer from a reasoning
 *   model, so tens of seconds are normal for it; ok up to 20 s, watch up to 40 s, problem beyond.
 * - ai_available: share of requests the AI answered itself (not a template or an error): ok from
 *   95%, watch from 85%.
 * - safety: share of checked requests where a validator stopped the model's output. Some stops are
 *   healthy (the voice check refuses unclear sentences: 2 of 24 on the holdout set, about 8%), a
 *   jump means the model or a prompt drifted: ok up to 20%, watch up to 40%.
 * - accuracy: share of spending payments filed by a person's saved correction. The categorizer's
 *   golden set is 94%, and corrections spread to later payments of the same shop, so ok up to 12%,
 *   watch up to 25%.
 * - forecast: how much lower the forecast's error is than the seasonal-naive baseline over the
 *   last 30 days, median across people: ok from 10%, watch from 0%, below 0 the baseline wins.
 * - cost: estimated US dollars per active person per month, against a budget guard rail we chose:
 *   ok up to $0.10, watch up to $0.30.
 */
export const HEALTH_RULES = {
  responding: { okMaxMs: 20_000, watchMaxMs: 40_000, minCalls: 20 },
  ai_available: { okMinPct: 95, watchMinPct: 85, minCalls: 20 },
  safety: { okMaxPct: 20, watchMaxPct: 40, minChecked: 20 },
  accuracy: { okMaxCorrectedPct: 12, watchMaxCorrectedPct: 25, minPayments: 50 },
  forecast: { okMinPct: 10, watchMinPct: 0, minPeople: 5 },
  cost: { okMaxUsd: 0.1, watchMaxUsd: 0.3, minCalls: 30, minPeople: 5 },
} as const;

export const MONTH_HOURS = 720;

export type Metric = {
  id: MetricId;
  status: Status;
  /** the one big number; null when there is not enough data */
  value: number | null;
  /** how many requests, payments or people it is based on */
  sample: number;
  /** supporting numbers the sentence needs (all computed here, none from a model) */
  extra: Record<string, number | null>;
  /** true when the figure was hidden because too few people stand behind it */
  hidden?: boolean;
};

const unknown = (id: MetricId, sample: number, hidden = false): Metric => ({
  id,
  status: "unknown",
  value: null,
  sample,
  extra: {},
  ...(hidden ? { hidden: true } : {}),
});

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Estimated dollars per active person per month, or null when it cannot be stated honestly. */
export function costPerActiveUserMonth(snapshot: HealthSnapshot): number | null {
  if ("suppressed" in snapshot.active_users) return null;
  const people = snapshot.active_users.people;
  if (people <= 0 || snapshot.hours <= 0) return null;
  const { usd } = estimateCostUsd(snapshot.models);
  return (usd * (MONTH_HOURS / snapshot.hours)) / people;
}

export function evaluateHealth(snapshot: HealthSnapshot): { overall: Status; metrics: Metric[] } {
  const o = snapshot.overall;
  const metrics: Metric[] = [];

  // 1. responding
  {
    const r = HEALTH_RULES.responding;
    if (o.calls < r.minCalls || o.p50_ms === null || o.p95_ms === null) {
      metrics.push(unknown("responding", o.calls));
    } else {
      metrics.push({
        id: "responding",
        status: o.p95_ms <= r.okMaxMs ? "ok" : o.p95_ms <= r.watchMaxMs ? "watch" : "problem",
        value: o.p50_ms,
        sample: o.calls,
        extra: { p95_ms: o.p95_ms },
      });
    }
  }

  // 2. ai_available
  {
    const r = HEALTH_RULES.ai_available;
    if (o.calls < r.minCalls) {
      metrics.push(unknown("ai_available", o.calls));
    } else {
      const unavailable = Math.min(o.calls, o.errors + o.fallbacks);
      const answered = pct(o.calls - unavailable, o.calls);
      metrics.push({
        id: "ai_available",
        status: answered >= r.okMinPct ? "ok" : answered >= r.watchMinPct ? "watch" : "problem",
        value: answered,
        sample: o.calls,
        extra: { unavailable, fallbacks: o.fallbacks, errors: o.errors },
      });
    }
  }

  // 3. safety checks
  {
    const r = HEALTH_RULES.safety;
    if (o.checked < r.minChecked) {
      metrics.push(unknown("safety", o.checked));
    } else {
      const stopped = pct(o.stopped, o.checked);
      metrics.push({
        id: "safety",
        status: stopped <= r.okMaxPct ? "ok" : stopped <= r.watchMaxPct ? "watch" : "problem",
        value: stopped,
        sample: o.checked,
        extra: { stopped: o.stopped, checked: o.checked },
      });
    }
  }

  // 4. accuracy
  {
    const r = HEALTH_RULES.accuracy;
    const a = snapshot.accuracy;
    if ("suppressed" in a) {
      metrics.push(unknown("accuracy", 0, true));
    } else if (a.payments < r.minPayments) {
      metrics.push(unknown("accuracy", a.payments));
    } else {
      const corrected = pct(a.corrected, a.payments);
      metrics.push({
        id: "accuracy",
        status:
          corrected <= r.okMaxCorrectedPct
            ? "ok"
            : corrected <= r.watchMaxCorrectedPct
              ? "watch"
              : "problem",
        // the big number is the share left as filed
        value: 100 - corrected,
        sample: a.payments,
        extra: {
          by_rule_pct: pct(a.by_rule, a.payments),
          by_ai_pct: pct(a.by_ai, a.payments),
          corrected_pct: corrected,
          review_pct: pct(a.needs_review, a.payments),
          people: a.people,
        },
      });
    }
  }

  // 5. forecast
  {
    const r = HEALTH_RULES.forecast;
    const f = snapshot.forecast;
    if ("suppressed" in f) {
      metrics.push(unknown("forecast", 0, true));
    } else if (f.people < r.minPeople) {
      metrics.push(unknown("forecast", f.people));
    } else {
      const m = f.median_improvement_pct;
      metrics.push({
        id: "forecast",
        status: m >= r.okMinPct ? "ok" : m >= r.watchMinPct ? "watch" : "problem",
        value: m,
        sample: f.people,
        extra: { better_pct: pct(f.better, f.people) },
      });
    }
  }

  // 6. cost
  {
    const r = HEALTH_RULES.cost;
    const perUser = costPerActiveUserMonth(snapshot);
    if ("suppressed" in snapshot.active_users) {
      metrics.push(unknown("cost", o.calls, true));
    } else if (
      o.calls < r.minCalls ||
      snapshot.active_users.people < r.minPeople ||
      perUser === null
    ) {
      metrics.push(unknown("cost", o.calls));
    } else {
      metrics.push({
        id: "cost",
        status: perUser <= r.okMaxUsd ? "ok" : perUser <= r.watchMaxUsd ? "watch" : "problem",
        value: perUser,
        sample: o.calls,
        extra: {
          people: snapshot.active_users.people,
          unpriced: estimateCostUsd(snapshot.models).unpriced.length,
        },
      });
    }
  }

  const statuses = metrics.map((m) => m.status);
  const overall: Status = statuses.includes("problem")
    ? "problem"
    : statuses.includes("watch")
      ? "watch"
      : statuses.includes("ok")
        ? "ok"
        : "unknown";
  return { overall, metrics };
}

/* ------------------------------------------------------------------------------------------ */
/* Summarising raw events (used for the simulated traffic; the database does the same in SQL)  */
/* ------------------------------------------------------------------------------------------ */

export type ModelEvent = {
  at: number;
  function_name: string;
  status: "ok" | "error";
  latency_ms: number;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  fallback_used: boolean;
  reason_code: string | null;
};

const isChecked = (e: ModelEvent) =>
  e.status === "ok" && (CHECKED_FUNCTIONS as readonly string[]).includes(e.function_name);
const isStopped = (e: ModelEvent) => isChecked(e) && (e.reason_code ?? "").startsWith("check_");

function totals(events: readonly ModelEvent[]): Totals {
  const latencies = events.map((e) => e.latency_ms);
  const p50 = percentileOrNull(latencies, 0.5);
  const p95 = percentileOrNull(latencies, 0.95);
  return {
    calls: events.length,
    errors: events.filter((e) => e.status === "error").length,
    fallbacks: events.filter((e) => e.fallback_used).length,
    checked: events.filter(isChecked).length,
    stopped: events.filter(isStopped).length,
    p50_ms: p50 === null ? null : Math.round(p50),
    p95_ms: p95 === null ? null : Math.round(p95),
  };
}

/** The same shape system_health() returns, built from raw events. */
export function summarizeEvents(
  events: readonly ModelEvent[],
  hours: number,
  now: number,
  extras: Pick<HealthSnapshot, "active_users" | "accuracy" | "forecast">,
): HealthSnapshot {
  const hourMs = 3_600_000;
  const since = now - hours * hourMs;
  const inWindow = events.filter((e) => e.at >= since && e.at <= now);
  const bucketHours = Math.max(1, Math.round(hours / 28));
  const n = Math.ceil(hours / bucketHours);

  const series: SeriesPoint[] = [];
  for (let b = n - 1; b >= 0; b--) {
    const start = now - (b + 1) * bucketHours * hourMs;
    const end = start + bucketHours * hourMs;
    const inBucket = inWindow.filter((e) => e.at >= start && e.at < end);
    const t = totals(inBucket);
    const tokens: Record<string, [number, number]> = {};
    for (const e of inBucket) {
      if (!e.model) continue;
      const cur = (tokens[e.model] ??= [0, 0]);
      cur[0] += e.tokens_in ?? 0;
      cur[1] += e.tokens_out ?? 0;
    }
    series.push({
      t: new Date(start).toISOString(),
      calls: t.calls,
      errors: t.errors,
      fallbacks: t.fallbacks,
      checked: t.checked,
      stopped: t.stopped,
      p95_ms: t.p95_ms,
      tokens,
    });
  }

  const byFunction = new Map<string, ModelEvent[]>();
  const byModel = new Map<string, ModelTotals>();
  for (const e of inWindow) {
    byFunction.set(e.function_name, [...(byFunction.get(e.function_name) ?? []), e]);
    if (!e.model) continue;
    const m = byModel.get(e.model) ?? { model: e.model, calls: 0, tokens_in: 0, tokens_out: 0 };
    m.calls += 1;
    m.tokens_in += e.tokens_in ?? 0;
    m.tokens_out += e.tokens_out ?? 0;
    byModel.set(e.model, m);
  }

  return {
    hours,
    bucket_hours: bucketHours,
    generated_at: new Date(now).toISOString(),
    min_group_size: 5,
    overall: totals(inWindow),
    functions: [...byFunction.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([function_name, list]) => {
        const t = totals(list);
        return {
          function_name,
          calls: t.calls,
          errors: t.errors,
          fallbacks: t.fallbacks,
          p50_ms: t.p50_ms,
          p95_ms: t.p95_ms,
        };
      }),
    series,
    models: [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model)),
    ...extras,
  };
}
