import { extractAmounts } from "./coach-context.ts";

/**
 * Amounts a person SAID, read by code so a voice command's amount can be checked against what was
 * actually spoken instead of trusting the model. Digits ("500", "5k", "৫ হাজার") come from
 * `extractAmounts`; this adds number WORDS in English ("five hundred", "two thousand fifty") and
 * Bangla ("পাঁচশো", "দেড় হাজার", "পঞ্চাশ"), because a transcriber sometimes writes a number out.
 */

const EN_UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const EN_SCALE: Record<string, number> = {
  thousand: 1_000,
  lakh: 100_000,
  lac: 100_000,
  lakhs: 100_000,
  crore: 10_000_000,
};

/** Bangla number words 1 to 99 (common spellings; a few have two). */
const BN_WORDS: Record<string, number> = {
  এক: 1,
  দুই: 2,
  দু: 2,
  তিন: 3,
  চার: 4,
  পাঁচ: 5,
  পাচ: 5,
  ছয়: 6,
  সাত: 7,
  আট: 8,
  নয়: 9,
  দশ: 10,
  এগারো: 11,
  এগার: 11,
  বারো: 12,
  বার: 12,
  তেরো: 13,
  তের: 13,
  চৌদ্দ: 14,
  পনেরো: 15,
  পনের: 15,
  ষোলো: 16,
  ষোল: 16,
  সতেরো: 17,
  সতের: 17,
  আঠারো: 18,
  আঠার: 18,
  উনিশ: 19,
  ঊনিশ: 19,
  বিশ: 20,
  একুশ: 21,
  বাইশ: 22,
  তেইশ: 23,
  চব্বিশ: 24,
  পঁচিশ: 25,
  পচিশ: 25,
  ছাব্বিশ: 26,
  সাতাশ: 27,
  আঠাশ: 28,
  ঊনত্রিশ: 29,
  উনত্রিশ: 29,
  ত্রিশ: 30,
  একত্রিশ: 31,
  বত্রিশ: 32,
  তেত্রিশ: 33,
  চৌত্রিশ: 34,
  পঁয়ত্রিশ: 35,
  ছত্রিশ: 36,
  সাঁইত্রিশ: 37,
  আটত্রিশ: 38,
  ঊনচল্লিশ: 39,
  উনচল্লিশ: 39,
  চল্লিশ: 40,
  একচল্লিশ: 41,
  বিয়াল্লিশ: 42,
  তেতাল্লিশ: 43,
  চুয়াল্লিশ: 44,
  পঁয়তাল্লিশ: 45,
  ছেচল্লিশ: 46,
  সাতচল্লিশ: 47,
  আটচল্লিশ: 48,
  ঊনপঞ্চাশ: 49,
  উনপঞ্চাশ: 49,
  পঞ্চাশ: 50,
  একান্ন: 51,
  বাহান্ন: 52,
  তিপ্পান্ন: 53,
  চুয়ান্ন: 54,
  পঞ্চান্ন: 55,
  ছাপ্পান্ন: 56,
  সাতান্ন: 57,
  আটান্ন: 58,
  ঊনষাট: 59,
  উনষাট: 59,
  ষাট: 60,
  একষট্টি: 61,
  বাষট্টি: 62,
  তেষট্টি: 63,
  চৌষট্টি: 64,
  পঁয়ষট্টি: 65,
  ছেষট্টি: 66,
  সাতষট্টি: 67,
  আটষট্টি: 68,
  ঊনসত্তর: 69,
  উনসত্তর: 69,
  সত্তর: 70,
  একাত্তর: 71,
  বাহাত্তর: 72,
  তিয়াত্তর: 73,
  চুয়াত্তর: 74,
  পঁচাত্তর: 75,
  ছিয়াত্তর: 76,
  সাতাত্তর: 77,
  আটাত্তর: 78,
  ঊনআশি: 79,
  উনআশি: 79,
  আশি: 80,
  একাশি: 81,
  বিরাশি: 82,
  তিরাশি: 83,
  চুরাশি: 84,
  পঁচাশি: 85,
  ছিয়াশি: 86,
  সাতাশি: 87,
  আটাশি: 88,
  ঊননব্বই: 89,
  উননব্বই: 89,
  নব্বই: 90,
  একানব্বই: 91,
  বিরানব্বই: 92,
  তিরানব্বই: 93,
  চুরানব্বই: 94,
  পঁচানব্বই: 95,
  ছিয়ানব্বই: 96,
  সাতানব্বই: 97,
  আটানব্বই: 98,
  নিরানব্বই: 99,
};
const BN_HUNDRED = ["শো", "শ", "শত"];
const BN_SCALE: Record<string, number> = {
  হাজার: 1_000,
  লাখ: 100_000,
  লক্ষ: 100_000,
  কোটি: 10_000_000,
};
/** "one and a half" and "two and a half" as one word each. */
const BN_HALVES: Record<string, number> = {
  দেড়: 1.5,
  দেড: 1.5,
  আড়াই: 2.5,
};

type Token =
  { kind: "small"; value: number } | { kind: "hundred" } | { kind: "scale"; value: number };

function tokenizeEnglish(word: string): Token | null {
  if (word in EN_UNITS) return { kind: "small", value: EN_UNITS[word]! };
  if (word === "hundred") return { kind: "hundred" };
  if (word in EN_SCALE) return { kind: "scale", value: EN_SCALE[word]! };
  return null;
}

/** Bangla words, splitting a joined hundred such as "পাঁচশো" into "পাঁচ" and "শো". */
function tokenizeBangla(word: string): Token[] | null {
  if (word in BN_WORDS) return [{ kind: "small", value: BN_WORDS[word]! }];
  if (word in BN_HALVES) return [{ kind: "small", value: BN_HALVES[word]! }];
  if (word in BN_SCALE) return [{ kind: "scale", value: BN_SCALE[word]! }];
  if (BN_HUNDRED.includes(word)) return [{ kind: "hundred" }];
  for (const suffix of BN_HUNDRED) {
    if (word.endsWith(suffix) && word.length > suffix.length) {
      const base = word.slice(0, -suffix.length);
      const unit =
        base in BN_WORDS ? BN_WORDS[base] : base in BN_HALVES ? BN_HALVES[base] : undefined;
      if (unit !== undefined) return [{ kind: "small", value: unit }, { kind: "hundred" }];
    }
  }
  return null;
}

/** Numbers written as words in the text, one per run of consecutive number words. */
export function spokenNumbers(text: string): number[] {
  const words = text
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s,.;:!?()"'।-]+/)
    .filter(Boolean);

  const results: number[] = [];
  let tokens: Token[] = [];
  const flush = () => {
    if (tokens.length === 0) return;
    let total = 0;
    let current = 0;
    for (const tk of tokens) {
      if (tk.kind === "small") current += tk.value;
      else if (tk.kind === "hundred") current = (current || 1) * 100;
      else {
        total += (current || 1) * tk.value;
        current = 0;
      }
    }
    const value = total + current;
    if (value > 0) results.push(value);
    tokens = [];
  };

  for (const w of words) {
    if (w === "and") continue; // "five hundred and fifty"
    const token = tokenizeEnglish(w);
    const bn = token ? null : tokenizeBangla(w);
    if (token) tokens.push(token);
    else if (bn) tokens.push(...bn);
    else flush();
  }
  flush();
  return results;
}

/** Every amount in the transcript: digits and number words. */
export function candidateAmounts(text: string): number[] {
  const digits = extractAmounts(text).map((a) => a.amount);
  return [...new Set([...digits, ...spokenNumbers(text)])];
}
