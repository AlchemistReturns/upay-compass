/** Calendar-day helpers in Bangladesh time. Days are "YYYY-MM-DD" strings. */

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function formatDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The Bangladesh calendar day an instant falls on. */
export function dhakaDay(instant: string | Date): string {
  const t = typeof instant === "string" ? new Date(instant) : instant;
  return formatDay(new Date(t.getTime() + DHAKA_OFFSET_MS));
}

export function addDays(day: string, n: number): string {
  return formatDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(day: string): number {
  return parseDay(day).getUTCDay();
}

/** Add whole months keeping `dayOfMonth` (clamped to the month's length). */
export function addMonths(day: string, n: number, dayOfMonth?: number): string {
  const d = parseDay(day);
  const target = dayOfMonth ?? d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return formatDay(
    new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(target, length))),
  );
}

/** The Monday on or before `day`. */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}
