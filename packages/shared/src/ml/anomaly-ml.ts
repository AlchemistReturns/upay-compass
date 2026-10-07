import {
  ANOMALY_LOOKBACK_DAYS,
  type Anomaly,
  type AnomalyTx,
  detectAnomalies,
} from "../anomaly.ts";
import { normalizeKeyword } from "../categorize.ts";
import { dayDiff, dhakaDay, weekdayOf } from "../dates.ts";
import { detectRecurring, groupKey, median } from "../recurring.ts";
import { fitIsolationForest, isolationScore } from "./isolation-forest.ts";

/** Categories that are never flagged, as in the statistical detector. */
const EXEMPT = new Set(["savings", "income"]);
const MIN_HISTORY = 25;
const MIN_BUCKET = 3;
const lg = (n: number) => Math.log1p(Math.max(0, n));

export const ANOMALY_FEATURE_NAMES = [
  "amount",
  "vs_merchant",
  "vs_category_weekday",
  "hour",
  "days_since_merchant",
  "vs_daily_spend",
  "new_merchant",
] as const;

/** Readable words for the features, used when the model explains a flag. */
export const ANOMALY_FEATURE_LABELS: Record<(typeof ANOMALY_FEATURE_NAMES)[number], string> = {
  amount: "a large amount",
  vs_merchant: "far above your usual payment to this merchant",
  vs_category_weekday: "far above what you usually spend in this category on this weekday",
  hour: "an unusual time of day",
  days_since_merchant: "a long gap since you last paid this merchant",
  vs_daily_spend: "large compared with your daily spending",
  new_merchant: "a merchant you have not paid before",
};

type Prepared = {
  sorted: AnomalyTx[];
  days: string[];
  hours: number[];
};

function prepare(txs: AnomalyTx[]): Prepared {
  const sorted = [...txs].sort(
    (a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id),
  );
  const days = sorted.map((t) => dhakaDay(t.occurred_at));
  // Bangladesh is UTC+6.
  const hours = sorted.map((t) => (new Date(t.occurred_at).getUTCHours() + 6) % 24);
  return { sorted, days, hours };
}

/** Features of payment `i`, computed only from what came before it (and from itself). */
export function anomalyFeatures(p: Prepared, i: number): number[] {
  const { sorted, days, hours } = p;
  const t = sorted[i]!;
  const merchant = normalizeKeyword(t.counterparty);
  const sameMerchant: number[] = [];
  const sameBucket: number[] = [];
  const sameCategory: number[] = [];
  let lastMerchantDay: string | null = null;
  let spent = 0;
  for (let j = 0; j < i; j++) {
    const age = dayDiff(days[j]!, days[i]!);
    if (age > ANOMALY_LOOKBACK_DAYS) continue;
    const o = sorted[j]!;
    if (o.direction !== "out") continue;
    if (age <= 28) spent += o.amount;
    if (normalizeKeyword(o.counterparty) === merchant) {
      sameMerchant.push(o.amount);
      lastMerchantDay = days[j]!;
    }
    if (o.category === t.category) {
      sameCategory.push(o.amount);
      if (weekdayOf(days[j]!) === weekdayOf(days[i]!)) sameBucket.push(o.amount);
    }
  }
  const catMedian = sameCategory.length ? median(sameCategory) : 0;
  const merchantRef = sameMerchant.length >= MIN_BUCKET ? median(sameMerchant) : catMedian;
  const bucketRef = sameBucket.length >= MIN_BUCKET ? median(sameBucket) : catMedian;
  const dailySpend = spent / 28;
  return [
    lg(t.amount),
    merchantRef > 0 ? lg(t.amount) - lg(merchantRef) : 0,
    bucketRef > 0 ? lg(t.amount) - lg(bucketRef) : 0,
    hours[i]! / 24,
    lastMerchantDay === null ? lg(ANOMALY_LOOKBACK_DAYS) : lg(dayDiff(lastMerchantDay, days[i]!)),
    dailySpend > 0 ? lg(t.amount) - lg(dailySpend) : 0,
    sameMerchant.length === 0 ? 1 : 0,
  ];
}

export type ModelAnomaly = {
  txId: string;
  category: string;
  amount: number;
  /** Isolation score, 0 to 1; higher is more unusual. */
  score: number;
  /**
   * How far the score is above what this person's own earlier payments score (their 99th
   * percentile). Above 0 means more unusual than 99% of their usual payments.
   */
  excess: number;
  /** The two features that stand out most, as readable phrases. */
  reasons: string[];
};

export type MlDetectOptions = {
  /** Only payments on or after this Bangladesh day are candidates. */
  candidateFrom: string;
  /** Isolation score at or above which a payment is flagged. */
  threshold?: number;
  seed?: number;
};

/** Default flag level, chosen on the "dev" simulated people (see ML_REPORT.md). */
export const ANOMALY_SCORE_THRESHOLD = 0.62;

/**
 * Scores the candidate payments with an isolation forest fitted to this person's own earlier
 * payments. Returns every candidate with its score, flagged or not, so callers can combine it
 * with other evidence. Declines (returns an empty list) with less than 25 earlier payments.
 */
export function scoreAnomalies(
  txs: AnomalyTx[],
  options: MlDetectOptions,
  now: Date,
): ModelAnomaly[] {
  const p = prepare(txs);
  const recurring = new Set(detectRecurring(p.sorted, now).map((r) => r.key));
  const eligible = (i: number) => {
    const t = p.sorted[i]!;
    return (
      t.direction === "out" &&
      !!t.category &&
      !EXEMPT.has(t.category) &&
      !recurring.has(groupKey(t))
    );
  };

  const firstCandidate = p.days.findIndex((d) => d >= options.candidateFrom);
  if (firstCandidate < 0) return [];
  const trainRows: number[][] = [];
  for (let i = 0; i < firstCandidate; i++) {
    if (!eligible(i)) continue;
    if (dayDiff(p.days[i]!, options.candidateFrom) > ANOMALY_LOOKBACK_DAYS) continue;
    trainRows.push(anomalyFeatures(p, i));
  }
  if (trainRows.length < MIN_HISTORY) return [];
  const forest = fitIsolationForest(trainRows, { seed: options.seed ?? 1 });
  if (!forest) return [];

  const trainScores = trainRows.map((r) => isolationScore(forest, r)).sort((a, b) => a - b);
  const ref = trainScores[Math.min(trainScores.length - 1, Math.floor(trainScores.length * 0.99))]!;

  // Typical value and spread of each feature in the training rows, to say which one stands out.
  const dims = ANOMALY_FEATURE_NAMES.length;
  const mid = Array.from({ length: dims }, (_, d) => median(trainRows.map((r) => r[d]!)));
  const spread = Array.from({ length: dims }, (_, d) =>
    Math.max(1e-6, median(trainRows.map((r) => Math.abs(r[d]! - mid[d]!))) * 1.4826),
  );

  const out: ModelAnomaly[] = [];
  for (let i = firstCandidate; i < p.sorted.length; i++) {
    if (!eligible(i)) continue;
    const x = anomalyFeatures(p, i);
    const t = p.sorted[i]!;
    const standOut = ANOMALY_FEATURE_NAMES.map((name, d) => ({
      name,
      // only "more than usual" counts as a reason, except for the time of day
      z: name === "hour" ? Math.abs(x[d]! - mid[d]!) / spread[d]! : (x[d]! - mid[d]!) / spread[d]!,
    }))
      .filter((f) => f.z > 2)
      .sort((a, b) => b.z - a.z)
      .slice(0, 2)
      .map((f) => ANOMALY_FEATURE_LABELS[f.name]);
    out.push({
      txId: t.id,
      category: t.category!,
      amount: t.amount,
      score: isolationScore(forest, x),
      excess: isolationScore(forest, x) - ref,
      reasons: standOut,
    });
  }
  return out;
}

export type CombinedAnomaly = {
  txId: string;
  /** What the statistical rule said, when it flagged the payment. */
  rule: Anomaly | null;
  /** The model's score and reasons for it. */
  model: ModelAnomaly | null;
};

/**
 * The statistical rule's flags, plus payments the model scores very high that the rule did not
 * flag. The rule keeps its explanation ("about 3 times your usual"); the model adds its score.
 */
export function detectAnomaliesCombined(
  txs: AnomalyTx[],
  options: MlDetectOptions,
  now: Date,
): CombinedAnomaly[] {
  const rule = detectAnomalies(txs, { candidateFrom: options.candidateFrom }, now);
  const byTx = new Map(rule.map((a) => [a.txId, a]));
  const threshold = options.threshold ?? ANOMALY_SCORE_THRESHOLD;
  const scores = scoreAnomalies(txs, options, now);
  const out: CombinedAnomaly[] = [];
  const seen = new Set<string>();
  for (const s of scores) {
    const r = byTx.get(s.txId) ?? null;
    if (r || s.score >= threshold) {
      out.push({ txId: s.txId, rule: r, model: s });
      seen.add(s.txId);
    }
  }
  for (const a of rule) if (!seen.has(a.txId)) out.push({ txId: a.txId, rule: a, model: null });
  return out;
}
