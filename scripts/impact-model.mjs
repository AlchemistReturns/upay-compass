// Unit-economics model for the pitch. Run: pnpm impact:model
//
// Everything here is either MEASURED from the simulated 120-day persona data (fixed end day, so the
// numbers are the same on every run) or an ASSUMPTION that is labelled as one and listed in
// ASSUMPTIONS below. Nothing is a finding about real users: the data is simulated, and the
// behaviour-change and retention rates are estimates to be replaced with measured values.
import { readFileSync, writeFileSync } from "node:fs";
import { PERSONAS, PERSONA_CONFIGS, generateTransactions } from "../adapters/upay-sim/src/index.ts";
import {
  categorize,
  detectRecurring,
  forecastCashflow,
  isEssentialCategory,
} from "../packages/shared/src/index.ts";

const END_DAY = "2026-10-02";
const DAYS = 120;
const MONTHS = DAYS / 30;
const NOW = new Date(`${END_DAY}T08:00:00Z`);

/** Every assumption in one place. Change a value here and every figure below follows. */
const ASSUMPTIONS = {
  manualSecondsPerTransaction: {
    value: 8,
    why: "time to open a notes app or sheet and file one payment by hand; estimate, not measured",
  },
  nudgeBehaviourShift: {
    values: [0.05, 0.1, 0.2],
    why: "share of cash-outs that would become digital payments after a prompt; estimate, not measured",
  },
  baselineRetention30: {
    value: 0.2,
    why: "share of new users still active after 30 days without the companion; placeholder, replace with upay's real figure",
  },
  retentionRelativeUplift: {
    values: [0.05, 0.1, 0.15],
    why: "relative increase in that share for users who get alerts, goals and a coach; estimate, not measured",
  },
  realCashOutsPerUserPerMonth: {
    values: [1, 3, 6],
    why: "hypothetical cash-outs per real user per month; placeholder, replace with upay's real frequency",
  },
  signUps: { value: 100_000, why: "illustrative cohort size for scaling the per-user figures" },
};

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const f1 = (n) => (Math.round(n * 10) / 10).toString();

const rows = [];
for (const persona of PERSONAS) {
  const txs = generateTransactions({ persona, endDay: END_DAY, days: DAYS });
  const flow = txs.map((t) => {
    const c = categorize(t);
    return {
      direction: t.direction,
      channel: t.channel,
      counterparty: t.counterparty,
      amount: t.amount,
      occurred_at: t.occurred_at,
      essential: c ? isEssentialCategory(c.category) : false,
    };
  });
  const net = flow.reduce((n, t) => n + (t.direction === "in" ? t.amount : -t.amount), 0);

  const cashOuts = txs.filter((t) => t.channel === "cash_out");
  const matched = txs.filter((t) => categorize(t) !== null).length;
  const bills = detectRecurring(flow, NOW).filter(
    (r) => r.direction === "out" && (r.cadence === "monthly" || r.channel === "bill"),
  );
  const stepDays = { weekly: 7, biweekly: 14, monthly: 30 };
  const forecast = forecastCashflow({
    now: NOW,
    balance: PERSONA_CONFIGS[persona].openingBalance + net,
    transactions: flow,
  });

  rows.push({
    persona,
    txs: txs.length,
    txPerMonth: txs.length / MONTHS,
    cashOutPerMonth: cashOuts.length / MONTHS,
    cashOutAmountPerMonth: cashOuts.reduce((n, t) => n + t.amount, 0) / MONTHS,
    autoShare: matched / txs.length,
    billRemindersPerMonth: bills.reduce((n, b) => n + 30 / stepDays[b.cadence], 0),
    lowBalanceDays: forecast.risks.length,
  });
}

const out = [];
const line = (s = "") => out.push(s);

line(`# Impact model (reproduce with \`pnpm impact:model\`)`);
line();
line(
  `Simulated data only: ${DAYS} days per persona ending ${END_DAY}, fixed seed. Same numbers on every run.`,
);
line();
line(`## A. Measured from the simulated data`);
line();
line(
  `| Persona | Payments / month | Cash-outs / month | Cash-out Rs / month | Auto-categorized | Bill reminders / month | Low-balance days (next 30) |`,
);
line(`|---|---|---|---|---|---|---|`);
for (const r of rows) {
  line(
    `| ${r.persona} | ${f1(r.txPerMonth)} | ${f1(r.cashOutPerMonth)} | ${Math.round(r.cashOutAmountPerMonth)} | ${pct(r.autoShare)} | ${f1(r.billRemindersPerMonth)} | ${r.lowBalanceDays} |`,
  );
}
line();
line(
  `Formulas: payments / month = transactions in the window / ${MONTHS}; auto-categorized = transactions matched by the keyword rules / all transactions (the rest go to the AI or to "Other" for review); bill reminders / month = sum over detected recurring bills of 30 / cadence days; low-balance days = days of the 30-day forecast below the safety buffer.`,
);

line();
line(`## B. Modelled, with labelled assumptions`);
line();
const man = ASSUMPTIONS.manualSecondsPerTransaction.value;
line(`### B1. Categorization time saved (assumption: ${man} s per payment by hand)`);
line();
line(`| Persona | Minutes saved / user / month |`);
line(`|---|---|`);
for (const r of rows) {
  line(`| ${r.persona} | ${f1((r.txPerMonth * r.autoShare * man) / 60)} |`);
}
line();
line(
  `Formula: payments / month x auto-categorized share x ${man} s / 60. ASSUMPTION: ${ASSUMPTIONS.manualSecondsPerTransaction.why}.`,
);

line();
line(`### B2. Cash-outs avoided if prompts change behaviour`);
line();
const shifts = ASSUMPTIONS.nudgeBehaviourShift.values;
line(
  `Measured in the simulated data: ${rows.map((r) => `${r.persona} ${f1(r.cashOutPerMonth)}`).join(", ")} cash-outs per user per month. The simulated personas barely cash out, so they cannot support a claim about cash-out reduction. The table below is a sensitivity analysis on a hypothetical real cash-out frequency; replace the first column with upay's real figure before quoting any number.`,
);
line();
const cashFreq = ASSUMPTIONS.realCashOutsPerUserPerMonth.values;
const cohort = ASSUMPTIONS.signUps.value;
line(
  `| Cash-outs per user / month (hypothetical) | ${shifts.map((x) => `avoided per ${cohort.toLocaleString("en-US")} users at ${pct(x)}`).join(" | ")} |`,
);
line(`|---|${shifts.map(() => "---").join("|")}|`);
for (const c of cashFreq) {
  line(
    `| ${c} | ${shifts.map((x) => Math.round(cohort * c * x).toLocaleString("en-US")).join(" | ")} |`,
  );
}
line();
line(
  `Formula: users x cash-outs per user per month x behaviour-shift rate, per month. Cash-out value and fees are not modelled (no upay fee data). ASSUMPTIONS: ${ASSUMPTIONS.nudgeBehaviourShift.why}; ${ASSUMPTIONS.realCashOutsPerUserPerMonth.why}.`,
);

line(`### B3. Engagement uplift (assumption: baseline and uplift below)`);
line();
const r0 = ASSUMPTIONS.baselineRetention30.value;
const n = ASSUMPTIONS.signUps.value;
const ups = ASSUMPTIONS.retentionRelativeUplift.values;
line(
  `| Relative uplift | 30-day retention | Extra retained users per ${n.toLocaleString("en-US")} sign-ups |`,
);
line(`|---|---|---|`);
line(`| none (baseline) | ${pct(r0)} | 0 |`);
for (const u of ups) {
  line(`| +${pct(u)} | ${pct(r0 * (1 + u))} | ${Math.round(n * r0 * u).toLocaleString("en-US")} |`);
}
line();
line(
  `Formula: retention = baseline x (1 + uplift); extra users = sign-ups x baseline x uplift. ASSUMPTIONS: baseline ${pct(r0)} (${ASSUMPTIONS.baselineRetention30.why}); uplift range (${ASSUMPTIONS.retentionRelativeUplift.why}); ${ASSUMPTIONS.signUps.why}.`,
);

line();
line(`## Assumptions at a glance`);
line();
line(`- Manual categorization: ${man} s per payment.`);
line(
  `- Prompt-to-behaviour change: ${shifts.map(pct).join(", ")} of cash-outs; real cash-out frequency ${cashFreq.join(", ")} per user per month (hypothetical).`,
);
line(`- Baseline 30-day retention ${pct(r0)}; uplift ${ups.map(pct).join(", ")} relative.`);
line(
  `- None of these is a finding. They are placeholders to be replaced with measured values from a pilot.`,
);

const report = out.join("\n");

// `--update` writes the report into docs/pitch/impact-metrics.md between the markers;
// `--check` fails if the document no longer matches what the script produces.
const DOC = new URL("../docs/pitch/impact-metrics.md", import.meta.url);
const START = "<!-- impact-model:start -->";
const END = "<!-- impact-model:end -->";
const block = `${START}\n\n${report.replace(/^# .*\n\n/, "")}\n\n${END}`;

if (process.argv.includes("--update") || process.argv.includes("--check")) {
  const doc = readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start < 0 || end < start) {
    console.error(`markers ${START} ... ${END} not found in docs/pitch/impact-metrics.md`);
    process.exit(1);
  }
  const next = doc.slice(0, start) + block + doc.slice(end + END.length);
  if (process.argv.includes("--update")) {
    writeFileSync(DOC, next);
    console.log("docs/pitch/impact-metrics.md updated");
  } else if (next !== doc) {
    console.error("docs/pitch/impact-metrics.md is out of date: run `pnpm impact:model --update`");
    process.exit(1);
  } else {
    console.log("impact-metrics.md matches the model output");
  }
} else {
  console.log(report);
}
