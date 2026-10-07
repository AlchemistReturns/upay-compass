export type MlModel = "forecast" | "categorize" | "anomaly";
/** off: the plain rules, as before. shadow: run the model and store its result, but do not show it. on: use it. */
export type MlMode = "off" | "shadow" | "on";

/**
 * What each model does when its setting is missing. The forecast and the categorizer passed their
 * benchmarks (docs/ML_REPORT.md) and are on by default; set the setting to `off` to go back to the
 * plain rules. The anomaly score did not beat the rule, so it stays off.
 */
export const ML_DEFAULTS: Record<MlModel, MlMode> = {
  forecast: "on",
  categorize: "on",
  anomaly: "off",
};

/** A recognised value, or `fallback` when the setting is missing or is not one of off, shadow, on. */
export const parseMlMode = (value: string | null | undefined, fallback: MlMode = "off"): MlMode => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "on" || v === "shadow" || v === "off" ? v : fallback;
};

/** Reads `ML_FORECAST`, `ML_CATEGORIZE` or `ML_ANOMALY` from whatever env object the caller has. */
export const mlMode = (model: MlModel, env: Record<string, string | undefined>): MlMode =>
  parseMlMode(env[`ML_${model.toUpperCase()}`], ML_DEFAULTS[model]);
