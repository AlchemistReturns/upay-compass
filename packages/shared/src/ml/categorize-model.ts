import { isCategoryKey, type CategoryKey } from "../categories.ts";
import type { CategorizeResult } from "../categorize.ts";
import { predictProbabilities, type SoftmaxModel } from "./softmax.ts";
import { textFeatures, type TextInput } from "./text.ts";
import { CATEGORIZER_WEIGHTS } from "./models/categorizer.ts";

export type CategorizerWeights = {
  version: number;
  classes: readonly string[];
  buckets: number;
  bias: number[];
  weights: number[][];
  /** Smallest probability that was accepted, chosen for the target precision (see ML_REPORT.md). */
  threshold: number;
  /** Free text: where the weights came from. */
  trainedOn: string;
};

export type ModelCategorization = {
  category: CategoryKey;
  probability: number;
  /** The parts of the name that pushed hardest towards this category, readable ("pharmacy", "^pha"). */
  factors: string[];
};

export type ModelInput = TextInput & { direction: "in" | "out" };

/** "c:^pha" -> "^pha", "w:pharmacy" -> "pharmacy", "ch:merchant" -> "merchant payment". */
function readable(feature: string): string {
  if (feature.startsWith("ch:")) return `${feature.slice(3)} payment`;
  return feature.slice(feature.indexOf(":") + 1);
}

/**
 * Labels a merchant the keyword rules could not. Returns null (the caller then asks the AI
 * fallback) when there are no weights, the payment is money in, the name is empty, the model
 * thinks it is generic ("other"), or it is not sure enough. Never throws.
 */
export function categorizeWithModel(
  tx: ModelInput,
  weights: CategorizerWeights | null = CATEGORIZER_WEIGHTS,
): ModelCategorization | null {
  try {
    if (!weights || tx.direction !== "out" || !tx.counterparty.trim()) return null;
    const features = textFeatures(tx);
    const model: SoftmaxModel = weights;
    const p = predictProbabilities(model, features);
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i]! > p[best]!) best = i;
    const category = weights.classes[best]!;
    const probability = p[best]!;
    if (!Number.isFinite(probability)) return null;
    if (category === "other" || !isCategoryKey(category) || probability < weights.threshold) {
      return null;
    }
    const w = weights.weights[best]!;
    const factors: string[] = [];
    const ranked = features.name
      .map((name, i) => ({ name, push: features.value[i]! * w[features.index[i]!]! }))
      .filter((f) => f.push > 0 && !f.name.startsWith("ch:"))
      .filter((f) => !f.name.startsWith("c:") || readable(f.name).replace(/[\^$]/g, "").length >= 3)
      .sort((a, b) => b.push - a.push);
    for (const f of ranked) {
      const text = readable(f.name);
      const bare = text.replace(/[\^$]/g, "");
      if (factors.some((x) => x.includes(bare) || bare.includes(x))) continue;
      factors.push(bare);
      if (factors.length === 3) break;
    }
    return { category, probability, factors };
  } catch {
    return null;
  }
}

/** How sure the model has to be before it questions a keyword match. */
export const SECOND_OPINION_PROBABILITY = 0.9;

/**
 * A second opinion on a keyword match: the model's category when it confidently says something
 * other than what the keyword rule decided (for example a name that contains "rent" but is a car
 * rental), otherwise null. Used to queue the payment for review, never to change it silently.
 */
export function disagreesWithKeywordRule(
  tx: ModelInput,
  rule: Pick<CategorizeResult, "category" | "matchedBy">,
  weights: CategorizerWeights | null = CATEGORIZER_WEIGHTS,
): ModelCategorization | null {
  if (rule.matchedBy !== "keyword" || !weights) return null;
  const m = categorizeWithModel(tx, {
    ...weights,
    threshold: Math.max(weights.threshold, SECOND_OPINION_PROBABILITY),
  });
  if (!m || m.probability < SECOND_OPINION_PROBABILITY) return null;
  return m.category === rule.category ? null : m;
}
