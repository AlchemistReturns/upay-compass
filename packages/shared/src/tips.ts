/**
 * "Tip of the day": one short, personal pointer picked by plain rules from numbers the app already
 * computes (forecast, health score actions). No language model: the choice is explainable and the
 * same input gives the same tip all day. With nothing personal to say, a curated tip rotates by day.
 */
import type { ActionId, HealthResult } from "./health.ts";

export const GENERIC_TIP_COUNT = 8;

export type TipId = "forecast_dip" | `health_${ActionId}` | `generic_${number}`;

export type DailyTip = {
  id: TipId;
  /** true when the tip comes from this person's own numbers */
  personal: boolean;
  /** i18n interpolation values (day, amount); empty for static tips */
  params: Record<string, string | number>;
  /** where "Take me there" goes */
  href: string;
};

export type TipInputs = {
  /** "YYYY-MM-DD" in Bangladesh time; seeds the rotation */
  today: string;
  health: HealthResult | null;
  forecast: {
    insufficient: boolean;
    lowest: { day: string; balance: number } | null;
    firstRiskDay: string | null;
  } | null;
};

const ACTION_HREF: Record<ActionId, string> = {
  save_more: "/goals",
  set_budgets: "/budgets",
  fix_budget: "/budgets",
  build_buffer: "/goals",
  smooth_income: "/forecast",
};

/** Stable small hash of the day, so the rotation is the same on every device on the same day. */
export function dayIndex(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h % GENERIC_TIP_COUNT;
}

export function pickDailyTip(i: TipInputs): DailyTip {
  const f = i.forecast;
  // 1. A forecast dip is the most time-sensitive thing to know.
  if (f && !f.insufficient && f.firstRiskDay && f.lowest) {
    return {
      id: "forecast_dip",
      personal: true,
      params: { day: f.lowest.day, amount: Math.round(f.lowest.balance) },
      href: "/forecast",
    };
  }
  // 2. The health score's top improvement, if the score is trustworthy enough to act on.
  const top = i.health && i.health.confidence === "ok" ? i.health.actions[0] : undefined;
  if (top) {
    return { id: `health_${top.id}`, personal: true, params: {}, href: ACTION_HREF[top.id] };
  }
  // 3. Nothing personal: a curated tip that changes daily.
  return {
    id: `generic_${dayIndex(i.today)}`,
    personal: false,
    params: {},
    href: "/learn",
  };
}
