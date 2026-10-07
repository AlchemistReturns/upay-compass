import { addDays, dayDiff, dhakaDay } from "../dates.ts";
import { groupKey, type FlowTx } from "../recurring.ts";

/**
 * Per-day everyday flows from `firstDay` to `today` (inclusive), zero-filled. Recurring payments
 * (by `recurringKeys`) are left out, so the series is the part a forecaster has to guess.
 */
export function dailyFlowSeries(
  txs: FlowTx[],
  firstDay: string,
  today: string,
  recurringKeys: Set<string>,
): { days: string[]; spend: number[]; income: number[] } {
  const n = dayDiff(firstDay, today) + 1;
  const days = Array.from({ length: n }, (_, i) => addDays(firstDay, i));
  const spend = new Array<number>(n).fill(0);
  const income = new Array<number>(n).fill(0);
  for (const t of txs) {
    if (recurringKeys.has(groupKey(t))) continue;
    const i = dayDiff(firstDay, dhakaDay(t.occurred_at));
    if (i < 0 || i >= n) continue;
    if (t.direction === "out") spend[i]! += t.amount;
    else income[i]! += t.amount;
  }
  return { days, spend, income };
}
