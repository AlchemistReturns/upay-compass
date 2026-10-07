// Benchmarks the isolation-forest anomaly score against the statistical rule. Run: pnpm eval:anomaly:ml
//
// ANOMALY_SPLIT (default "holdout"): "dev" is for tuning the threshold, "holdout" for the numbers
// to report. Simulated data only: 150 days per person, five kinds of injected payment.
import {
  ANOMALY_KINDS,
  both,
  byExcess,
  byRule,
  byScore,
  either,
  makeAnomalyPeople,
  outcomeOf,
  scoreScenarios,
} from "../../adapters/upay-sim/src/index.ts";

const split = process.env.ANOMALY_SPLIT ?? "holdout";
const count = Number(process.env.ANOMALY_PEOPLE ?? 30);
const END_DAY = "2026-10-02";
const people = makeAnomalyPeople(split, count, END_DAY);
const scored = scoreScenarios(people, END_DAY);
const pct = (n, d) => (d === 0 ? "-" : `${((n / d) * 100).toFixed(0)}%`);

const scores = (process.env.SCORES ?? "0.6,0.65,0.7").split(",").map(Number);
const excesses = (process.env.EXCESSES ?? "0,0.02,0.05,0.08").split(",").map(Number);
const methods = [["statistical rule", byRule]];
for (const t of scores) methods.push([`model, absolute score >= ${t}`, byScore(t)]);
for (const d of excesses)
  methods.push([`model, above the person's own 99th percentile by ${d}`, byExcess(d)]);
for (const d of excesses)
  methods.push([`rule or model (own percentile + ${d})`, either(byRule, byExcess(d))]);
for (const t of scores) methods.push([`rule or model (score >= ${t})`, either(byRule, byScore(t))]);

console.log(`## ${split} people (${people.length}), ${END_DAY}\n`);
console.log(
  `| Method | ${ANOMALY_KINDS.join(" | ")} | All injected | False alarms per person-month | Share of clean payments flagged |`,
);
console.log(`|---|${ANOMALY_KINDS.map(() => "---").join("|")}|---|---|---|`);
for (const [name, flagger] of methods) {
  const r = outcomeOf(scored, flagger);
  const total = ANOMALY_KINDS.reduce((n, k) => n + r.injected[k], 0);
  const found = ANOMALY_KINDS.reduce((n, k) => n + r.detected[k], 0);
  console.log(
    `| ${name} | ${ANOMALY_KINDS.map((k) => pct(r.detected[k], r.injected[k])).join(" | ")} | ${pct(found, total)} | ${(r.falseAlarms / r.personMonths).toFixed(2)} | ${pct(r.falseAlarms, r.cleanPayments)} |`,
  );
}
void both;
