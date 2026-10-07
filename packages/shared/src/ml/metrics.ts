export const mean = (v: number[]): number =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;

export const mae = (pred: number[], actual: number[]): number =>
  mean(pred.map((p, i) => Math.abs(p - (actual[i] ?? 0))));

/** Symmetric MAPE in percent; a day where both are zero counts as a perfect guess. */
export const smape = (pred: number[], actual: number[]): number =>
  mean(
    pred.map((p, i) => {
      const a = actual[i] ?? 0;
      const denom = Math.abs(p) + Math.abs(a);
      return denom === 0 ? 0 : (200 * Math.abs(p - a)) / denom;
    }),
  );

export type Confusion = { tp: number; fp: number; fn: number };

export const precision = (c: Confusion): number => (c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp));
export const recall = (c: Confusion): number => (c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn));
export const f1 = (c: Confusion): number => {
  const p = precision(c);
  const r = recall(c);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
};
