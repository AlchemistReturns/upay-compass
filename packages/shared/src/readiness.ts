import { addMonths, dayDiff, dhakaDay, parseDay } from "./dates.ts";
import {
  NEUTRAL_SCORE,
  budgetComponent,
  stabilityComponent,
  type Component,
  type HealthInputs,
} from "./health.ts";
import { detectRecurring, groupKey, median, type FlowTx } from "./recurring.ts";

/**
 * Responsible credit readiness (0-100). INFORMATIONAL ONLY: it is not a credit decision, is not
 * shared with any lender and does not touch the upay account. Like the health score it is a pure,
 * explainable function: every number the UI shows comes from here, never from a language model.
 *
 * Four components, each normalized to 0-100 first:
 *   income consistency 30%   same measure as the health score's income stability
 *   bill punctuality   30%   recurring bills against the date the detector expects them
 *   savings consistency 25%  months with any goal contribution or round-up
 *   budget adherence   15%   same measure as the health score's budget adherence
 */
export const READINESS_WEIGHTS = {
  income: 0.3,
  punctuality: 0.3,
  savings: 0.25,
  budget: 0.15,
} as const;
export type ReadinessKey = keyof typeof READINESS_WEIGHTS;
export const READINESS_KEYS = Object.keys(READINESS_WEIGHTS) as ReadinessKey[];

/** A bill paid within this many days of its expected date counts as on time. */
export const ON_TIME_DAYS = 1;
/** Paid this many days off its expected date (or more) earns zero for that payment. */
export const LATE_ZERO_DAYS = 7;
/** Savings consistency looks at the last six calendar months. */
export const SAVINGS_WINDOW_MONTHS = 6;
/** Fewer observed months than this and savings consistency counts as neutral. */
export const MIN_OBSERVED_MONTHS = 2;

const MIN_TRANSACTIONS = 15;
const MIN_HISTORY_DAYS = 28;

export type ReadinessComponent = Component & {
  /** The quantities behind the score, for the explanation sentence (counts, never text). */
  detail: Record<string, number>;
};

export type ReadinessInputs = {
  txCount: number;
  historyDays: number;
  /** Income per 30-day bucket, newest first (same as the health score). */
  incomeBuckets: number[];
  /** This month's budgets with spending so far (same as the health score). */
  budgets: HealthInputs["budgets"];
  /** Recent transactions (the forecaster's 120-day window), to find the recurring bills. */
  transactions: FlowTx[];
  now: Date;
  /** Calendar months ("YYYY-MM"), newest first, up to six, with whether any saving happened. */
  savingsMonths: { month: string; active: boolean }[];
  /** The day of the user's earliest transaction ("YYYY-MM-DD"), or null with no history. */
  firstDay: string | null;
};

export type ReadinessResult = {
  score: number;
  confidence: "low" | "ok";
  components: Record<ReadinessKey, ReadinessComponent>;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const unavailable = (
  key: ReadinessKey,
  detail: Record<string, number> = {},
): ReadinessComponent => ({
  score: NEUTRAL_SCORE,
  weight: READINESS_WEIGHTS[key],
  available: false,
  raw: null,
  detail,
});

/** One payment: 100 when on time, falling in a straight line to 0 at LATE_ZERO_DAYS off. */
export function paymentScore(daysOff: number): number {
  if (daysOff <= ON_TIME_DAYS) return 100;
  return clamp01(1 - (daysOff - ON_TIME_DAYS) / (LATE_ZERO_DAYS - ON_TIME_DAYS)) * 100;
}

/** The days a recurring payment actually happened (several payments on one day count once). */
function occurrenceDays(txs: FlowTx[], key: string): string[] {
  const days = new Set<string>();
  for (const tx of txs) if (groupKey(tx) === key) days.add(dhakaDay(tx.occurred_at));
  return [...days].sort();
}

/**
 * How far each occurrence is from where the schedule says it should be.
 * Monthly: the usual day of the month (the median) in the nearest month.
 * Weekly and fortnightly: the usual rhythm, anchored on the occurrence the others fit best.
 */
export function daysOffSchedule(
  cadence: "weekly" | "biweekly" | "monthly",
  days: string[],
): number[] {
  if (cadence === "monthly") {
    const usual = median(days.map((d) => parseDay(d).getUTCDate()));
    return days.map((d) =>
      Math.min(...[-1, 0, 1].map((k) => Math.abs(dayDiff(d, addMonths(d, k, Math.round(usual)))))),
    );
  }
  const step = cadence === "weekly" ? 7 : 14;
  // Anchor the rhythm on whichever occurrence makes the others fit best, so one late payment
  // cannot make every other payment look late.
  const offFrom = (anchor: string) =>
    days.map((d) => {
      const r = ((dayDiff(anchor, d) % step) + step) % step;
      return Math.min(r, step - r);
    });
  let best = offFrom(days[0]!);
  for (const anchor of days.slice(1)) {
    const candidate = offFrom(anchor);
    if (sum(candidate) < sum(best)) best = candidate;
  }
  return best;
}

function punctualityComponent(txs: FlowTx[], now: Date): ReadinessComponent {
  // Bills: recurring payments out that repeat monthly, or go through the bill channel.
  const bills = detectRecurring(txs, now).filter(
    (r) => r.direction === "out" && (r.cadence === "monthly" || r.channel === "bill"),
  );
  const scores: number[] = [];
  let onTime = 0;
  for (const bill of bills) {
    const off = daysOffSchedule(bill.cadence, occurrenceDays(txs, bill.key));
    for (const d of off) {
      scores.push(paymentScore(d));
      if (d <= ON_TIME_DAYS) onTime++;
    }
  }
  if (scores.length === 0) return unavailable("punctuality");
  return {
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    weight: READINESS_WEIGHTS.punctuality,
    available: true,
    raw: onTime / scores.length,
    detail: { bills: bills.length, payments: scores.length, onTime },
  };
}

function savingsComponent(
  months: ReadinessInputs["savingsMonths"],
  firstDay: string | null,
): ReadinessComponent {
  // Only months the user was around for count; the current, part-finished month counts too.
  const observed = firstDay
    ? months.slice(0, SAVINGS_WINDOW_MONTHS).filter((m) => m.month >= firstDay.slice(0, 7))
    : [];
  const active = observed.filter((m) => m.active).length;
  if (observed.length < MIN_OBSERVED_MONTHS) {
    return unavailable("savings", { observed: observed.length, active });
  }
  return {
    score: (active / observed.length) * 100,
    weight: READINESS_WEIGHTS.savings,
    available: true,
    raw: active,
    detail: { observed: observed.length, active },
  };
}

const withDetail = (
  c: Component,
  key: ReadinessKey,
  detail: Record<string, number> = {},
): ReadinessComponent => ({
  ...c,
  weight: READINESS_WEIGHTS[key],
  detail,
});

export function computeReadiness(i: ReadinessInputs): ReadinessResult {
  const income = stabilityComponent({ incomeBuckets: i.incomeBuckets });
  const budget = budgetComponent({ budgets: i.budgets });
  const components: Record<ReadinessKey, ReadinessComponent> = {
    income: withDetail(income, "income"),
    punctuality: punctualityComponent(i.transactions, i.now),
    savings: savingsComponent(i.savingsMonths, i.firstDay),
    budget: withDetail(budget, "budget", { budgets: i.budgets.length }),
  };

  const score = Math.round(
    READINESS_KEYS.reduce((sum, k) => sum + components[k].weight * components[k].score, 0),
  );
  const measured = READINESS_KEYS.filter((k) => components[k].available).length;

  return {
    score,
    confidence:
      i.txCount < MIN_TRANSACTIONS || i.historyDays < MIN_HISTORY_DAYS || measured < 3
        ? "low"
        : "ok",
    components,
  };
}

/** Raw jsonb from the `savings_activity()` function to the typed pieces of the inputs. */
export function parseSavingsActivity(raw: unknown): {
  firstDay: string | null;
  savingsMonths: ReadinessInputs["savingsMonths"];
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const months = Array.isArray(r.months) ? r.months : [];
  return {
    firstDay: typeof r.first_day === "string" ? r.first_day : null,
    savingsMonths: months.map((m: Record<string, unknown>) => ({
      month: String(m.month),
      active: Boolean(m.active),
    })),
  };
}

export type ReadinessChange = {
  component: ReadinessKey;
  from: number;
  to: number;
  /** Change in points of the total score (score change times weight). */
  points: number;
};

/** "What moved your score": per-component change between two snapshots, biggest movers first. */
export function diffReadiness(prev: ReadinessResult, next: ReadinessResult): ReadinessChange[] {
  return READINESS_KEYS.map((k) => ({
    component: k,
    from: Math.round(prev.components[k].score),
    to: Math.round(next.components[k].score),
    points:
      Math.round(
        next.components[k].weight * (next.components[k].score - prev.components[k].score) * 10,
      ) / 10,
  }))
    .filter((c) => c.from !== c.to)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

/** The last `count` calendar months as "YYYY-MM", newest first, ending with the month of `day`. */
export function lastMonths(day: string, count = SAVINGS_WINDOW_MONTHS): string[] {
  return Array.from({ length: count }, (_, k) => addMonths(day, -k, 1).slice(0, 7));
}
