import { addDays, weekdayOf } from "../dates.ts";
import { median } from "../recurring.ts";
import { SCALE_DAYS } from "./features.ts";
import type { SpendPredictor, SpendPredictorInput } from "./types.ts";

/** Average everyday income of each weekday over the last 8 weeks, for each of the next days. */
export function weekdayMeanIncome(input: SpendPredictorInput): number[] {
  const n = input.days.length;
  const from = Math.max(0, n - SCALE_DAYS);
  const sum = new Array<number>(7).fill(0);
  const count = new Array<number>(7).fill(0);
  for (let i = from; i < n; i++) {
    const w = weekdayOf(input.days[i]!);
    sum[w]! += input.income[i]!;
    count[w]!++;
  }
  return Array.from({ length: input.horizon }, (_, i) => {
    const w = weekdayOf(addDays(input.today, i + 1));
    return count[w]! > 0 ? sum[w]! / count[w]! : 0;
  });
}

/** Standard deviation of daily everyday income over the last 8 weeks, taka. */
export function dailyIncomeStd(input: SpendPredictorInput): number {
  const v = input.income.slice(-SCALE_DAYS);
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

/**
 * The current heuristic as a predictor: the median spend of each weekday over the last 8 weeks.
 * Used as a member of the ensemble and as the benchmark every model has to beat.
 */
export const weekdayMedianPredictor: SpendPredictor = (input) => {
  const n = input.days.length;
  if (n === 0) return null;
  const from = Math.max(0, n - SCALE_DAYS);
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (let i = from; i < n; i++) buckets[weekdayOf(input.days[i]!)]!.push(input.spend[i]!);
  const med = buckets.map((b) => (b.length ? median(b) : 0));
  const spend = Array.from(
    { length: input.horizon },
    (_, i) => med[weekdayOf(addDays(input.today, i + 1))]!,
  );
  return { spend, method: "weekday_median" };
};
