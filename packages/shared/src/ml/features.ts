import { addDays, dayDiff, parseDay, weekdayOf } from "../dates.ts";
import { stepDay } from "../recurring.ts";
import type { SpendPredictorInput } from "./types.ts";

/** Days of history that set a user's spending scale. */
export const SCALE_DAYS = 56;
const CAP_PAYDAY_DAYS = 30;

export const FORECAST_FEATURE_NAMES = [
  "wd_sun",
  "wd_mon",
  "wd_tue",
  "wd_wed",
  "wd_thu",
  "wd_fri",
  "wd_sat",
  "dom_sin",
  "dom_cos",
  "month_start",
  "month_end",
  "since_payday",
  "payday_window",
  "trail7",
  "trail28",
  "same_weekday",
  "zero_share",
] as const;

export type OriginContext = {
  today: string;
  /** Mean daily spend over the last SCALE_DAYS days (at least 1). Every level is divided by this. */
  scale: number;
  trail7: number;
  trail28: number;
  /** Mean of the last 4 same-weekday values, indexed by weekday (0 = Sunday). */
  sameWeekday: number[];
  zeroShare: number;
  /** Expected days of recurring income, past and future, sorted. */
  incomeDays: string[];
};

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/** Everything about one forecast origin that does not depend on which future day is asked about. */
export function originContext(input: SpendPredictorInput): OriginContext {
  const { spend, days, today, horizon } = input;
  const recent = spend.slice(-SCALE_DAYS);
  const scale = Math.max(1, mean(recent));
  const last28 = spend.slice(-28);

  const byWeekday: number[][] = [[], [], [], [], [], [], []];
  for (let i = days.length - 1; i >= 0; i--) {
    const bucket = byWeekday[weekdayOf(days[i]!)]!;
    if (bucket.length < 4) bucket.push(spend[i]!);
  }

  const end = addDays(today, horizon);
  const incomeDays: string[] = [];
  for (const item of input.recurring) {
    if (item.direction !== "in") continue;
    let d = item.lastDay;
    for (let guard = 0; d <= end && guard < 40; guard++) {
      incomeDays.push(d);
      d = stepDay(item, d);
    }
  }
  incomeDays.sort();

  return {
    today,
    scale,
    trail7: mean(spend.slice(-7)) / scale,
    trail28: mean(last28) / scale,
    sameWeekday: byWeekday.map((b) => (b.length ? mean(b) / scale : 1)),
    zeroShare: last28.length ? last28.filter((v) => v === 0).length / last28.length : 0,
    incomeDays,
  };
}

/** Features for one future day, from what was known at the origin. Same order as FORECAST_FEATURE_NAMES. */
export function featuresForDay(ctx: OriginContext, day: string): number[] {
  const wd = weekdayOf(day);
  const dom = parseDay(day).getUTCDate();
  const angle = (2 * Math.PI * (dom - 1)) / 31;

  let since: number | null = null;
  for (const d of ctx.incomeDays) {
    if (d > day) break;
    since = dayDiff(d, day);
  }
  const sincePayday = since === null ? 0.5 : Math.min(since, CAP_PAYDAY_DAYS) / CAP_PAYDAY_DAYS;

  return [
    ...Array.from({ length: 7 }, (_, i) => (i === wd ? 1 : 0)),
    Math.sin(angle),
    Math.cos(angle),
    dom <= 3 ? 1 : 0,
    dom >= 28 ? 1 : 0,
    sincePayday,
    since !== null && since <= 2 ? 1 : 0,
    ctx.trail7,
    ctx.trail28,
    ctx.sameWeekday[wd]!,
    ctx.zeroShare,
  ];
}
