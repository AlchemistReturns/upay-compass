import { KEYWORDS, type CategoryKey } from "./categories.ts";
import type { Channel } from "./types.ts";

export type CategorizableTransaction = {
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  note?: string;
};

/** A correction the user made earlier. `keyword` is `normalizeKeyword(counterparty)`. */
export type UserRule = { keyword: string; category: CategoryKey };

export type CategorizeResult = {
  category: CategoryKey;
  /** `user` when a saved correction matched, otherwise `rule`. */
  source: "user" | "rule";
  matchedBy: "user_rule" | "direction" | "channel" | "keyword" | "channel_default";
  /** The keyword that matched, when `matchedBy` is "keyword" (lower case). */
  keyword?: string;
};

export const normalizeKeyword = (counterparty: string) => counterparty.trim().toLowerCase();

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isLatin = (s: string) => /^[\x00-\x7f]+$/.test(s);

/** Latin keywords match on word boundaries (start-anchored for long ones); Bangla matches as a substring (whole token if 2 characters or fewer). */
function matches(text: string, keyword: string): boolean {
  if (!isLatin(keyword)) {
    // Very short Bangla words ("মা", "চা") only count as whole tokens, not inside longer words.
    if ([...keyword].length > 2) return text.includes(keyword);
    return new RegExp(String.raw`(^|[\s,.;:/()-])${keyword}($|[\s,.;:/()-])`).test(text);
  }
  const k = escapeRegex(keyword);
  const pattern = keyword.length <= 3 ? `(^|[^a-z0-9])${k}($|[^a-z0-9])` : `(^|[^a-z0-9])${k}`;
  return new RegExp(pattern).test(text);
}

const ALL_KEYWORDS = (Object.entries(KEYWORDS) as [CategoryKey, string[]][])
  .flatMap(([category, words]) => words.map((word) => ({ category, word: word.toLowerCase() })))
  .sort((a, b) => b.word.length - a.word.length);

/**
 * Rules-first categorization:
 * 1. user corrections, 2. money in is income, 3. recharge and bill channels,
 * 4. longest keyword match (en + bn), 5. weak channel default (send_money, cash_out).
 * Returns null when nothing matches, which is the cue for the AI fallback.
 */
export function categorize(
  tx: CategorizableTransaction,
  userRules: UserRule[] = [],
): CategorizeResult | null {
  const counterparty = normalizeKeyword(tx.counterparty);

  if (counterparty) {
    const rule = userRules.find((r) => r.keyword === counterparty);
    if (rule) return { category: rule.category, source: "user", matchedBy: "user_rule" };
  }

  if (tx.direction === "in") {
    return { category: "income", source: "rule", matchedBy: "direction" };
  }

  if (tx.channel === "recharge") {
    return { category: "recharge_data", source: "rule", matchedBy: "channel" };
  }
  if (tx.channel === "bill") {
    return { category: "bills", source: "rule", matchedBy: "channel" };
  }

  const text = `${counterparty} ${(tx.note ?? "").toLowerCase()}`;
  const hit = ALL_KEYWORDS.find(({ word }) => matches(text, word));
  if (hit) {
    return { category: hit.category, source: "rule", matchedBy: "keyword", keyword: hit.word };
  }

  if (tx.channel === "send_money") {
    return { category: "family", source: "rule", matchedBy: "channel_default" };
  }
  if (tx.channel === "cash_out") {
    return { category: "other", source: "rule", matchedBy: "channel_default" };
  }

  return null;
}
