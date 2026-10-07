import { addDays, dayDiff, dhakaDay } from "../dates.ts";
import { forecastCashflow } from "../forecast.ts";
import { groupKey, type FlowTx } from "../recurring.ts";
import { mae, mean, precision, recall, smape, type Confusion } from "./metrics.ts";
import type { SpendPredictor } from "./types.ts";

/** One simulated or real person: their history and the wallet balance before the first transaction. */
export type BacktestUser = {
  id: string;
  group: string;
  txs: FlowTx[];
  openingBalance: number;
};

export type CaseResult = {
  /** Mean absolute error of the daily everyday-spending guess, taka. */
  spendMae: number;
  spendSmape: number;
  /** Mean absolute error of the daily balance path, taka. */
  balanceMae: number;
  /** Absolute error of the balance on the last forecast day, taka. */
  endBalanceErr: number;
  /** Balance on the last forecast day, forecast minus actual, taka (negative = forecast too low). */
  endBalanceBias: number;
  /** Total everyday spending: absolute error over the horizon, as a share of the actual total. */
  totalSpendErrPct: number;
  /** Share of days where the actual balance fell inside the band (null when there is no band). */
  bandCoverage: number | null;
  /** Per day: how far the actual balance was from the forecast, in band half-widths (1 = on the edge). */
  bandRatios: number[];
  /** Total everyday spending guessed minus actual, as a share of actual (negative = guessed too low). */
  spendBiasPct: number;
  risk: { predicted: string | null; actual: string | null };
  method: string;
};

/** Noon in Dhaka on `day`: a safe instant that maps back to that same calendar day. */
const noon = (day: string) => new Date(`${day}T06:00:00Z`);

/**
 * Forecasts `horizon` days from `cutDay` using only what happened up to then, and scores it
 * against what happened next. Returns null when the forecaster says there is too little history.
 */
export function backtestCase(
  user: BacktestUser,
  cutDay: string,
  predictor: SpendPredictor | undefined,
  horizon = 30,
): CaseResult | null {
  const known = user.txs.filter((t) => dhakaDay(t.occurred_at) <= cutDay);
  const future = user.txs.filter((t) => {
    const d = dhakaDay(t.occurred_at);
    return d > cutDay && d <= addDays(cutDay, horizon);
  });
  const net = (t: FlowTx) => (t.direction === "in" ? t.amount : -t.amount);
  const balanceAtCut = user.openingBalance + known.reduce((n, t) => n + net(t), 0);

  const forecast = forecastCashflow({
    now: noon(cutDay),
    balance: balanceAtCut,
    transactions: known,
    horizonDays: horizon,
    spendPredictor: predictor,
  });
  if (forecast.insufficient || !forecast.spendPath) return null;

  const recurringKeys = new Set(forecast.recurring.map((r) => r.key));
  const actualSpend = new Array<number>(horizon).fill(0);
  const dayNet = new Map<string, number>();
  for (const t of future) {
    const d = dhakaDay(t.occurred_at);
    dayNet.set(d, (dayNet.get(d) ?? 0) + net(t));
    if (t.direction === "out" && !recurringKeys.has(groupKey(t))) {
      actualSpend[dayDiff(cutDay, d) - 1]! += t.amount;
    }
  }

  const actualBalance: number[] = [balanceAtCut];
  for (let i = 1; i <= horizon; i++) {
    actualBalance.push(actualBalance[i - 1]! + (dayNet.get(addDays(cutDay, i)) ?? 0));
  }
  const predBalance = forecast.series.map((p) => p.balance);

  const actualRisk = actualBalance.findIndex((b, i) => i > 0 && b < forecast.safetyBuffer);
  const actualTotal = actualSpend.reduce((a, b) => a + b, 0);
  const predTotal = forecast.spendPath.reduce((a, b) => a + b, 0);

  let bandCoverage: number | null = null;
  const bandRatios: number[] = [];
  if (forecast.band) {
    const inside = actualBalance.filter(
      (b, i) =>
        i > 0 && b >= forecast.band!.lower[i]!.balance && b <= forecast.band!.upper[i]!.balance,
    ).length;
    bandCoverage = inside / horizon;
    for (let i = 1; i <= horizon; i++) {
      const half = forecast.band.upper[i]!.balance - forecast.series[i]!.balance;
      const miss = Math.abs(actualBalance[i]! - forecast.series[i]!.balance);
      bandRatios.push(half > 0 ? miss / half : miss > 0 ? Infinity : 0);
    }
  }

  return {
    spendMae: mae(forecast.spendPath, actualSpend),
    spendSmape: smape(forecast.spendPath, actualSpend),
    balanceMae: mae(predBalance.slice(1), actualBalance.slice(1)),
    endBalanceErr: Math.abs(predBalance[horizon]! - actualBalance[horizon]!),
    endBalanceBias: predBalance[horizon]! - actualBalance[horizon]!,
    totalSpendErrPct: actualTotal > 0 ? (100 * Math.abs(predTotal - actualTotal)) / actualTotal : 0,
    bandCoverage,
    bandRatios,
    spendBiasPct: actualTotal > 0 ? (100 * (predTotal - actualTotal)) / actualTotal : 0,
    risk: {
      predicted: forecast.firstRiskDay,
      actual: actualRisk > 0 ? addDays(cutDay, actualRisk) : null,
    },
    method: forecast.method ?? "heuristic",
  };
}

/** A predicted risk day counts as right when it is within this many days of the real one. */
export const RISK_TOLERANCE_DAYS = 2;

export type Summary = {
  cases: number;
  spendMae: number;
  spendSmape: number;
  balanceMae: number;
  endBalanceErr: number;
  /** Mean signed day-30 balance error, taka (negative = forecast too low). */
  endBalanceBias: number;
  totalSpendErrPct: number;
  bandCoverage: number | null;
  /** Mean signed error of total everyday spending, percent (negative = guessed too low). */
  spendBiasPct: number;
  /** Every per-day band ratio from the cases, for calibrating the band width. */
  bandRatios: number[];
  riskPrecision: number;
  riskRecall: number;
  risk: Confusion;
  /** How many cases ran on each method (a model can decline and fall back to the heuristic). */
  methods: Record<string, number>;
};

function confusion(pairs: { predicted: string | null; actual: string | null }[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0 };
  for (const { predicted, actual } of pairs) {
    const hit =
      predicted !== null &&
      actual !== null &&
      Math.abs(dayDiff(predicted, actual)) <= RISK_TOLERANCE_DAYS;
    if (hit) c.tp++;
    else {
      if (predicted !== null) c.fp++;
      if (actual !== null) c.fn++;
    }
  }
  return c;
}

export function summarize(results: CaseResult[]): Summary {
  const risk = confusion(results.map((r) => r.risk));
  const methods: Record<string, number> = {};
  for (const r of results) methods[r.method] = (methods[r.method] ?? 0) + 1;
  const covered = results.filter((r) => r.bandCoverage !== null);
  return {
    cases: results.length,
    spendMae: mean(results.map((r) => r.spendMae)),
    spendSmape: mean(results.map((r) => r.spendSmape)),
    balanceMae: mean(results.map((r) => r.balanceMae)),
    endBalanceErr: mean(results.map((r) => r.endBalanceErr)),
    endBalanceBias: mean(results.map((r) => r.endBalanceBias)),
    totalSpendErrPct: mean(results.map((r) => r.totalSpendErrPct)),
    bandCoverage: covered.length ? mean(covered.map((r) => r.bandCoverage!)) : null,
    spendBiasPct: mean(results.map((r) => r.spendBiasPct)),
    bandRatios: results.flatMap((r) => r.bandRatios),
    riskPrecision: precision(risk),
    riskRecall: recall(risk),
    risk,
    methods,
  };
}

/** Runs every user at every cut day with one predictor and summarises, overall and by group. */
export function backtestAll(
  users: BacktestUser[],
  cutDaysFor: (user: BacktestUser) => string[],
  predictor: SpendPredictor | undefined,
  horizon = 30,
): { overall: Summary; byGroup: Record<string, Summary> } {
  const all: CaseResult[] = [];
  const groups = new Map<string, CaseResult[]>();
  for (const user of users) {
    for (const cut of cutDaysFor(user)) {
      const r = backtestCase(user, cut, predictor, horizon);
      if (!r) continue;
      all.push(r);
      const g = groups.get(user.group);
      if (g) g.push(r);
      else groups.set(user.group, [r]);
    }
  }
  return {
    overall: summarize(all),
    byGroup: Object.fromEntries([...groups].map(([g, rs]) => [g, summarize(rs)])),
  };
}
