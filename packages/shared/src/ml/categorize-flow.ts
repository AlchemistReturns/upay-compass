import { categorize, type CategorizeResult, type UserRule } from "../categorize.ts";
import type { CategoryKey } from "../categories.ts";
import {
  categorizeWithModel,
  disagreesWithKeywordRule,
  type CategorizerWeights,
  type ModelInput,
} from "./categorize-model.ts";
import type { MlMode } from "./flags.ts";
import { CATEGORIZER_WEIGHTS } from "./models/categorizer.ts";

export type Labelled = {
  category: CategoryKey;
  source: "user" | "rule" | "model";
  /** true when the payment should be queued for the person to check. */
  review: boolean;
  /** Set when review is true because the model doubted a keyword match: what it would have said. */
  doubt?: CategoryKey;
};

export type StageResult = {
  /** The decision, or null when the payment still needs the AI fallback. */
  labelled: Labelled | null;
  /** In shadow mode: what the model would have said for a payment that goes to the AI. */
  shadow: CategoryKey | null;
  /** The rule's own result, for callers that want its details. */
  rule: CategorizeResult | null;
};

/**
 * The order of deciding a payment's category. The person's own corrections and the keyword rules
 * come first, exactly as before; with the model on, a payment the rules cannot place is labelled by
 * the model when it is sure enough, and a keyword match the model confidently doubts is queued for
 * review. Everything else is left for the AI fallback. With the model off nothing changes.
 */
export function categorizeInStages(
  tx: ModelInput & { channel: string },
  userRules: UserRule[],
  mode: MlMode,
  weights: CategorizerWeights | null = CATEGORIZER_WEIGHTS,
): StageResult {
  const rule = categorize(tx as Parameters<typeof categorize>[0], userRules);
  if (rule) {
    const second = mode === "on" ? disagreesWithKeywordRule(tx, rule, weights) : null;
    return {
      labelled: {
        category: rule.category,
        source: rule.source,
        review: second !== null,
        ...(second ? { doubt: second.category } : {}),
      },
      shadow: null,
      rule,
    };
  }
  const m = mode === "off" ? null : categorizeWithModel(tx, weights);
  if (m && mode === "on") {
    return {
      labelled: { category: m.category, source: "model", review: false },
      shadow: null,
      rule,
    };
  }
  return { labelled: null, shadow: m?.category ?? null, rule };
}
