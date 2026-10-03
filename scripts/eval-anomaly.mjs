// Unusual-payment detection evaluation. Run: pnpm eval:anomaly
//
// Injects known anomalies (a food payment at 8x, 9x and 10x the typical one, one per persona per
// month) into a copy of the simulated data and measures, on the same data, how many each method
// finds and how often each raises an alert on the unmodified data. Compares the shipped detector,
// a category-and-weekday-only variant and the old flat rule. Deterministic: five fixed seeds, fixed end day.
import { evaluateAll, EVAL_SEEDS } from "../adapters/upay-sim/src/anomaly-eval.ts";

const END_DAY = "2026-10-02";
const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`);

const results = evaluateAll(END_DAY);
const sum = (k) => results.reduce((n, r) => n + r[k], 0);

const lines = [];
lines.push(`# Unusual-payment detection: injected-anomaly evaluation`);
lines.push("");
lines.push(
  `Simulated data only: 120 days per persona ending ${END_DAY}, ${EVAL_SEEDS.length} fixed seeds. One food payment at 8x, 9x and 10x the typical food payment is injected per persona per month (days 75, 45 and 15 before the end), at a merchant the person already uses. False alarms are counted on the unmodified data over its last 90 days.`,
);
lines.push("");
lines.push(
  `| Persona | Injected | Old flat rule finds | Category-weekday only finds | Shipped detector finds | Flat-rule alerts on clean data | Category-weekday alerts on clean data | Shipped alerts on clean data |`,
);
lines.push(`|---|---|---|---|---|---|---|---|`);
const cell = (r, k) => `${r[k]} (${pct(r[k], r.injected)})`;
for (const r of results) {
  lines.push(
    `| ${r.persona} | ${r.injected} | ${cell(r, "flatDetected")} | ${cell(r, "catDetected")} | ${cell(r, "statDetected")} | ${r.flatAlerts} | ${r.catAlerts} | ${r.statAlerts} |`,
  );
}
const all = {
  injected: sum("injected"),
  flatDetected: sum("flatDetected"),
  catDetected: sum("catDetected"),
  statDetected: sum("statDetected"),
};
lines.push(
  `| **all** | ${all.injected} | ${cell(all, "flatDetected")} | ${cell(all, "catDetected")} | ${cell(all, "statDetected")} | ${sum("flatAlerts")} | ${sum("catAlerts")} | ${sum("statAlerts")} |`,
);
const personaMonths = (results[0].days / 30) * EVAL_SEEDS.length * results.length;
const perMonth = (k) => (sum(k) / personaMonths).toFixed(2);
lines.push("");
lines.push(
  `False alarms per persona per month on the unmodified data: old flat rule ${perMonth("flatAlerts")}, category-weekday only ${perMonth("catAlerts")}, shipped detector ${perMonth("statAlerts")} (${pct(sum("statAlerts"), sum("cleanPayments"))} of ${sum("cleanPayments")} payments).`,
);
lines.push("");
lines.push(
  `How to read it: "finds" counts an injected payment as found when the method raises an alert for it (the detectors for that exact payment; the flat rule for that category's week). Every alert on the unmodified data is counted as a false alarm, because nothing was injected there. The sample is small (${sum("injected")} injected payments) and the data is simulated, so treat the rates as a sanity check, not a measurement of real users.`,
);
console.log(lines.join("\n"));
