import type { RecurringItem } from "../recurring.ts";

/**
 * What a spend predictor sees: the everyday spending history up to and including `today`, one
 * number per calendar day (recurring payments already taken out), plus the recurring items the
 * forecaster found. `days`, `spend` and `income` have the same length and `days` ends on `today`.
 */
export type SpendPredictorInput = {
  today: string;
  horizon: number;
  days: string[];
  /** Everyday (non-recurring) outflow per day, taka. */
  spend: number[];
  /** Everyday (non-recurring) inflow per day, taka. */
  income: number[];
  recurring: RecurringItem[];
};

export type SpendPrediction = {
  /** Predicted everyday spending for each of the next `horizon` days (tomorrow first), taka. */
  spend: number[];
  /** Which method produced it, for the UI and monitoring. */
  method: string;
  /**
   * Expected everyday income for each of the next `horizon` days, taka. When given, the forecast
   * uses it in place of the weekday medians (which count income that is not regular as zero).
   */
  income?: number[];
  /** Typical size of the daily error in everyday income, taka; widens the forecast band. */
  incomeSigma?: number;
  /** Typical size of the daily error, taka, when known. Drives the forecast's uncertainty band. */
  sigma?: number;
  /** Ensemble weights by member, when the method blends several. */
  weights?: Record<string, number>;
};

/** Returns null when it cannot (too little history, bad numbers); the caller then uses the baseline. */
export type SpendPredictor = (input: SpendPredictorInput) => SpendPrediction | null;
