/** Small dense linear algebra and ridge regression, enough for models with a few dozen features. */

/** Solves A x = b by Gaussian elimination with partial pivoting. Returns null if A is singular. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= m[r]![c]! * x[c]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

export type RidgeModel = { intercept: number; coef: number[] };

/**
 * Collects the sums ridge regression needs (X'X, X'y, y'y), so any number of rows can be added
 * without keeping them. The intercept is the first column and is not penalised.
 */
export class RidgeAccumulator {
  readonly features: number;
  n = 0;
  yty = 0;
  private xtx: number[][];
  private xty: number[];

  constructor(features: number) {
    this.features = features;
    const d = features + 1;
    this.xtx = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    this.xty = new Array<number>(d).fill(0);
  }

  add(x: number[], y: number): void {
    const d = this.features + 1;
    for (let i = 0; i < d; i++) {
      const xi = i === 0 ? 1 : x[i - 1]!;
      this.xty[i]! += xi * y;
      for (let j = 0; j < d; j++) this.xtx[i]![j]! += xi * (j === 0 ? 1 : x[j - 1]!);
    }
    this.yty += y * y;
    this.n++;
  }

  merge(other: RidgeAccumulator): void {
    const d = this.features + 1;
    for (let i = 0; i < d; i++) {
      this.xty[i]! += other.xty[i]!;
      for (let j = 0; j < d; j++) this.xtx[i]![j]! += other.xtx[i]![j]!;
    }
    this.yty += other.yty;
    this.n += other.n;
  }

  fit(lambda: number): RidgeModel | null {
    if (this.n === 0) return null;
    const d = this.features + 1;
    const a = this.xtx.map((row, i) => row.map((v, j) => (i === j && i > 0 ? v + lambda : v)));
    const w = solveLinear(a, this.xty);
    return w ? { intercept: w[0]!, coef: w.slice(1) } : null;
  }

  /** Mean squared error of `model` over the rows added so far. */
  mse(model: RidgeModel): number {
    const w = [model.intercept, ...model.coef];
    let quad = 0;
    let lin = 0;
    for (let i = 0; i < w.length; i++) {
      lin += w[i]! * this.xty[i]!;
      for (let j = 0; j < w.length; j++) quad += w[i]! * w[j]! * this.xtx[i]![j]!;
    }
    return (this.yty - 2 * lin + quad) / Math.max(1, this.n);
  }
}

export const ridgePredict = (model: RidgeModel, x: number[]): number =>
  model.coef.reduce((s, c, i) => s + c * (x[i] ?? 0), model.intercept);
