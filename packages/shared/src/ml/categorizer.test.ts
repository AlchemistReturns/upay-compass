import { describe, expect, it } from "vitest";
import { explainCategorization } from "../explain.ts";
import { categorizeInStages } from "./categorize-flow.ts";
import {
  SECOND_OPINION_PROBABILITY,
  categorizeWithModel,
  type CategorizerWeights,
} from "./categorize-model.ts";
import { buildExamples, chooseThreshold, predictAll, statsAt, train } from "./categorizer-train.ts";
import { MODEL_CLASSES, buildMerchantSet, unitHash } from "./data/merchants.ts";
import { softmax, trainSoftmax } from "./softmax.ts";
import { HASH_BUCKETS, normalizeText, textFeatures } from "./text.ts";
import { CATEGORIZER_WEIGHTS } from "./models/categorizer.ts";

const pay = (counterparty: string, note = "") => ({
  direction: "out" as const,
  channel: "merchant" as const,
  counterparty,
  note,
});

describe("text features", () => {
  it("normalises case and punctuation, and keeps Bangla letters", () => {
    expect(normalizeText("  Rahim's  PHARMACY!! ")).toBe("rahim s pharmacy");
    expect(normalizeText("জামাল রেস্তোরাঁ")).toBe("জামাল রেস্তোরাঁ");
  });

  it("gives a unit-length vector with bucket indices in range, and names for each feature", () => {
    const f = textFeatures({
      counterparty: "Rahim Pharmacy",
      note: "medicine",
      channel: "merchant",
    });
    expect(f.index).toHaveLength(f.value.length);
    expect(f.name).toHaveLength(f.value.length);
    expect(f.index.every((i) => i >= 0 && i < HASH_BUCKETS)).toBe(true);
    expect(f.value.reduce((s, v) => s + v * v, 0)).toBeCloseTo(1, 9);
    expect(f.name).toContain("w:pharmacy");
    expect(f.name).toContain("n:medicine");
    expect(f.name).toContain("ch:merchant");
  });

  it("shares features between a word and its misspelling", () => {
    const a = new Set(textFeatures({ counterparty: "pharmacy", channel: "merchant" }).name);
    const b = textFeatures({ counterparty: "pharmasy", channel: "merchant" }).name;
    expect(b.filter((n) => a.has(n)).length).toBeGreaterThan(3);
  });
});

describe("softmax", () => {
  it("sums to one and is stable for large inputs", () => {
    const p = softmax([1000, 1001, 999]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(p[1]).toBeGreaterThan(p[0]!);
  });

  it("learns a tiny separable problem", () => {
    const mk = (word: string, label: number) => ({
      features: textFeatures({ counterparty: word, channel: "merchant" }),
      label,
    });
    const rows = [mk("alpha", 0), mk("alphas", 0), mk("beta", 1), mk("betas", 1)];
    const model = trainSoftmax(["a", "b"], rows, HASH_BUCKETS, { epochs: 40, seed: 3 });
    const right = rows.filter((r) => {
      const l = model.classes.map((_, c) => {
        let s = model.bias[c]!;
        r.features.index.forEach((ix, i) => (s += r.features.value[i]! * model.weights[c]![ix]!));
        return s;
      });
      return l.indexOf(Math.max(...l)) === r.label;
    });
    expect(right).toHaveLength(4);
  });

  it("is reproducible", () => {
    const rows = [
      { features: textFeatures({ counterparty: "x y", channel: "merchant" }), label: 0 },
      { features: textFeatures({ counterparty: "z w", channel: "merchant" }), label: 1 },
    ];
    const a = trainSoftmax(["a", "b"], rows, HASH_BUCKETS, { epochs: 5, seed: 9 });
    const b = trainSoftmax(["a", "b"], rows, HASH_BUCKETS, { epochs: 5, seed: 9 });
    expect(a.weights).toEqual(b.weights);
  });
});

describe("generated merchant set", () => {
  it("is reproducible and covers every class", () => {
    const a = buildMerchantSet(3, 1);
    expect(a).toEqual(buildMerchantSet(3, 1));
    expect(new Set(a.map((m) => m.label))).toEqual(new Set(MODEL_CLASSES));
  });

  it("assigns every vocabulary term a stable value", () => {
    expect(unitHash("food:Restaurant")).toBe(unitHash("food:Restaurant"));
    expect(unitHash("a")).not.toBe(unitHash("b"));
  });
});

describe("training pipeline", () => {
  const examples = buildExamples(6, 5);

  it("marks which examples the keyword rules miss", () => {
    expect(examples.some((e) => e.ruleMiss)).toBe(true);
    expect(examples.some((e) => !e.ruleMiss && e.ruleBy !== null)).toBe(true);
  });

  it("learns names it has seen and picks a threshold", () => {
    const model = train(examples, { epochs: 12 });
    const preds = predictAll(model, examples);
    const hit = preds.filter((p, i) => p.predicted === examples[i]!.label).length;
    expect(hit / examples.length).toBeGreaterThan(0.9);
    const chosen = chooseThreshold(examples, preds, 0.95);
    expect(chosen.threshold).toBeGreaterThan(0);
    expect(statsAt(examples, preds, 0.999).coverage).toBeLessThanOrEqual(chosen.coverage + 1);
  });
});

describe("shipped categorizer", () => {
  it("has trained weights with a conservative threshold", () => {
    expect(CATEGORIZER_WEIGHTS).not.toBeNull();
    const w = CATEGORIZER_WEIGHTS!;
    expect(w.classes).toEqual(MODEL_CLASSES);
    expect(w.weights).toHaveLength(MODEL_CLASSES.length);
    expect(w.weights.every((r) => r.length === w.buckets)).toBe(true);
    expect(w.threshold).toBeGreaterThanOrEqual(SECOND_OPINION_PROBABILITY);
  });

  it.each([
    ["Rahim Pharmasy", "health"],
    ["Biriyani Ghor Mirpur", "food"],
    ["Nila Cha Adda", "food"],
    ["Karim Coaching Centre", "education"],
    ["Alam Fashion House", "shopping"],
  ])("recognises %s as %s", (name, category) => {
    expect(categorizeWithModel(pay(name))?.category).toBe(category);
  });

  it("says nothing about generic names, empty names and money in", () => {
    expect(categorizeWithModel(pay("Sky Lounge"))).toBeNull();
    expect(categorizeWithModel(pay("Rahim Store"))).toBeNull();
    expect(categorizeWithModel(pay("   "))).toBeNull();
    expect(categorizeWithModel({ ...pay("Rahim Pharmasy"), direction: "in" })).toBeNull();
  });

  it("returns null with no weights, and never throws on odd input", () => {
    expect(categorizeWithModel(pay("Rahim Pharmasy"), null)).toBeNull();
    const broken = { ...CATEGORIZER_WEIGHTS!, weights: [] } as CategorizerWeights;
    expect(categorizeWithModel(pay("Rahim Pharmasy"), broken)).toBeNull();
  });

  it("gives readable reasons made of parts of the name", () => {
    const m = categorizeWithModel(pay("Rahim Pharmasy"))!;
    expect(m.probability).toBeGreaterThan(0.9);
    expect(m.factors.length).toBeGreaterThan(0);
    expect(m.factors.every((f) => f.length >= 3 && !f.includes("^") && !f.includes("$"))).toBe(
      true,
    );
  });
});

describe("categorizeInStages", () => {
  it("off: exactly the rules, and unknown merchants are left for the AI", () => {
    expect(categorizeInStages(pay("Rahim Pharmasy"), [], "off").labelled).toBeNull();
    expect(categorizeInStages(pay("Car Rental"), [], "off").labelled).toMatchObject({
      category: "bills",
      source: "rule",
      review: false,
    });
  });

  it("on: the model labels what the rules cannot", () => {
    expect(categorizeInStages(pay("Rahim Pharmasy"), [], "on").labelled).toEqual({
      category: "health",
      source: "model",
      review: false,
    });
  });

  it("on: unknown, generic names still go to the AI", () => {
    const r = categorizeInStages(pay("Sky Lounge"), [], "on");
    expect(r.labelled).toBeNull();
    expect(r.shadow).toBeNull();
  });

  it("shadow: nothing changes, but the model's guess is reported", () => {
    const r = categorizeInStages(pay("Rahim Pharmasy"), [], "shadow");
    expect(r.labelled).toBeNull();
    expect(r.shadow).toBe("health");
    expect(categorizeInStages(pay("Car Rental"), [], "shadow").labelled?.review).toBe(false);
  });

  it("on: a keyword match the model doubts is queued for review, not changed", () => {
    expect(categorizeInStages(pay("Car Rental"), [], "on").labelled).toEqual({
      category: "bills",
      source: "rule",
      review: true,
      doubt: "transport",
    });
    expect(categorizeInStages(pay("জামাল Resturant"), [], "on").labelled).toMatchObject({
      category: "shopping",
      review: true,
      doubt: "food",
    });
  });

  it("a person's own correction always wins, even over a confident model", () => {
    const rules = [{ keyword: "car rental", category: "entertainment" as const }];
    expect(categorizeInStages(pay("Car Rental"), rules, "on").labelled).toEqual({
      category: "entertainment",
      source: "user",
      review: false,
    });
  });

  it("keyword matches the model agrees with are left alone", () => {
    expect(categorizeInStages(pay("Apollo Hospital"), [], "on").labelled).toEqual({
      category: "health",
      source: "rule",
      review: false,
    });
  });
});

describe("explaining a categorization", () => {
  const facts = (over: Record<string, unknown>) => ({
    tx: pay("Rahim Pharmasy"),
    categoryKey: "health",
    categorySource: "model" as const,
    needsReview: false,
    userRuleKeyword: null,
    anomaly: null,
    ...over,
  });

  it("says a model labelled it, with the parts of the name when they still agree", () => {
    const e = explainCategorization(facts({}));
    expect(e.kind).toBe("model");
    expect(e.factors?.length).toBeGreaterThan(0);
  });

  it("gives no reasons when the stored category no longer matches the model", () => {
    expect(explainCategorization(facts({ categoryKey: "food" }))).toEqual({ kind: "model" });
  });

  it("explains why a keyword match was queued for review", () => {
    const e = explainCategorization(
      facts({
        tx: pay("Car Rental"),
        categoryKey: "bills",
        categorySource: "rule",
        needsReview: true,
      }),
    );
    expect(e).toMatchObject({ kind: "keyword_doubt", keyword: "rent", suggested: "transport" });
  });

  it("still says keyword for a normal keyword match", () => {
    const e = explainCategorization(
      facts({ tx: pay("Apollo Hospital"), categorySource: "rule", categoryKey: "health" }),
    );
    expect(e.kind).toBe("keyword");
  });
});
