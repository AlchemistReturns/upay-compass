/**
 * Isolation forest (Liu, Ting and Zhou, 2008): unusual points are easier to cut off from the rest
 * with random splits, so they end up closer to the root of random trees. Small, seeded, no
 * dependencies.
 */
type Node =
  | { leaf: true; size: number }
  | { leaf: false; feature: number; split: number; left: Node; right: Node };

export type IsolationForest = {
  trees: Node[];
  /** Number of rows each tree was grown on. */
  sample: number;
};

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

/** Average path length of an unsuccessful search in a binary tree of n points. */
function c(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function grow(rows: number[][], depth: number, limit: number, next: () => number): Node {
  if (depth >= limit || rows.length <= 1) return { leaf: true, size: rows.length };
  const dims = rows[0]!.length;
  // Try a few features until one has some spread to split on.
  for (let attempt = 0; attempt < dims; attempt++) {
    const feature = Math.floor(next() * dims);
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      lo = Math.min(lo, r[feature]!);
      hi = Math.max(hi, r[feature]!);
    }
    if (hi <= lo) continue;
    const split = lo + next() * (hi - lo);
    const left = rows.filter((r) => r[feature]! < split);
    const right = rows.filter((r) => r[feature]! >= split);
    if (left.length === 0 || right.length === 0) continue;
    return {
      leaf: false,
      feature,
      split,
      left: grow(left, depth + 1, limit, next),
      right: grow(right, depth + 1, limit, next),
    };
  }
  return { leaf: true, size: rows.length };
}

export function fitIsolationForest(
  rows: number[][],
  options: { trees?: number; sample?: number; seed?: number } = {},
): IsolationForest | null {
  if (rows.length < 8) return null;
  const { trees = 100, sample = 256, seed = 1 } = options;
  const next = rng(seed);
  const psi = Math.min(sample, rows.length);
  const limit = Math.ceil(Math.log2(psi));
  const forest: Node[] = [];
  for (let t = 0; t < trees; t++) {
    // sample without replacement
    const pool = rows.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    forest.push(grow(pool.slice(0, psi), 0, limit, next));
  }
  return { trees: forest, sample: psi };
}

function pathLength(node: Node, x: number[], depth = 0): number {
  if (node.leaf) return depth + c(node.size);
  return pathLength(x[node.feature]! < node.split ? node.left : node.right, x, depth + 1);
}

/** Anomaly score in (0, 1): near 1 is very unusual, around 0.5 or below is ordinary. */
export function isolationScore(forest: IsolationForest, x: number[]): number {
  const mean = forest.trees.reduce((s, t) => s + pathLength(t, x), 0) / forest.trees.length;
  return Math.pow(2, -mean / c(forest.sample));
}
