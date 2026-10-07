import { categorizeWithModel, disagreesWithKeywordRule } from "./ml/categorize-model.ts";
import { categorize, type CategorizableTransaction } from "./categorize.ts";

/**
 * "Why this decision": plain facts about how a payment was categorized and whether it was flagged
 * as unusual. Pure and deterministic. The result is data (a kind plus a few values); the app turns
 * it into a sentence from translation templates, so an explanation is never free text from a model
 * and never contains a prompt.
 */
export type CategorizationKind =
  /** the user corrected this merchant before; `keyword` is the merchant they taught the app */
  | "user_rule"
  /** money received is always income */
  | "income_direction"
  /** recharge and bill payments map straight to their category */
  | "channel"
  /** a keyword in the merchant name or note matched */
  | "keyword"
  /** send money and cash out have weak defaults when no keyword matches */
  | "channel_default"
  /** no rule matched and the AI suggested the category */
  | "ai"
  /** no rule matched and the on-device pattern model recognised the name */
  | "model"
  /** a keyword matched, but the pattern model thinks it is something else, so it is queued for review */
  | "keyword_doubt"
  /** nothing matched and the AI was unsure, so it is filed under Other for review */
  | "unmatched"
  /** an automatic rule decided it (the rule can no longer be traced exactly) */
  | "rule";

export type CategorizationExplanation = {
  kind: CategorizationKind;
  /** The merchant (user_rule) or the keyword (keyword) behind the decision. */
  keyword?: string;
  /** For channel and channel_default: the channel that decided it. */
  channel?: string;
  /** For model: the parts of the name that pointed to this category. */
  factors?: string[];
  /** For keyword_doubt: the category the model would have chosen. */
  suggested?: string;
};

export type AnomalyExplanation = {
  rule: "robust_z" | "new_counterparty";
  bucket: "merchant" | "category_weekday" | "category";
  amount: number;
  typical: number;
  z: number | null;
  observations: number;
};

export type ExplainFacts = {
  tx: CategorizableTransaction;
  /** The category key now stored on the payment. */
  categoryKey: string | null;
  categorySource: "rule" | "ai" | "user" | "model";
  needsReview: boolean;
  /** The user's saved correction for this merchant, if there is one. */
  userRuleKeyword: string | null;
  /** The unusual-payment alert raised for this payment, if any. */
  anomaly: AnomalyExplanation | null;
};

export type Explanation = {
  categorization: CategorizationExplanation;
  anomaly: AnomalyExplanation | null;
};

export function explainCategorization(f: ExplainFacts): CategorizationExplanation {
  if (f.categorySource === "user") {
    return { kind: "user_rule", keyword: f.userRuleKeyword ?? f.tx.counterparty };
  }
  if (f.categorySource === "ai") return { kind: "ai" };
  if (f.categorySource === "model") {
    const m = categorizeWithModel(f.tx);
    return m && m.category === f.categoryKey
      ? { kind: "model", factors: m.factors }
      : { kind: "model" };
  }

  // A rule decided it (or nothing did): run the same rules again to see which one.
  const again = categorize(f.tx, []);
  if (again === null) return { kind: f.needsReview ? "unmatched" : "rule" };
  // The stored category no longer agrees with today's rules: say only that a rule decided it.
  if (f.categoryKey !== null && again.category !== f.categoryKey) return { kind: "rule" };

  switch (again.matchedBy) {
    case "direction":
      return { kind: "income_direction" };
    case "channel":
      return { kind: "channel", channel: f.tx.channel };
    case "keyword": {
      if (f.needsReview) {
        const doubt = disagreesWithKeywordRule(f.tx, again);
        if (doubt)
          return { kind: "keyword_doubt", keyword: again.keyword, suggested: doubt.category };
      }
      return { kind: "keyword", keyword: again.keyword };
    }
    case "channel_default":
      return { kind: "channel_default", channel: f.tx.channel };
    default:
      return { kind: "rule" };
  }
}

export function explainTransaction(f: ExplainFacts): Explanation {
  return { categorization: explainCategorization(f), anomaly: f.anomaly };
}

/** The `transaction_explain()` function's jsonb, as typed facts about the database side. */
export type ExplainRpc = {
  category_source: "rule" | "ai" | "user" | "model";
  needs_review: boolean;
  category_key: string | null;
  user_rule_keyword: string | null;
  anomaly: AnomalyExplanation | null;
};

export function parseExplainRpc(raw: unknown): ExplainRpc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = r.category_source;
  if (source !== "rule" && source !== "ai" && source !== "user" && source !== "model") return null;
  const a = r.anomaly as Record<string, unknown> | null | undefined;
  return {
    category_source: source,
    needs_review: Boolean(r.needs_review),
    category_key: typeof r.category_key === "string" ? r.category_key : null,
    user_rule_keyword: typeof r.user_rule_keyword === "string" ? r.user_rule_keyword : null,
    anomaly: a
      ? {
          rule: a.rule === "new_counterparty" ? "new_counterparty" : "robust_z",
          bucket:
            a.bucket === "merchant" || a.bucket === "category" ? a.bucket : "category_weekday",
          amount: Number(a.amount ?? 0),
          typical: Number(a.typical ?? 0),
          z: a.z === null || a.z === undefined ? null : Number(a.z),
          observations: Number(a.observations ?? 0),
        }
      : null,
  };
}
