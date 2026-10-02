/** Small seeded PRNG toolkit so simulated data is fully reproducible. */

export function hashString(input: string): number {
  // FNV-1a, 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = {
  /** Float in [0, 1) */
  next(): number;
  /** Integer in [min, max], inclusive */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Integer in [min, max] rounded to a multiple of `step` (default 5), the way people pay. */
  amount(min: number, max: number, step?: number): number;
};

/** mulberry32 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    amount: (min, max, step = 5) => Math.max(step, Math.round(int(min, max) / step) * step),
  };
}
