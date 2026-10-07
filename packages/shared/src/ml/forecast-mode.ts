import {
  forecastCashflow,
  type Forecast,
  type ForecastInput,
  type ForecastPoint,
} from "../forecast.ts";
import { defaultEnsemble } from "./forecast-ensemble.ts";
import { ridgeSpendPredictor } from "./forecast-ridge.ts";
import type { MlMode } from "./flags.ts";
import type { SpendPredictor } from "./types.ts";
import { FORECAST_RIDGE_WEIGHTS } from "./models/forecast-ridge.ts";

/** What the model would have said, kept next to the real forecast while the flag is on "shadow". */
export type ShadowForecast = {
  method: string;
  lowest: ForecastPoint | null;
  firstRiskDay: string | null;
  endBalance: number | null;
  /** Total everyday spending over the horizon, taka. */
  spendTotal: number;
};

const shipped = defaultEnsemble(ridgeSpendPredictor(FORECAST_RIDGE_WEIGHTS));

const summarize = (f: Forecast): ShadowForecast => ({
  method: f.method ?? "heuristic",
  lowest: f.lowest,
  firstRiskDay: f.firstRiskDay,
  endBalance: f.series.at(-1)?.balance ?? null,
  spendTotal: Math.round((f.spendPath ?? []).reduce((a, b) => a + b, 0)),
});

/**
 * The one place that decides which forecast a user sees.
 *  off:    the weekday-median forecast, exactly as before.
 *  shadow: the same forecast is returned, and the model's version is returned beside it.
 *  on:     the model's forecast (it falls back to the weekday medians by itself when it declines).
 * Anything that goes wrong in the model path (it declines, throws, or returns bad numbers) falls
 * back to the plain forecast, so a model failure can never break or change the heuristic result.
 */
export function forecastForMode(
  input: Omit<ForecastInput, "spendPredictor">,
  mode: MlMode,
  predictor: SpendPredictor = shipped,
): { forecast: Forecast; shadow: ShadowForecast | null } {
  const plain = forecastCashflow(input);
  if (mode === "off" || plain.insufficient) return { forecast: plain, shadow: null };
  try {
    const ml = forecastCashflow({ ...input, spendPredictor: predictor });
    if (mode === "on") return { forecast: ml, shadow: null };
    return { forecast: plain, shadow: summarize(ml) };
  } catch {
    return { forecast: plain, shadow: null };
  }
}
