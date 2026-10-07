import type { SparseFeatures } from "./text.ts";

/** Multinomial logistic regression over sparse features. */
export type SoftmaxModel = {
  classes: readonly string[];
  buckets: number;
  /** weights[class][bucket] */
  weights: number[][];
  bias: number[];
};

export type TrainRow = { features: SparseFeatures; label: number };

export type TrainOptions = {
  epochs?: number;
  /** Starting step size, shrinks every epoch. */
  rate?: number;
  /** L2 penalty. */
  l2?: number;
  /** Seeded shuffle, so training is reproducible. */
  seed?: number;
};

/** Small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function logits(model: SoftmaxModel, f: SparseFeatures): number[] {
  return model.classes.map((_, c) => {
    let s = model.bias[c]!;
    const w = model.weights[c]!;
    for (let i = 0; i < f.index.length; i++) s += f.value[i]! * w[f.index[i]!]!;
    return s;
  });
}

export function predictProbabilities(model: SoftmaxModel, f: SparseFeatures): number[] {
  return softmax(logits(model, f));
}

/** Stochastic gradient descent, one example at a time, with a decaying step and L2 shrinkage. */
export function trainSoftmax(
  classes: readonly string[],
  rows: TrainRow[],
  buckets: number,
  options: TrainOptions = {},
): SoftmaxModel {
  const { epochs = 30, rate = 0.5, l2 = 1e-5, seed = 1 } = options;
  const k = classes.length;
  const model: SoftmaxModel = {
    classes,
    buckets,
    weights: Array.from({ length: k }, () => new Array<number>(buckets).fill(0)),
    bias: new Array<number>(k).fill(0),
  };
  const next = rng(seed);
  const order = rows.map((_, i) => i);

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const step = rate / (1 + epoch * 0.3);
    for (const r of order) {
      const row = rows[r]!;
      const p = predictProbabilities(model, row.features);
      for (let c = 0; c < k; c++) {
        const err = p[c]! - (c === row.label ? 1 : 0);
        const w = model.weights[c]!;
        for (let i = 0; i < row.features.index.length; i++) {
          const b = row.features.index[i]!;
          w[b] = w[b]! - step * (err * row.features.value[i]! + l2 * w[b]!);
        }
        model.bias[c] = model.bias[c]! - step * err;
      }
    }
  }
  return model;
}
