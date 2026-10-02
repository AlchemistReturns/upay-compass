import { addDays, dayDiff, dhakaDay, weekdayOf } from "./dates.ts";
import {
  detectRecurring,
  groupKey,
  median,
  stepDay,
  type FlowTx,
  type RecurringItem,
} from "./recurring.ts";

export const FORECAST_HORIZON_DAYS = 30;
/** Everyday-spending and buffer statistics use the last 90 days. */
const HISTORY_DAYS = 90;
/**
 * Recurring payments are looked for over 120 days: with only 90, a monthly payment early in the
 * month can show just two occurrences and be missed.
 */
export const RECURRING_LOOKBACK_DAYS = 120;
const BASELINE_DAYS = 56;
const MIN_HISTORY_DAYS = 28;
const MIN_TRANSACTIONS = 20;
const CONFIDENT_HISTORY_DAYS = 56;
/** The safety buffer is this many days of essential spending. */
export const BUFFER_DAYS = 7;

export type ForecastPoint = { day: string; balance: number };
export type RiskFlag = { day: string; balance: number; level: "low" | "negative" };

export type Forecast = {
  /** true when there is too little history to forecast honestly; nothing else is filled in. */
  insufficient: boolean;
  confidence: "low" | "ok";
  horizonDays: number;
  today: string;
  startBalance: number;
  /** One point per day: today first, then each forecast day. */
  series: ForecastPoint[];
  safetyBuffer: number;
  risks: RiskFlag[];
  firstRiskDay: string | null;
  lowest: ForecastPoint | null;
  recurring: RecurringItem[];
  /** Baseline variable spending per weekday (0 = Sunday), taka. */
  weekdaySpend: number[];
  /** Baseline non-recurring income per weekday (median, usually 0), taka. */
  weekdayIncome: number[];
  expectedIncome: number;
  expectedBills: number;
};

export type ForecastInput = {
  now?: Date;
  /** Current wallet balance. */
  balance: number;
  transactions: FlowTx[];
  horizonDays?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyForecast(today: string, balance: number, horizonDays: number): Forecast {
  return {
    insufficient: true,
    confidence: "low",
    horizonDays,
    today,
    startBalance: balance,
    series: [],
    safetyBuffer: 0,
    risks: [],
    firstRiskDay: null,
    lowest: null,
    recurring: [],
    weekdaySpend: [0, 0, 0, 0, 0, 0, 0],
    weekdayIncome: [0, 0, 0, 0, 0, 0, 0],
    expectedIncome: 0,
    expectedBills: 0,
  };
}

/**
 * Baseline forecast: current balance, plus expected recurring income, minus expected recurring
 * payments, minus a baseline of everyday spending, plus a baseline of everyday non-recurring income.
 * Both baselines are the median of each weekday over the last 8 weeks, so occasional spikes do
 * not move them and income that does not show up most weeks counts as zero (the cautious side).
 */
export function forecastCashflow(input: ForecastInput): Forecast {
  const now = input.now ?? new Date();
  const horizon = input.horizonDays ?? FORECAST_HORIZON_DAYS;
  const today = dhakaDay(now);
  const lookbackStart = addDays(today, -(RECURRING_LOOKBACK_DAYS - 1));
  const statsStart = addDays(today, -(HISTORY_DAYS - 1));

  const all = input.transactions.filter((t) => {
    const d = dhakaDay(t.occurred_at);
    return d >= lookbackStart && d <= today;
  });
  if (all.length === 0) return emptyForecast(today, input.balance, horizon);

  const firstDay = all.reduce((min, t) => {
    const d = dhakaDay(t.occurred_at);
    return d < min ? d : min;
  }, today);
  const historyDays = dayDiff(firstDay, today) + 1;
  if (historyDays < MIN_HISTORY_DAYS || all.length < MIN_TRANSACTIONS) {
    return emptyForecast(today, input.balance, horizon);
  }

  const recurring = detectRecurring(all, now);
  const txs = all.filter((t) => dhakaDay(t.occurred_at) >= statsStart);
  const statsDays = Math.min(historyDays, HISTORY_DAYS);
  const recurringKeys = new Set(recurring.map((r) => r.key));

  // Everyday spending: out payments that are not part of a recurring schedule, per calendar day.
  const dailySpend = new Map<string, number>();
  for (const t of txs) {
    if (t.direction !== "out" || recurringKeys.has(groupKey(t))) continue;
    const d = dhakaDay(t.occurred_at);
    dailySpend.set(d, (dailySpend.get(d) ?? 0) + t.amount);
  }
  const dailyIncome = new Map<string, number>();
  for (const t of txs) {
    if (t.direction !== "in" || recurringKeys.has(groupKey(t))) continue;
    const d = dhakaDay(t.occurred_at);
    dailyIncome.set(d, (dailyIncome.get(d) ?? 0) + t.amount);
  }
  const spendByWeekday: number[][] = [[], [], [], [], [], [], []];
  const incomeByWeekday: number[][] = [[], [], [], [], [], [], []];
  const baselineStart = addDays(today, -(Math.min(BASELINE_DAYS, statsDays) - 1));
  for (let d = baselineStart; d <= today; d = addDays(d, 1)) {
    spendByWeekday[weekdayOf(d)]!.push(dailySpend.get(d) ?? 0);
    incomeByWeekday[weekdayOf(d)]!.push(dailyIncome.get(d) ?? 0);
  }
  const medians = (lists: number[][]) => lists.map((v) => (v.length ? round2(median(v)) : 0));
  const weekdaySpend = medians(spendByWeekday);
  const weekdayIncome = medians(incomeByWeekday);

  // Recurring items placed on the calendar.
  const net = new Map<string, number>();
  let expectedIncome = 0;
  let expectedBills = 0;
  const end = addDays(today, horizon);
  for (const item of recurring) {
    for (let d = item.nextDay; d <= end; d = stepDay(item, d)) {
      if (d <= today) continue; // today is already part of the starting balance
      const signed = item.direction === "in" ? item.expectedAmount : -item.expectedAmount;
      net.set(d, (net.get(d) ?? 0) + signed);
      if (item.direction === "in") expectedIncome += item.expectedAmount;
      else expectedBills += item.expectedAmount;
    }
  }

  const essentialTotal = txs
    .filter((t) => t.direction === "out" && t.essential)
    .reduce((n, t) => n + t.amount, 0);
  const safetyBuffer = Math.round((essentialTotal / statsDays) * BUFFER_DAYS);

  const series: ForecastPoint[] = [{ day: today, balance: round2(input.balance) }];
  let balance = input.balance;
  for (let i = 1; i <= horizon; i++) {
    const day = addDays(today, i);
    const wd = weekdayOf(day);
    balance += (net.get(day) ?? 0) + weekdayIncome[wd]! - weekdaySpend[wd]!;
    series.push({ day, balance: round2(balance) });
  }

  const future = series.slice(1);
  const risks: RiskFlag[] = future
    .filter((p) => p.balance < safetyBuffer)
    .map((p) => ({ day: p.day, balance: p.balance, level: p.balance < 0 ? "negative" : "low" }));
  const lowest = future.reduce((min, p) => (p.balance < min.balance ? p : min), future[0]!);

  return {
    insufficient: false,
    confidence: historyDays >= CONFIDENT_HISTORY_DAYS && recurring.length > 0 ? "ok" : "low",
    horizonDays: horizon,
    today,
    startBalance: round2(input.balance),
    series,
    safetyBuffer,
    risks,
    firstRiskDay: risks[0]?.day ?? null,
    lowest,
    recurring,
    weekdaySpend,
    weekdayIncome,
    expectedIncome: round2(expectedIncome),
    expectedBills: round2(expectedBills),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Backtest: does the baseline beat a seasonal-naive forecast on held-out days?               */
/* ------------------------------------------------------------------------------------------ */

export type Backtest = {
  /** Days held out (forecast from this many days ago). */
  days: number;
  /** Mean absolute error of the baseline forecast's daily balance, taka. */
  mae: number;
  /** The same for a seasonal-naive forecast (each day repeats the net flow of 28 days earlier). */
  naiveMae: number;
  /** How much lower the baseline's error is, in percent (positive means better). */
  improvementPct: number;
};

const dayNet = (txs: FlowTx[]) => {
  const m = new Map<string, number>();
  for (const t of txs) {
    const d = dhakaDay(t.occurred_at);
    m.set(d, (m.get(d) ?? 0) + (t.direction === "in" ? t.amount : -t.amount));
  }
  return m;
};

/**
 * Hold out the last `days` days, forecast them from what was known before, and measure the error
 * against what really happened. Returns null when there is not enough history. Any smarter model
 * must beat `mae` here to earn its place.
 */
export function backtestForecast(
  input: { now?: Date; balance: number; transactions: FlowTx[] },
  days = 30,
): Backtest | null {
  const now = input.now ?? new Date();
  const today = dhakaDay(now);
  const cutDay = addDays(today, -days);

  const known = input.transactions.filter((t) => dhakaDay(t.occurred_at) <= cutDay);
  const heldOut = input.transactions.filter((t) => dhakaDay(t.occurred_at) > cutDay);

  const actualNet = dayNet(heldOut);
  const heldOutNet = [...actualNet.values()].reduce((n, v) => n + v, 0);
  const balanceAtCut = input.balance - heldOutNet;

  const cutNow = new Date(parseNoon(cutDay));
  const forecast = forecastCashflow({
    now: cutNow,
    balance: balanceAtCut,
    transactions: known,
    horizonDays: days,
  });
  if (forecast.insufficient) return null;

  const knownNet = dayNet(known);
  let actual = balanceAtCut;
  let naive = balanceAtCut;
  let errModel = 0;
  let errNaive = 0;
  for (let i = 1; i <= days; i++) {
    const day = addDays(cutDay, i);
    actual += actualNet.get(day) ?? 0;
    naive += knownNet.get(addDays(day, -28)) ?? 0;
    errModel += Math.abs((forecast.series[i]?.balance ?? actual) - actual);
    errNaive += Math.abs(naive - actual);
  }
  const mae = errModel / days;
  const naiveMae = errNaive / days;
  return {
    days,
    mae: round2(mae),
    naiveMae: round2(naiveMae),
    improvementPct: naiveMae > 0 ? Math.round(((naiveMae - mae) / naiveMae) * 100) : 0,
  };
}

/** Noon Dhaka time on a day, as epoch ms (a safe instant that maps back to that same day). */
function parseNoon(day: string): number {
  return Date.parse(`${day}T06:00:00Z`);
}

/* ------------------------------------------------------------------------------------------ */
/* "Can I afford X?" computed by code; the coach only explains the answer.                    */
/* ------------------------------------------------------------------------------------------ */

export type AffordVerdict = "yes" | "tight" | "no" | "insufficient";

export type Affordability = {
  verdict: AffordVerdict;
  amount: number;
  balanceNow: number;
  balanceAfter: number;
  safetyBuffer: number;
  /** Lowest projected balance over the next 30 days if the purchase is made today. */
  lowestAfter: number | null;
  lowestDay: string | null;
  /** First forecast day the balance would drop below zero, if any. */
  firstNegativeDay: string | null;
};

/**
 * yes: balance stays at or above the safety buffer; tight: stays at or above zero but dips under
 * the buffer; no: would go below zero (or the amount exceeds today's balance).
 */
export function canAfford(amount: number, balance: number, forecast: Forecast): Affordability {
  const base = {
    amount,
    balanceNow: round2(balance),
    balanceAfter: round2(balance - amount),
    safetyBuffer: forecast.safetyBuffer,
  };
  if (forecast.insufficient) {
    return {
      ...base,
      verdict: "insufficient",
      lowestAfter: null,
      lowestDay: null,
      firstNegativeDay: null,
    };
  }
  const after = forecast.series.map((p) => ({ day: p.day, balance: round2(p.balance - amount) }));
  const lowest = after.reduce((min, p) => (p.balance < min.balance ? p : min), after[0]!);
  const firstNegative = after.find((p) => p.balance < 0) ?? null;
  const verdict: AffordVerdict = firstNegative
    ? "no"
    : lowest.balance >= forecast.safetyBuffer
      ? "yes"
      : "tight";
  return {
    ...base,
    verdict,
    lowestAfter: lowest.balance,
    lowestDay: lowest.day,
    firstNegativeDay: firstNegative?.day ?? null,
  };
}
