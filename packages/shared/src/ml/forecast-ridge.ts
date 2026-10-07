import { addDays } from "../dates.ts";
import { FORECAST_FEATURE_NAMES, featuresForDay, originContext } from "./features.ts";
import { ridgePredict, type RidgeAccumulator } from "./linear.ts";
import { dailyIncomeStd, weekdayMeanIncome } from "./predictors.ts";
import type { SpendPredictor, SpendPredictorInput } from "./types.ts";

export type RidgeForecastWeights = {
  version: number;
  featureNames: readonly string[];
  intercept: number;
  coef: number[];
  lambda: number;
  /** Free text: where the weights came from (seed ranges, row count). */
  trainedOn: string;
};

export const RIDGE_MIN_DAYS = 28;
/** Targets are spend / scale; a single huge day is capped so it cannot drag the fit. */
const TARGET_CAP = 8;

/** Adds one origin's rows (one per future day) to a training accumulator. */
export function addForecastTrainingRows(
  acc: RidgeAccumulator,
  input: SpendPredictorInput,
  actualFutureSpend: number[],
): number {
  if (input.days.length < RIDGE_MIN_DAYS) return 0;
  const ctx = originContext(input);
  let added = 0;
  for (let i = 1; i <= input.horizon; i++) {
    const actual = actualFutureSpend[i - 1];
    if (actual === undefined) break;
    acc.add(featuresForDay(ctx, addDays(input.today, i)), Math.min(TARGET_CAP, actual / ctx.scale));
    added++;
  }
  return added;
}

/** Builds a predictor from trained weights. With no weights it always declines. */
export function ridgeSpendPredictor(weights: RidgeForecastWeights | null): SpendPredictor {
  return (input) => {
    if (!weights || input.days.length < RIDGE_MIN_DAYS) return null;
    if (weights.featureNames.join() !== FORECAST_FEATURE_NAMES.join()) return null;
    const ctx = originContext(input);
    const model = { intercept: weights.intercept, coef: weights.coef };
    const spend = Array.from({ length: input.horizon }, (_, i) =>
      Math.max(
        0,
        ridgePredict(model, featuresForDay(ctx, addDays(input.today, i + 1))) * ctx.scale,
      ),
    );
    if (spend.some((v) => !Number.isFinite(v))) return null;
    return {
      spend,
      method: "ridge",
      income: weekdayMeanIncome(input),
      incomeSigma: dailyIncomeStd(input),
    };
  };
}
