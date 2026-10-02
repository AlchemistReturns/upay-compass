/** Pure goal and round-up arithmetic. The database enforces the same rules for round-ups. */

/** Round-up for one outgoing payment: the gap to the next 10 taka (0 if already a multiple). */
export function roundUpAmount(amount: number): number {
  // Work in paisa so 99.5 and 0.1 + 0.2 style floats cannot leak into money.
  const paisa = Math.round(amount * 100);
  const toNextTen = (1000 - (paisa % 1000)) % 1000;
  return toNextTen / 100;
}

export type Contribution = { amount: number; created_at: string };

export type GoalProjectionInput = {
  target: number;
  saved: number;
  /** "YYYY-MM-DD" or null */
  targetDate: string | null;
  contributions: Contribution[];
  now?: Date;
};

export type GoalProjection = {
  status: "completed" | "no_contributions" | "on_track" | "behind";
  remaining: number;
  /** Average amount put aside per 30 days, from the last 90 days of contributions. */
  avgMonthly: number;
  /** Months left at the current pace, or null with no contributions. */
  monthsLeft: number | null;
  /** "YYYY-MM-DD" at the current pace, or null. */
  projectedDate: string | null;
  /** What per month would hit the target date, when a future date is set. */
  requiredMonthly: number | null;
};

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;
const MONTH_DAYS = 30;

/** projected completion = remaining / average monthly contribution */
export function projectGoal(input: GoalProjectionInput): GoalProjection {
  const now = input.now ?? new Date();
  const remaining = Math.max(0, input.target - input.saved);

  const windowStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  const recent = input.contributions.filter((c) => new Date(c.created_at).getTime() >= windowStart);
  const total = recent.reduce((n, c) => n + c.amount, 0);
  const earliest = recent.length
    ? Math.min(...recent.map((c) => new Date(c.created_at).getTime()))
    : now.getTime();
  // At least a 30-day span, so one early contribution is not read as a huge monthly rate.
  const spanDays = Math.max(MONTH_DAYS, (now.getTime() - earliest) / DAY_MS);
  const avgMonthly = total / (spanDays / MONTH_DAYS);

  let requiredMonthly: number | null = null;
  if (input.targetDate && remaining > 0) {
    const monthsToDate =
      (new Date(`${input.targetDate}T23:59:59Z`).getTime() - now.getTime()) / (MONTH_DAYS * DAY_MS);
    if (monthsToDate > 0) requiredMonthly = Math.ceil(remaining / monthsToDate);
  }

  if (remaining === 0) {
    return {
      status: "completed",
      remaining,
      avgMonthly,
      monthsLeft: 0,
      projectedDate: null,
      requiredMonthly: null,
    };
  }
  if (avgMonthly <= 0) {
    return {
      status: "no_contributions",
      remaining,
      avgMonthly: 0,
      monthsLeft: null,
      projectedDate: null,
      requiredMonthly,
    };
  }

  const monthsLeft = remaining / avgMonthly;
  const projected = new Date(now.getTime() + monthsLeft * MONTH_DAYS * DAY_MS);
  const projectedDate = projected.toISOString().slice(0, 10);
  const behind = input.targetDate !== null && projectedDate > input.targetDate;

  return {
    status: behind ? "behind" : "on_track",
    remaining,
    avgMonthly,
    monthsLeft,
    projectedDate,
    requiredMonthly,
  };
}
