import {
  addDays,
  categorize,
  dayDiff,
  dhakaDay,
  detectAnomalies,
  generateNudges,
  median,
  mondayOf,
  type AnomalyTx,
} from "@compass/shared";
import { generateTransactions } from "./generate.ts";
import { PERSONAS, type Persona } from "./personas.ts";

/**
 * Golden-set style evaluation of unusual-payment detection, in the spirit of the forecast backtest:
 * inject known anomalies into a copy of the simulated data, then measure how many each method
 * finds and how often each raises an alert on the unmodified data. Compares the statistical
 * detector (`detectAnomalies`) with the old flat rule (a category's week at 2x its usual week and
 * at least Rs 300 more), on exactly the same data. Deterministic.
 */
export const EVAL_SEEDS = ["compass-demo", "seed-a", "seed-b", "seed-c", "seed-d"];
/** Days back from the end of the data at which one anomaly is injected per persona (about monthly). */
export const INJECTION_OFFSETS = [75, 45, 15];
/** Each injected payment is this many times the category's typical single payment. */
export const INJECTION_MULTIPLIERS = [8, 9, 10];
const EVALUATED_DAYS = 90;

export type EvalResult = {
  persona: Persona;
  injected: number;
  /** Shipped detector (merchant first, then category and weekday). */
  statDetected: number;
  /** Category and weekday bucket only, as first specified. */
  catDetected: number;
  flatDetected: number;
  /** Payments evaluated on the unmodified data. */
  cleanPayments: number;
  /** Alerts the shipped detector raises on the unmodified data. */
  statAlerts: number;
  /** Alerts the category-and-weekday-only detector raises on the unmodified data. */
  catAlerts: number;
  /** Alerts the flat rule raises on the unmodified data (one per category per week). */
  flatAlerts: number;
  /** The unmodified data spans this many days of alerts. */
  days: number;
};

function toAnomalyTx(
  txs: ReturnType<typeof generateTransactions>,
): (AnomalyTx & { injected?: boolean })[] {
  return txs.map((t) => ({
    id: t.id,
    direction: t.direction,
    channel: t.channel,
    counterparty: t.counterparty,
    amount: t.amount,
    occurred_at: t.occurred_at,
    category: categorize(t)?.category ?? null,
  }));
}

/** The old rule on one day: category weeks (the last 7 days) against the average week before. */
function flatRuleAlerts(txs: AnomalyTx[], today: string): Set<string> {
  const weekly = new Map<string, { thisWeek: number; prior: number }>();
  for (const t of txs) {
    if (t.direction !== "out" || !t.category) continue;
    const age = dayDiff(dhakaDay(t.occurred_at), today);
    if (age < 0 || age > 62) continue;
    const e = weekly.get(t.category) ?? { thisWeek: 0, prior: 0 };
    if (age <= 6) e.thisWeek += t.amount;
    else e.prior += t.amount;
    weekly.set(t.category, e);
  }
  const nudges = generateNudges({
    today,
    categoryWeekly: [...weekly.keys()].map((category, i) => {
      const v = weekly.get(category)!;
      return {
        categoryId: i,
        thisWeek: Math.round(v.thisWeek),
        avgPriorWeek: Math.round(v.prior / 8),
      };
    }),
    goals: [],
    recurring: [],
    forecast: null,
  });
  const keys = [...weekly.keys()];
  return new Set(nudges.map((n) => `${keys[Number(n.data.category_id)]}:${mondayOf(today)}`));
}

export function evaluateAnomalyDetection(persona: Persona, endDay: string): EvalResult {
  const r: EvalResult = {
    persona,
    injected: 0,
    statDetected: 0,
    catDetected: 0,
    flatDetected: 0,
    cleanPayments: 0,
    statAlerts: 0,
    catAlerts: 0,
    flatAlerts: 0,
    days: EVALUATED_DAYS,
  };
  const now = new Date(`${endDay}T08:00:00Z`);
  const from = addDays(endDay, -(EVALUATED_DAYS - 1));

  for (const seed of EVAL_SEEDS) {
    const clean = toAnomalyTx(generateTransactions({ persona, endDay, days: 120, seed }));

    // False alarms on the unmodified data.
    r.cleanPayments += clean.filter(
      (t) => t.direction === "out" && dhakaDay(t.occurred_at) >= from,
    ).length;
    r.statAlerts += detectAnomalies(clean, { candidateFrom: from }, now).length;
    r.catAlerts += detectAnomalies(
      clean,
      { candidateFrom: from, bucketing: "category_weekday" },
      now,
    ).length;
    const flat = new Set<string>();
    for (let d = 0; d < EVALUATED_DAYS; d++) {
      const day = addDays(from, d);
      const upToDay = clean.filter((t) => dhakaDay(t.occurred_at) <= day);
      for (const k of flatRuleAlerts(upToDay, day)) flat.add(k);
    }
    r.flatAlerts += flat.size;

    // Injected anomalies: a food payment at 8x, 9x, 10x the typical food payment, at a merchant
    // the person already uses. One per persona per month.
    const food = clean.filter((t) => t.direction === "out" && t.category === "food");
    const typical = median(food.map((t) => t.amount));
    const usual = food[Math.floor(food.length / 2)]!;
    INJECTION_OFFSETS.forEach((offset, k) => {
      const day = addDays(endDay, -offset);
      const injected: AnomalyTx = {
        ...usual,
        id: `injected-${seed}-${k}`,
        amount: Math.round(typical * INJECTION_MULTIPLIERS[k]!),
        occurred_at: `${day}T06:00:00Z`,
      };
      const data = [...clean, injected];
      r.injected++;
      const found = detectAnomalies(data, { candidateFrom: day }, now);
      if (found.some((a) => a.txId === injected.id)) r.statDetected++;
      const foundCat = detectAnomalies(
        data,
        { candidateFrom: day, bucketing: "category_weekday" },
        now,
      );
      if (foundCat.some((a) => a.txId === injected.id)) r.catDetected++;
      const upToDay = data.filter((t) => dhakaDay(t.occurred_at) <= day);
      if ([...flatRuleAlerts(upToDay, day)].some((key) => key.startsWith("food:"))) {
        r.flatDetected++;
      }
    });
  }
  return r;
}

export function evaluateAll(endDay: string): EvalResult[] {
  return PERSONAS.map((p) => evaluateAnomalyDetection(p, endDay));
}
