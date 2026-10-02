import { dayDiff, mondayOf } from "./dates.ts";
import type { Forecast } from "./forecast.ts";
import type { GoalProjection } from "./goals.ts";
import type { RecurringItem } from "./recurring.ts";

/** Rule-driven nudges (no model involved). Each carries a dedupe key so it fires once. */
export type NudgeType = "overspend" | "goal_behind" | "bill_due" | "forecast_risk";

export type GeneratedNudge = {
  type: NudgeType;
  data: Record<string, unknown>;
  dedupe_key: string;
};

export type NudgeInputs = {
  /** Bangladesh calendar day, "YYYY-MM-DD". */
  today: string;
  /** Spending in the last 7 days vs the average week over the 8 weeks before. */
  categoryWeekly: { categoryId: number; thisWeek: number; avgPriorWeek: number }[];
  goals: {
    id: string;
    title: string;
    targetDate: string | null;
    ageDays: number;
    projection: GoalProjection;
  }[];
  recurring: RecurringItem[];
  forecast: Forecast | null;
};

/** A week at 2x the usual is the trigger... */
export const OVERSPEND_FACTOR = 2;
/** ...but only if it is also at least this much more, so small categories do not nag. */
export const OVERSPEND_MIN_EXTRA = 300;
export const BILL_DUE_WITHIN_DAYS = 3;
export const FORECAST_RISK_WITHIN_DAYS = 14;
/** A goal with a target date and no savings yet is only called behind after this long. */
export const GOAL_GRACE_DAYS = 14;

export function generateNudges(input: NudgeInputs): GeneratedNudge[] {
  const out: GeneratedNudge[] = [];
  const week = mondayOf(input.today);

  for (const c of input.categoryWeekly) {
    if (
      c.avgPriorWeek > 0 &&
      c.thisWeek >= OVERSPEND_FACTOR * c.avgPriorWeek &&
      c.thisWeek - c.avgPriorWeek >= OVERSPEND_MIN_EXTRA
    ) {
      out.push({
        type: "overspend",
        data: { category_id: c.categoryId, spent: c.thisWeek, average: c.avgPriorWeek },
        dedupe_key: `overspend:${c.categoryId}:${week}`,
      });
    }
  }

  for (const g of input.goals) {
    const p = g.projection;
    const behind =
      p.status === "behind" ||
      (p.status === "no_contributions" &&
        g.targetDate !== null &&
        p.requiredMonthly !== null &&
        g.ageDays >= GOAL_GRACE_DAYS);
    if (behind) {
      out.push({
        type: "goal_behind",
        data: {
          goal_id: g.id,
          title: g.title,
          required_monthly: p.requiredMonthly,
          projected_date: p.projectedDate,
          target_date: g.targetDate,
        },
        dedupe_key: `goal_behind:${g.id}:${input.today.slice(0, 7)}`,
      });
    }
  }

  for (const item of input.recurring) {
    if (item.direction !== "out") continue;
    const days = dayDiff(input.today, item.nextDay);
    if (days >= 0 && days <= BILL_DUE_WITHIN_DAYS) {
      out.push({
        type: "bill_due",
        data: { name: item.counterparty, amount: item.expectedAmount, due: item.nextDay, days },
        dedupe_key: `bill_due:${item.key}:${item.nextDay}`,
      });
    }
  }

  const f = input.forecast;
  if (
    f &&
    !f.insufficient &&
    f.firstRiskDay &&
    dayDiff(input.today, f.firstRiskDay) <= FORECAST_RISK_WITHIN_DAYS
  ) {
    const first = f.risks[0]!;
    out.push({
      type: "forecast_risk",
      data: {
        day: first.day,
        balance: first.balance,
        buffer: f.safetyBuffer,
        level: f.lowest && f.lowest.balance < 0 ? "negative" : "low",
        lowest: f.lowest?.balance ?? null,
        lowest_day: f.lowest?.day ?? null,
      },
      dedupe_key: `forecast_risk:${week}`,
    });
  }

  return out;
}
