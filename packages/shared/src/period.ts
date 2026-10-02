/** Dashboard periods, in Bangladesh time (UTC+6, no daylight saving). */

export const PERIODS = ["week", "month", "quarter"] as const;
export type Period = (typeof PERIODS)[number];

const DHAKA_OFFSET_MS = 6 * 3_600_000;

export type PeriodRange = {
  /** Inclusive start, ISO timestamp (UTC) of Dhaka midnight */
  from: string;
  /** Exclusive end, ISO timestamp (UTC) of the next Dhaka midnight after today */
  to: string;
};

const dhakaMidnightIso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d) - DHAKA_OFFSET_MS).toISOString();

/**
 * week = this Monday to now, month = the 1st to now, quarter = the 1st of the month two months
 * ago to now (so "3 months" is the current month plus the two before it).
 */
export function getPeriodRange(period: Period, now: Date = new Date()): PeriodRange {
  const dhaka = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const y = dhaka.getUTCFullYear();
  const m = dhaka.getUTCMonth();
  const d = dhaka.getUTCDate();

  let start: [number, number, number];
  if (period === "week") {
    const daysSinceMonday = (dhaka.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(y, m, d - daysSinceMonday));
    start = [monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()];
  } else if (period === "month") {
    start = [y, m, 1];
  } else {
    const first = new Date(Date.UTC(y, m - 2, 1));
    start = [first.getUTCFullYear(), first.getUTCMonth(), 1];
  }

  return {
    from: dhakaMidnightIso(...start),
    to: dhakaMidnightIso(y, m, d + 1),
  };
}
