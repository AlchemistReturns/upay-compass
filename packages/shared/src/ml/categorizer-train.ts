import { categorize } from "../categorize.ts";
import {
  buildMerchantSet,
  MODEL_CLASSES,
  unitHash,
  type LabelledMerchant,
} from "./data/merchants.ts";
import {
  predictProbabilities,
  trainSoftmax,
  type SoftmaxModel,
  type TrainOptions,
} from "./softmax.ts";
import { HASH_BUCKETS, textFeatures } from "./text.ts";

export type Example = LabelledMerchant & {
  /** true when the keyword rules give no answer, so the model (or the AI) would have to. */
  ruleMiss: boolean;
  /** What the rules answered, when they did. */
  ruleLabel: string | null;
  /** How the rules decided ("keyword", "channel", ...), when they did. */
  ruleBy: string | null;
};

export function buildExamples(perTerm = 14, seed = 7): Example[] {
  return buildMerchantSet(perTerm, seed).map((m) => {
    const r = categorize({
      direction: "out",
      channel: m.channel,
      counterparty: m.counterparty,
      note: m.note,
    });
    return {
      ...m,
      ruleMiss: r === null,
      ruleLabel: r?.category ?? null,
      ruleBy: r?.matchedBy ?? null,
    };
  });
}

const toRow = (e: Example) => ({
  features: textFeatures({ counterparty: e.counterparty, note: e.note, channel: e.channel }),
  label: MODEL_CLASSES.indexOf(e.label),
});

export function train(examples: Example[], options?: TrainOptions): SoftmaxModel {
  return trainSoftmax(MODEL_CLASSES, examples.map(toRow), HASH_BUCKETS, options);
}

export type Prediction = { truth: string; predicted: string; probability: number };

export function predictAll(model: SoftmaxModel, examples: Example[]): Prediction[] {
  return examples.map((e) => {
    const p = predictProbabilities(model, toRow(e).features);
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i]! > p[best]!) best = i;
    return { truth: e.label, predicted: MODEL_CLASSES[best]!, probability: p[best]! };
  });
}

/**
 * Cross-validation in which every vocabulary term (every shop or brand name) lives in exactly one
 * fold, so the model is always tested on names it has never seen, not just on new spellings of
 * names it has. Returns one out-of-fold prediction per example, in the same order.
 */
export function groupedCrossValidation(
  examples: Example[],
  folds = 4,
  options?: TrainOptions,
): Prediction[] {
  const fold = (e: Example) => Math.min(folds - 1, Math.floor(unitHash(e.term) * folds));
  const out = new Array<Prediction>(examples.length);
  for (let f = 0; f < folds; f++) {
    const trainSet = examples.filter((e) => fold(e) !== f);
    const model = train(trainSet, options);
    examples.forEach((e, i) => {
      if (fold(e) === f) out[i] = predictAll(model, [e])[0]!;
    });
  }
  return out;
}

export type AcceptedStats = {
  threshold: number;
  /** Share of the rule-miss examples the model labels (the rest go to the AI). */
  coverage: number;
  /** Of the labelled ones, the share with the right category. */
  precision: number;
  accepted: number;
};

/** What happens to the rule-miss examples if the model labels everything at or above `threshold`. */
export function statsAt(
  examples: Example[],
  predictions: Prediction[],
  threshold: number,
): AcceptedStats {
  let missed = 0;
  let accepted = 0;
  let right = 0;
  examples.forEach((e, i) => {
    if (!e.ruleMiss) return;
    missed++;
    const p = predictions[i]!;
    if (p.predicted === "other" || p.probability < threshold) return;
    accepted++;
    if (p.predicted === e.label) right++;
  });
  return {
    threshold,
    coverage: missed ? accepted / missed : 0,
    precision: accepted ? right / accepted : 1,
    accepted,
  };
}

/** The lowest threshold whose precision on the rule-miss examples reaches `target`. */
export function chooseThreshold(
  examples: Example[],
  predictions: Prediction[],
  target = 0.95,
): AcceptedStats {
  let last = statsAt(examples, predictions, 0.99);
  for (let t = 0.3; t <= 0.99; t += 0.01) {
    const s = statsAt(examples, predictions, Math.round(t * 100) / 100);
    if (s.precision >= target && s.accepted > 0) return s;
    last = s;
  }
  return last;
}
