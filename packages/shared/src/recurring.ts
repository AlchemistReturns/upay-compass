import { normalizeKeyword } from "./categorize.ts";
import { addDays, addMonths, dayDiff, dhakaDay, parseDay } from "./dates.ts";
import type { Channel } from "./types.ts";

/** The slice of a transaction the forecaster needs. */
export type FlowTx = {
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  amount: number;
  occurred_at: string;
  /** Essential spending (food, transport, bills...), used to size the safety buffer. */
  essential?: boolean;
};

export type Cadence = "weekly" | "biweekly" | "monthly";

export type RecurringItem = {
  /** normalized counterparty | channel | direction */
  key: string;
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  cadence: Cadence;
  occurrences: number;
  /** Median amount of the occurrences. */
  typicalAmount: number;
  /** Amounts within +-15% of typical. */
  amountStable: boolean;
  /**
   * What we plan around. Stable amounts use the typical one. Unstable ones are conservative:
   * the 25th percentile for income, the 75th for payments out.
   */
  expectedAmount: number;
  lastDay: string;
  nextDay: string;
  dayOfMonth: number;
};

const CADENCES: { name: Cadence; days: number; tolerance: number }[] = [
  { name: "weekly", days: 7, tolerance: 1 },
  { name: "biweekly", days: 14, tolerance: 2 },
  { name: "monthly", days: 30, tolerance: 3 },
];

export const MIN_OCCURRENCES = 3;
export const AMOUNT_TOLERANCE = 0.15;
/** Share of the gaps that must fit the cadence. */
export const INTERVAL_CONSISTENCY = 0.8;

export const groupKey = (tx: Pick<FlowTx, "counterparty" | "channel" | "direction">) =>
  `${normalizeKeyword(tx.counterparty)}|${tx.channel}|${tx.direction}`;

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

export function stepDay(item: Pick<RecurringItem, "cadence" | "dayOfMonth">, from: string): string {
  if (item.cadence === "monthly") return addMonths(from, 1, item.dayOfMonth);
  return addDays(from, item.cadence === "weekly" ? 7 : 14);
}

/**
 * Finds payments that repeat on a schedule: at least 3 occurrences, gaps matching weekly (7 +-1 days),
 * fortnightly (14 +-2) or monthly (30 +-3), income and bills alike. Items whose next date is more
 * than one cycle overdue are treated as ended.
 */
export function detectRecurring(txs: FlowTx[], now: Date = new Date()): RecurringItem[] {
  const today = dhakaDay(now);
  const groups = new Map<string, FlowTx[]>();
  for (const tx of txs) {
    if (!normalizeKeyword(tx.counterparty)) continue;
    const key = groupKey(tx);
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const items: RecurringItem[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;

    // One amount per day (several payments on one day count once).
    const perDay = new Map<string, number>();
    for (const tx of group) {
      const day = dhakaDay(tx.occurred_at);
      perDay.set(day, (perDay.get(day) ?? 0) + tx.amount);
    }
    const days = [...perDay.keys()].sort();
    if (days.length < MIN_OCCURRENCES) continue;

    const intervals = days.slice(1).map((d, i) => dayDiff(days[i]!, d));
    const med = median(intervals);
    const cadence = CADENCES.find((c) => Math.abs(med - c.days) <= c.tolerance);
    if (!cadence) continue;
    const fits = intervals.filter((i) => Math.abs(i - cadence.days) <= cadence.tolerance).length;
    if (fits / intervals.length < INTERVAL_CONSISTENCY) continue;

    const amounts = days.map((d) => perDay.get(d)!);
    const typical = median(amounts);
    const stable = amounts.every((a) => Math.abs(a - typical) / typical <= AMOUNT_TOLERANCE);
    const direction = group[0]!.direction;
    const expected = stable
      ? typical
      : direction === "in"
        ? percentile(amounts, 0.25)
        : percentile(amounts, 0.75);

    const lastDay = days[days.length - 1]!;
    const dayOfMonth = parseDay(lastDay).getUTCDate();
    const item: RecurringItem = {
      key,
      direction,
      channel: group[0]!.channel,
      counterparty: group[0]!.counterparty,
      cadence: cadence.name,
      occurrences: days.length,
      typicalAmount: Math.round(typical * 100) / 100,
      amountStable: stable,
      expectedAmount: Math.round(expected * 100) / 100,
      lastDay,
      nextDay: lastDay,
      dayOfMonth,
    };

    let next = stepDay(item, lastDay);
    // Slightly overdue is fine (it may land today); more than a cycle overdue means it stopped.
    let rolled = 0;
    while (next < today && rolled < 1) {
      next = stepDay(item, next);
      rolled++;
    }
    if (next < today) continue;
    item.nextDay = next;
    items.push(item);
  }

  return items.sort((a, b) => a.nextDay.localeCompare(b.nextDay) || a.key.localeCompare(b.key));
}
