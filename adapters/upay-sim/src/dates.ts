/** Calendar helpers. Days are Bangladesh (UTC+6) calendar days written as "YYYY-MM-DD". */

const MS_PER_DAY = 86_400_000;
const DHAKA_OFFSET_HOURS = 6;

export type CalendarDay = {
  /** "YYYY-MM-DD" */
  key: string;
  /** 1-31 */
  dayOfMonth: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** Days since 1970-01-01, handy for "every N days" cadences */
  epochDay: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function formatDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(key: string, days: number): string {
  return formatDay(new Date(parseDay(key).getTime() + days * MS_PER_DAY));
}

export function calendarDay(key: string): CalendarDay {
  const date = parseDay(key);
  return {
    key,
    dayOfMonth: date.getUTCDate(),
    weekday: date.getUTCDay(),
    epochDay: Math.floor(date.getTime() / MS_PER_DAY),
  };
}

/** Today's calendar day in Dhaka. */
export function todayInDhaka(now: Date = new Date()): string {
  return formatDay(new Date(now.getTime() + DHAKA_OFFSET_HOURS * 3_600_000));
}

/** ISO timestamp (UTC) for a Dhaka wall-clock time on the given day. */
export function dhakaTimeToIso(key: string, hour: number, minute: number): string {
  const d = parseDay(key);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      hour - DHAKA_OFFSET_HOURS,
      minute,
    ),
  ).toISOString();
}
