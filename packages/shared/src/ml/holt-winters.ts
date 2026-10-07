import { addDays, weekdayOf } from "../dates.ts";
import { dailyIncomeStd, weekdayMeanIncome } from "./predictors.ts";
import type { SpendPredictor } from "./types.ts";

/** Holt-Winters with a weekly season (indexed by weekday) and an optional damped trend. */
export type HwFit = {
  level: number;
  trend: number;
  seasonal: number[];
  alpha: number;
  beta: number;
  gamma: number;
  /** Root mean squared one-step-ahead error on the fitted history, taka. */
  residualStd: number;
};

const PHI = 0.9;
const ALPHAS = [0.05, 0.1, 0.2, 0.3];
const BETAS = [0, 0.05];
const GAMMAS = [0.05, 0.1, 0.2, 0.3];
export const HW_MIN_DAYS = 28;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function run(days: string[], y: number[], alpha: number, beta: number, gamma: number) {
  const n = y.length;
  const seasonal = new Array<number>(7).fill(0);
  const init = Math.min(n, 28);
  const overall = mean(y.slice(0, init));
  for (let w = 0; w < 7; w++) {
    const vals = y.slice(0, init).filter((_, i) => weekdayOf(days[i]!) === w);
    seasonal[w] = vals.length ? mean(vals) - overall : 0;
  }
  let level = overall;
  let trend = 0;
  let sse = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const w = weekdayOf(days[i]!);
    const pred = level + PHI * trend + seasonal[w]!;
    if (i >= 7) {
      sse += (y[i]! - pred) ** 2;
      count++;
    }
    const prevLevel = level;
    level = alpha * (y[i]! - seasonal[w]!) + (1 - alpha) * (level + PHI * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * PHI * trend;
    seasonal[w] = gamma * (y[i]! - level) + (1 - gamma) * seasonal[w]!;
  }
  return { level, trend, seasonal, sse, count };
}

/** Fits by trying a small grid of smoothing settings and keeping the lowest one-step error. */
export function fitHoltWinters(days: string[], y: number[]): HwFit | null {
  if (y.length < HW_MIN_DAYS || days.length !== y.length) return null;
  let best: (HwFit & { sse: number }) | null = null;
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      for (const gamma of GAMMAS) {
        const r = run(days, y, alpha, beta, gamma);
        if (!best || r.sse < best.sse) {
          best = {
            level: r.level,
            trend: r.trend,
            seasonal: r.seasonal,
            alpha,
            beta,
            gamma,
            residualStd: Math.sqrt(r.sse / Math.max(1, r.count)),
            sse: r.sse,
          };
        }
      }
    }
  }
  return best;
}

/** `horizon` daily values after `today`, never below zero. */
export function forecastHoltWinters(fit: HwFit, today: string, horizon: number): number[] {
  const out: number[] = [];
  let damp = 0;
  let p = 1;
  for (let h = 1; h <= horizon; h++) {
    p *= PHI;
    damp += p;
    const w = weekdayOf(addDays(today, h));
    out.push(Math.max(0, fit.level + damp * fit.trend + fit.seasonal[w]!));
  }
  return out;
}

export const holtWintersPredictor: SpendPredictor = (input) => {
  const fit = fitHoltWinters(input.days, input.spend);
  if (!fit) return null;
  const spend = forecastHoltWinters(fit, input.today, input.horizon);
  if (spend.some((v) => !Number.isFinite(v))) return null;
  return {
    spend,
    method: "holt_winters",
    sigma: fit.residualStd,
    income: weekdayMeanIncome(input),
    incomeSigma: dailyIncomeStd(input),
  };
};
