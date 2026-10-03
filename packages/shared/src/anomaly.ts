import { normalizeKeyword } from "./categorize.ts";
import { dayDiff, dhakaDay, weekdayOf } from "./dates.ts";
import { detectRecurring, groupKey, median, type FlowTx } from "./recurring.ts";

/**
 * Unusual-payment detection (statistics, no model). A payment is flagged when it is far above what
 * this user normally pays in the same category on the same day of the week.
 *
 *  1. Robust z-score against the closest relevant history. Take the user's earlier payments from
 *     the trailing 90 days: first those to the same merchant, and if there are fewer than 5 of
 *     those, those in the same (category, weekday) bucket. (Comparing with the merchant first came
 *     out of the evaluation: a category such as "food" mixes a Rs 100 canteen lunch with a Rs 400
 *     delivery order, so a category bucket alone rang the alarm on every delivery order and
 *     stayed quiet about a Rs 1,100 canteen lunch on a day with a weekly grocery shop.) With at
 *     least 5 payments in the bucket, compute the median and the MAD (median absolute deviation). The modified z-score is z = 0.6745 * (amount - median) / MAD, written here as
 *     (amount - median) / scale with scale = 1.4826 * MAD (the same number, since 0.6745 = 1/1.4826).
 *     Flag z > 3.5 (the Iglewicz-Hoaglin threshold). The scale has a floor of Rs 20 so a bucket
 *     where the user always pays almost exactly the same amount cannot blow up.
 *  2. Sparse history (fewer than 5 earlier payments in either bucket): flag a first-time counterparty whose amount is
 *     more than twice the category median and at least Rs 300 above it (needs 3 earlier payments in
 *     the category to have a median at all). New or rare categories are blind spots for rule 1.
 *
 * Only upward outliers are flagged: an unusually small payment is not something to warn about.
 * Money in, transfers into savings and recurring payments (rent, bills, subscriptions) are never
 * flagged; they are expected.
 */
export const ANOMALY_LOOKBACK_DAYS = 90;
export const MIN_BUCKET_OBSERVATIONS = 5;
export const MAD_TO_SIGMA = 1.4826;
export const MIN_SCALE = 20;
export const Z_THRESHOLD = 3.5;
export const NEW_COUNTERPARTY_FACTOR = 2;
export const NEW_COUNTERPARTY_MIN_EXTRA = 300;
export const MIN_CATEGORY_OBSERVATIONS = 3;
/** Categories that are never flagged. */
const EXEMPT_CATEGORIES = new Set(["savings", "income"]);

export type AnomalyTx = FlowTx & {
  id: string;
  /** Category key (for example "food"); null when unknown. */
  category: string | null;
};

export type AnomalyRule = "robust_z" | "new_counterparty";

/** Which history a payment was compared with. */
export type AnomalyBucket = "merchant" | "category_weekday" | "category";

export type Anomaly = {
  txId: string;
  category: string;
  amount: number;
  /** What it was compared with. */
  bucket: AnomalyBucket;
  /** The usual amount it is compared with (bucket median, or category median for the second rule). */
  typical: number;
  /** Modified z-score for rule 1; null for the sparse-bucket rule. */
  z: number | null;
  rule: AnomalyRule;
  /** Earlier payments the comparison was based on. */
  observations: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The robust scale of a bucket: 1.4826 x MAD, never below the floor. */
export function robustScale(values: number[]): { median: number; mad: number; scale: number } {
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  return { median: med, mad, scale: Math.max(MAD_TO_SIGMA * mad, MIN_SCALE) };
}

/** Modified z-score of `amount` against a bucket of earlier amounts. */
export function modifiedZ(amount: number, bucket: number[]): { z: number; median: number } {
  const { median: med, scale } = robustScale(bucket);
  return { z: (amount - med) / scale, median: med };
}

export type DetectOptions = {
  /** Only payments on or after this Bangladesh day ("YYYY-MM-DD") are candidates. */
  candidateFrom: string;
  /**
   * "merchant_first" (default): compare with the same merchant when there is enough history, else
   * with the (category, weekday) bucket. "category_weekday": the category bucket only (kept so the
   * evaluation can show what the merchant comparison adds).
   */
  bucketing?: "merchant_first" | "category_weekday";
};

/** Flags the unusual payments among `txs` that happened on or after `candidateFrom`. */
export function detectAnomalies(txs: AnomalyTx[], options: DetectOptions, now: Date): Anomaly[] {
  const sorted = [...txs].sort(
    (a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id),
  );
  const recurring = new Set(detectRecurring(sorted, now).map((r) => r.key));
  const days = sorted.map((t) => dhakaDay(t.occurred_at));

  const out: Anomaly[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (days[i]! < options.candidateFrom) continue;
    if (t.direction !== "out" || !t.category || EXEMPT_CATEGORIES.has(t.category)) continue;
    if (recurring.has(groupKey(t))) continue;

    // Everything this user did earlier, within the trailing window.
    const prior: number[] = [];
    for (let j = 0; j < i; j++) {
      if (dayDiff(days[j]!, days[i]!) <= ANOMALY_LOOKBACK_DAYS) prior.push(j);
    }
    const sameCategory = prior.filter(
      (j) => sorted[j]!.direction === "out" && sorted[j]!.category === t.category,
    );
    const bucket = sameCategory.filter((j) => weekdayOf(days[j]!) === weekdayOf(days[i]!));

    const merchant =
      options.bucketing === "category_weekday"
        ? []
        : prior.filter(
            (j) =>
              sorted[j]!.direction === "out" &&
              normalizeKeyword(sorted[j]!.counterparty) === normalizeKeyword(t.counterparty),
          );
    const chosen =
      merchant.length >= MIN_BUCKET_OBSERVATIONS
        ? { idx: merchant, bucket: "merchant" as const }
        : bucket.length >= MIN_BUCKET_OBSERVATIONS
          ? { idx: bucket, bucket: "category_weekday" as const }
          : null;

    if (chosen) {
      const { z, median: med } = modifiedZ(
        t.amount,
        chosen.idx.map((j) => sorted[j]!.amount),
      );
      if (z > Z_THRESHOLD) {
        out.push({
          txId: t.id,
          category: t.category,
          amount: t.amount,
          bucket: chosen.bucket,
          typical: round2(med),
          z: round1(z),
          rule: "robust_z",
          observations: chosen.idx.length,
        });
      }
      continue; // there was enough history to decide
    }

    // Sparse bucket: a first-time counterparty paying far more than the category usually costs.
    const known = new Set(prior.map((j) => normalizeKeyword(sorted[j]!.counterparty)));
    const firstTime = !known.has(normalizeKeyword(t.counterparty));
    if (firstTime && sameCategory.length >= MIN_CATEGORY_OBSERVATIONS) {
      const med = median(sameCategory.map((j) => sorted[j]!.amount));
      if (
        t.amount > NEW_COUNTERPARTY_FACTOR * med &&
        t.amount - med >= NEW_COUNTERPARTY_MIN_EXTRA
      ) {
        out.push({
          txId: t.id,
          category: t.category,
          amount: t.amount,
          bucket: "category",
          typical: round2(med),
          z: null,
          rule: "new_counterparty",
          observations: sameCategory.length,
        });
      }
    }
  }
  return out;
}
