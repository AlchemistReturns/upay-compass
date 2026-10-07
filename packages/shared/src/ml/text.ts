/**
 * Text features for the merchant categorizer. Everything is hashed into a fixed number of buckets,
 * so the model is a small table of numbers whatever the vocabulary, and works for English,
 * Bangla and mixed spelling without a word list.
 */

export const HASH_BUCKETS = 2048;

/** Lower case, keep letters and digits of any script (Bangla included), everything else is a space. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** FNV-1a, 32 bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type SparseFeatures = {
  /** Bucket index per feature (may repeat if two features collide). */
  index: number[];
  /** Value per feature; the whole vector has unit length. */
  value: number[];
  /** The readable feature behind each entry, for explanations ("c:^pha", "w:pharmacy"). */
  name: string[];
};

export type TextInput = {
  counterparty: string;
  note?: string;
  channel: string;
};

/**
 * Features of one transaction: whole words, character 2 to 4-grams of each word (with word
 * boundaries marked), the words of the note, and the channel. Each feature counts once. The sign of
 * a feature comes from a second bit of its hash, which makes colliding features cancel out on
 * average instead of piling up.
 */
export function textFeatures(input: TextInput): SparseFeatures {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };

  for (const word of normalizeText(input.counterparty).split(" ").filter(Boolean)) {
    add(`w:${word}`);
    const padded = `^${word}$`;
    const chars = [...padded];
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= chars.length; i++) add(`c:${chars.slice(i, i + n).join("")}`);
    }
  }
  for (const word of normalizeText(input.note ?? "")
    .split(" ")
    .filter(Boolean))
    add(`n:${word}`);
  add(`ch:${input.channel}`);

  const index: number[] = [];
  const value: number[] = [];
  for (const name of names) {
    const h = hash(name);
    index.push(h % HASH_BUCKETS);
    value.push(((h >>> 16) & 1) === 0 ? 1 : -1);
  }
  const norm = Math.sqrt(value.length) || 1;
  return { index, value: value.map((v) => v / norm), name: names };
}
