import { holtWintersPredictor } from "./holt-winters.ts";
import { dailyIncomeStd, weekdayMeanIncome, weekdayMedianPredictor } from "./predictors.ts";
import type { SpendPredictor, SpendPredictorInput } from "./types.ts";

export const REPLAY_DAYS = 14;
const MIN_HISTORY = 28 + REPLAY_DAYS;
/** A member whose total differs from the heuristic's by more than this factor is dropped. */
const MAX_DISAGREEMENT = 3;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/**
 * Blends several predictors per user. Each one is first replayed on the user's own last
 * REPLAY_DAYS days (fitted only on the days before), and weighted by the inverse of its squared
 * error there, so a model that suits this person counts more. The weekday-median heuristic is
 * only a reference: it is replayed and used to throw out a model that disagrees wildly, but it
 * is not blended in, because a median guesses everyday spending too low (about 18% on the
 * simulated people) and would pull the balance forecast up. If every model is thrown out, or
 * there is less than 42 days of history, it declines and the caller uses the heuristic.
 */
export function ensemblePredictor(members: Record<string, SpendPredictor>): SpendPredictor {
  const all: Record<string, SpendPredictor> = {
    weekday_median: weekdayMedianPredictor,
    ...members,
  };

  return (input) => {
    const n = input.days.length;
    if (n < MIN_HISTORY) return null;

    const cut = n - REPLAY_DAYS;
    const past: SpendPredictorInput = {
      ...input,
      today: input.days[cut - 1]!,
      horizon: REPLAY_DAYS,
      days: input.days.slice(0, cut),
      spend: input.spend.slice(0, cut),
      income: input.income.slice(0, cut),
    };
    const actual = input.spend.slice(cut);

    // Root mean squared daily error of each member on the replay window, taka.
    const errors = new Map<string, number>();
    const replays = new Map<string, number[]>();
    for (const [name, predict] of Object.entries(all)) {
      const p = predict(past);
      if (!p) continue;
      replays.set(name, p.spend);
      errors.set(name, Math.sqrt(mean(p.spend.map((v, i) => (v - actual[i]!) ** 2))));
    }

    const now = new Map<string, number[]>();
    for (const name of replays.keys()) {
      const p = all[name]!(input);
      if (p) now.set(name, p.spend);
    }
    const base = now.get("weekday_median");
    if (!base) return null;
    const baseTotal = mean(base);
    for (const [name, spend] of [...now]) {
      const total = mean(spend);
      const ratio = baseTotal > 0 ? total / baseTotal : total > 0 ? Infinity : 1;
      if (name !== "weekday_median" && (ratio > MAX_DISAGREEMENT || ratio < 1 / MAX_DISAGREEMENT)) {
        now.delete(name);
      }
    }

    const raw = new Map<string, number>();
    for (const name of now.keys()) {
      if (name !== "weekday_median") raw.set(name, 1 / ((errors.get(name) ?? 0) ** 2 + 1));
    }
    if (raw.size === 0) return null;
    const sum = [...raw.values()].reduce((a, b) => a + b, 0);
    const weights: Record<string, number> = {};
    for (const [name, w] of raw) weights[name] = Math.round((w / sum) * 1000) / 1000;

    const spend = Array.from({ length: input.horizon }, (_, i) => {
      let v = 0;
      for (const [name, w] of raw) v += (w / sum) * now.get(name)![i]!;
      return v;
    });
    if (spend.some((v) => !Number.isFinite(v))) return null;

    // Size of the daily error: the blend's error on the replay window.
    const blendReplay = Array.from({ length: REPLAY_DAYS }, (_, i) => {
      let v = 0;
      let wsum = 0;
      for (const [name, w] of raw) {
        const r = replays.get(name);
        if (r) {
          v += w * r[i]!;
          wsum += w;
        }
      }
      return wsum > 0 ? v / wsum : 0;
    });
    const sigma = Math.sqrt(mean(blendReplay.map((v, i) => (v - actual[i]!) ** 2)));

    return {
      spend,
      method: "ensemble",
      sigma,
      weights,
      income: weekdayMeanIncome(input),
      incomeSigma: dailyIncomeStd(input),
    };
  };
}

/** The shipped ensemble: Holt-Winters and the trained ridge model next to the heuristic. */
export const defaultEnsemble = (ridge: SpendPredictor): SpendPredictor =>
  ensemblePredictor({ holt_winters: holtWintersPredictor, ridge });
