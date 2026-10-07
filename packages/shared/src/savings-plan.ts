import { dayDiff, dhakaDay } from "./dates.ts";
import { canAfford, type Affordability, type Forecast } from "./forecast.ts";

/**
 * A savings PLAN (a DPS: a fixed amount set aside every month for a fixed number of months), worked
 * out from a goal. Every figure comes from this file; no model is involved. There is no real upay
 * DPS behind it: the plan is stored in Compass and handed to a SavingsPlanProvider, which a real
 * upay product API can replace. No money moves.
 */

/**
 * ILLUSTRATIVE yearly rate used for every projected maturity. It is NOT an offer, NOT a quote and
 * NOT the rate of upay or of any bank. Edit this one constant to change every figure; the screen
 * and the stored plan both say the rate is illustrative.
 */
export const ILLUSTRATIVE_DPS_ANNUAL_RATE = 0.07;

/** Plan lengths offered, in months. */
export const DPS_TENURES = [6, 12, 24, 36] as const;
export type DpsTenure = (typeof DPS_TENURES)[number];

/** Smallest monthly amount suggested, in taka. Anything lower is raised to this. */
export const MIN_DPS_MONTHLY = 100;

/** Tenure suggested when the goal has no target date. */
export const DEFAULT_DPS_TENURE: DpsTenure = 12;

const MONTH_DAYS = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type Maturity = {
  totalDeposited: number;
  /** What the plan would be worth at the end, deposits plus illustrative interest. */
  maturity: number;
  interest: number;
};

/**
 * Deposits are made at the start of each month and compound monthly at rate / 12:
 *   maturity = monthly x ((1 + i)^n - 1) / i x (1 + i), i = rate / 12, n = months.
 * With a zero rate it is simply monthly x n.
 */
export function projectMaturity(
  monthly: number,
  tenureMonths: number,
  annualRate: number = ILLUSTRATIVE_DPS_ANNUAL_RATE,
): Maturity {
  const totalDeposited = round2(monthly * tenureMonths);
  const i = annualRate / 12;
  const factor = i > 0 ? (((1 + i) ** tenureMonths - 1) / i) * (1 + i) : tenureMonths;
  const maturity = round2(monthly * factor);
  return { totalDeposited, maturity, interest: round2(maturity - totalDeposited) };
}

/** The smallest whole-taka monthly amount whose maturity reaches `amount` over `tenureMonths`. */
export function monthlyForTarget(
  amount: number,
  tenureMonths: number,
  annualRate: number = ILLUSTRATIVE_DPS_ANNUAL_RATE,
): number {
  if (!(amount > 0)) return 0;
  const reaches = (m: number) => projectMaturity(m, tenureMonths, annualRate).maturity >= amount;
  // projectMaturity rounds to paisa, so settle the estimate against it in both directions
  let monthly = Math.max(
    1,
    Math.ceil((amount / projectMaturity(1000, tenureMonths, annualRate).maturity) * 1000),
  );
  while (!reaches(monthly)) monthly += 1;
  while (monthly > 1 && reaches(monthly - 1)) monthly -= 1;
  return monthly;
}

/** The forecast fields the affordability check reads (the stored snapshot has all of them). */
export type PlanForecast = Pick<Forecast, "insufficient" | "series" | "safetyBuffer">;

export type PlanInput = {
  target: number;
  saved: number;
  /** "YYYY-MM-DD" or null */
  targetDate: string | null;
  now?: Date;
  annualRate?: number;
  /** The person picked a length: the monthly amount follows from it. */
  tenureMonths?: number;
  /** The person picked an amount: the shortest length that reaches the goal follows from it. */
  monthlyAmount?: number;
  /** With both, the first deposit is checked against the 30-day forecast. */
  forecast?: PlanForecast | null;
  balance?: number;
};

export type PlanSuggestion = {
  /** "goal_reached": nothing left to save for, no plan is suggested (monthly and tenure are 0). */
  status: "goal_reached" | "ok";
  /** What the goal still needs. */
  remaining: number;
  tenureMonths: number;
  monthlyAmount: number;
  annualRate: number;
  totalDeposited: number;
  projectedMaturity: number;
  interest: number;
  /** The maturity covers what the goal still needs. */
  reachesTarget: boolean;
  /** How far short the maturity falls, 0 when it reaches the goal. */
  shortfall: number;
  /** The plan ends on or before the goal's target date; null when the goal has no usable date. */
  meetsDate: boolean | null;
  /** The monthly amount was raised to the minimum. */
  raisedToMinimum: boolean;
  /** null when no forecast was given. verdict "tight" or "no" means the buffer would be breached. */
  affordability: Affordability | null;
};

/** Whole 30-day months from today to the target date; null with no date or a date that has passed. */
export function monthsUntil(targetDate: string | null, now: Date = new Date()): number | null {
  if (!targetDate) return null;
  const days = dayDiff(dhakaDay(now), targetDate);
  return days >= MONTH_DAYS ? Math.floor(days / MONTH_DAYS) : null;
}

/** Longest preset that ends by the date; the shortest preset when even that is too long. */
function tenureForDate(months: number | null): DpsTenure {
  if (months === null) return DEFAULT_DPS_TENURE;
  const fits = DPS_TENURES.filter((t) => t <= months);
  return fits.length ? fits[fits.length - 1]! : DPS_TENURES[0];
}

/**
 * Shortest preset whose maturity reaches `remaining` and that ends by the date. If none does, the
 * one whose maturity comes closest (the longest allowed by the date, or the longest preset).
 */
function tenureForMonthly(
  monthly: number,
  remaining: number,
  months: number | null,
  rate: number,
): DpsTenure {
  const allowed = DPS_TENURES.filter((t) => months === null || t <= months);
  const pool = allowed.length ? allowed : [DPS_TENURES[0]];
  const reaching = pool.find((t) => projectMaturity(monthly, t, rate).maturity >= remaining);
  return reaching ?? pool[pool.length - 1]!;
}

export function suggestSavingsPlan(input: PlanInput): PlanSuggestion {
  const rate = input.annualRate ?? ILLUSTRATIVE_DPS_ANNUAL_RATE;
  const remaining = Math.max(0, round2(input.target - input.saved));
  const months = monthsUntil(input.targetDate, input.now);

  if (remaining === 0) {
    return {
      status: "goal_reached",
      remaining,
      tenureMonths: 0,
      monthlyAmount: 0,
      annualRate: rate,
      totalDeposited: 0,
      projectedMaturity: 0,
      interest: 0,
      reachesTarget: true,
      shortfall: 0,
      meetsDate: null,
      raisedToMinimum: false,
      affordability: null,
    };
  }

  let tenure: number;
  let monthly: number;
  if (input.monthlyAmount !== undefined && input.monthlyAmount > 0) {
    monthly = Math.max(1, Math.round(input.monthlyAmount));
    tenure = input.tenureMonths ?? tenureForMonthly(monthly, remaining, months, rate);
  } else {
    tenure = input.tenureMonths ?? tenureForDate(months);
    monthly = monthlyForTarget(remaining, tenure, rate);
  }
  const raisedToMinimum = monthly < MIN_DPS_MONTHLY;
  if (raisedToMinimum) monthly = MIN_DPS_MONTHLY;

  const m = projectMaturity(monthly, tenure, rate);
  const affordability =
    input.forecast && input.balance !== undefined
      ? canAfford(monthly, input.balance, input.forecast)
      : null;

  return {
    status: "ok",
    remaining,
    tenureMonths: tenure,
    monthlyAmount: monthly,
    annualRate: rate,
    totalDeposited: m.totalDeposited,
    projectedMaturity: m.maturity,
    interest: m.interest,
    reachesTarget: m.maturity >= remaining,
    shortfall: Math.max(0, round2(remaining - m.maturity)),
    meetsDate: months === null ? null : tenure <= months,
    raisedToMinimum,
    affordability,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* The adapter seam                                                                            */
/* ------------------------------------------------------------------------------------------ */

export type SavingsPlanRequest = {
  goalId: string;
  monthlyAmount: number;
  tenureMonths: number;
  illustrativeRate: number;
  projectedMaturity: number;
};

/** "requested": Compass has recorded the request. Nothing here means a deposit was opened. */
export type SavingsPlanReceipt = { reference: string; status: "requested" };

/**
 * What Compass needs from a savings product. The adapter in adapters/upay-sim hands back a
 * reference without contacting anyone; a real upay product API implements the same method and is
 * swapped in where the provider is created. See docs/integration/upay-adapter.md.
 */
export interface SavingsPlanProvider {
  createSavingsPlan(req: SavingsPlanRequest): Promise<SavingsPlanReceipt>;
}
