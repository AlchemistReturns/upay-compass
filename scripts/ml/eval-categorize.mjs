// Benchmarks the merchant categorizer. Run: pnpm eval:categorize
//
// Two questions, on a generated labelled set (see packages/shared/src/ml/data/merchants.ts):
//  1. New spellings, owners, places and notes of shop types the model knows (random split).
//  2. Shop types and brands whose names the model has never seen (grouped cross-validation).
// Only the merchants the keyword rules cannot label are scored, because those are the ones the
// model (or the AI fallback) has to handle.
import {
  buildExamples,
  chooseThreshold,
  groupedCrossValidation,
  predictAll,
  statsAt,
  train,
  unitHash,
} from "../../packages/shared/src/index.ts";

const examples = buildExamples();
const missed = examples.filter((e) => e.ruleMiss);
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const lines = [];
const out = (s = "") => lines.push(s);

// Rules alone, on everything.
const ruleLabelled = examples.filter((e) => !e.ruleMiss);
const ruleRight = ruleLabelled.filter((e) => e.ruleLabel === e.label).length;
out(
  `Set: ${examples.length} generated merchant names. The keyword rules label ${ruleLabelled.length} (${pct(ruleLabelled.length / examples.length)}), and are right on ${pct(ruleRight / ruleLabelled.length)} of those. They give no answer for the other ${missed.length}, which would go to the AI.`,
);
out();

// 1. Random split by full name: same shop types, new combinations.
const key = (e) => `${e.counterparty}|${e.note}|${e.channel}`;
const isTest = (e) => unitHash(key(e)) >= 0.8;
const trainA = examples.filter((e) => !isTest(e));
const testA = examples.filter((e) => isTest(e));
const modelA = train(trainA);
const predA = predictAll(modelA, testA);

// 2. Grouped cross-validation: every shop type held out in turn.
const predB = groupedCrossValidation(examples, 4);

out(
  `| Situation | Threshold | Rule misses scored | Labelled by the model | Right, of those labelled |`,
);
out(`|---|---|---|---|---|`);
for (const threshold of [0.5, 0.7, 0.9]) {
  const a = statsAt(testA, predA, threshold);
  out(
    `| New names of known shop types | ${threshold} | ${testA.filter((e) => e.ruleMiss).length} | ${pct(a.coverage)} | ${pct(a.precision)} |`,
  );
}
for (const threshold of [0.5, 0.7, 0.9]) {
  const b = statsAt(examples, predB, threshold);
  out(
    `| Shop types never seen | ${threshold} | ${missed.length} | ${pct(b.coverage)} | ${pct(b.precision)} |`,
  );
}
out();

const chosenA = chooseThreshold(testA, predA, 0.95);
out(
  `Threshold for 95% precision on new names of known shop types: ${chosenA.threshold} (labels ${pct(chosenA.coverage)} of the rule misses at ${pct(chosenA.precision)}).`,
);
const chosenB = chooseThreshold(examples, predB, 0.95);
out(
  `Threshold for 95% precision on never-seen shop types: ${chosenB.threshold} (labels ${pct(chosenB.coverage)} at ${pct(chosenB.precision)}).`,
);
out();

// What the whole flow does with the rule misses in the "known shop types" case.
const aiBefore = testA.filter((e) => e.ruleMiss).length;
const accepted = statsAt(testA, predA, chosenA.threshold).accepted;
out(
  `In that situation the AI fallback would be asked about ${aiBefore - accepted} of ${aiBefore} rule-missed merchants instead of all ${aiBefore} (${pct(accepted / aiBefore)} fewer calls).`,
);

// Per-class view for the known-shop-types case.
out();
out(
  `Per category, new names of known shop types (rule misses only, no threshold, "other" counts as no answer):`,
);
out();
out(`| Category | Examples | Recall | Precision |`);
out(`|---|---|---|---|`);
const classes = [...new Set(testA.map((e) => e.label))].sort();
for (const c of classes) {
  const rows = testA.map((e, i) => [e, predA[i]]).filter(([e]) => e.ruleMiss);
  const truth = rows.filter(([e]) => e.label === c);
  const said = rows.filter(([, p]) => p.predicted === c);
  const rightN = truth.filter(([, p]) => p.predicted === c).length;
  out(
    `| ${c} | ${truth.length} | ${truth.length ? pct(rightN / truth.length) : "-"} | ${said.length ? pct(rightN / said.length) : "-"} |`,
  );
}
// Second opinion on keyword matches: where the rules matched a keyword and the model confidently
// says something else, the transaction could be queued for review instead of trusted.
{
  const SECOND = 0.9;
  const rows = testA.map((e, i) => [e, predA[i]]).filter(([e]) => e.ruleBy === "keyword");
  const wrong = rows.filter(([e]) => e.ruleLabel !== e.label);
  const flagged = rows.filter(
    ([e, p]) => p.predicted !== "other" && p.probability >= SECOND && p.predicted !== e.ruleLabel,
  );
  const caught = flagged.filter(([e]) => e.ruleLabel !== e.label);
  out();
  out(
    `Second opinion on keyword matches (new names of known shop types, model confidence at least ${SECOND}):`,
  );
  out();
  out(
    `- Keyword matches scored: ${rows.length}; wrong ${wrong.length} (${pct(wrong.length / rows.length)}).`,
  );
  out(
    `- Model disagrees confidently on ${flagged.length}; ${caught.length} of those are really wrong (${pct(caught.length / Math.max(1, flagged.length))} precision), catching ${pct(caught.length / Math.max(1, wrong.length))} of the wrong matches.`,
  );
  out(
    `- Correct matches wrongly questioned: ${flagged.length - caught.length} of ${rows.length - wrong.length}.`,
  );
}
console.log(lines.join("\n"));
