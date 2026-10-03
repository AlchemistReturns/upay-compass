// "Made for you" learn modules: persona evaluation. Run: pnpm eval:learn  (add --write to update
// docs/pitch/learn-personalization-report.md). Needs Node 23.6 or later (runs TypeScript directly).
//
// Runs the three simulated personas (Student, Gig worker, Salaried; 120 days, fixed end day, so the
// output is the same on every run) through the same steps the Edge Function takes: score snapshot,
// readiness, forecast, alerts, then buildLearnSignals and pickPersonalizedTopics. Prints which
// topics each persona gets and why, and fails if all three get the same set. No model is called:
// the style check compares the recorded fixture modules with the eight hand-written ones.
import { readFileSync, writeFileSync } from "node:fs";
import { generateTransactions } from "../adapters/upay-sim/src/generate.ts";
import { PERSONAS, PERSONA_CONFIGS } from "../adapters/upay-sim/src/personas.ts";
import {
  addDays,
  buildLearnSignals,
  buildModuleFacts,
  categorize,
  computeHealthScore,
  computeReadiness,
  detectAnomalies,
  detectRecurring,
  dhakaDay,
  forecastCashflow,
  generateNudges,
  isEssentialCategory,
  measureMarkdown,
  pickPersonalizedTopics,
  projectGoal,
  renderModuleMarkdown,
  validateGeneratedModule,
  topicById,
} from "../packages/shared/src/index.ts";
import { parseLearnContentSql } from "../packages/shared/src/learn-content.ts";
import {
  BUFFER_FACTS,
  GOOD_BUFFER_BN,
  GOOD_BUFFER_EN,
  GOOD_INVESTING_EN,
  INVESTING_FACTS,
} from "../packages/shared/src/learn-fixtures.ts";

const END_DAY = "2026-10-02";
const NOW = new Date(`${END_DAY}T08:00:00Z`);
const today = END_DAY;
const DAY = 86_400_000;
const LABEL = { student: "Student", gig: "Gig worker", salaried: "Salaried" };

/**
 * Wallet starting balance for a history (same rule as walletOpeningBalance in the simulator; copied
 * because the simulator's index uses syntax plain type stripping cannot run).
 */
function openingBalance(persona, txs) {
  const sorted = [...txs].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let running = 0;
  let lowest = 0;
  for (const t of sorted) {
    running += t.direction === "in" ? t.amount : -t.amount;
    lowest = Math.min(lowest, running);
  }
  return Math.max(PERSONA_CONFIGS[persona].openingBalance, Math.ceil((-lowest + 300) / 50) * 50);
}

/** The health_inputs() SQL function, in TypeScript, over the simulated history. */
function healthInputs(txs, balance) {
  const first = Math.min(...txs.map((t) => Date.parse(t.occurred_at)));
  const historyDays = Math.min(90, Math.max(1, Math.ceil((NOW.getTime() - first) / DAY)));
  const since = NOW.getTime() - historyDays * DAY;
  let income = 0;
  let spend = 0;
  let essentialSpend = 0;
  for (const t of txs) {
    if (Date.parse(t.occurred_at) < since) continue;
    if (t.direction === "in") income += t.amount;
    else if (t.category !== "savings") {
      spend += t.amount;
      if (isEssentialCategory(t.category)) essentialSpend += t.amount;
    }
  }
  // income per complete calendar month (Bangladesh time), newest first, after the first month
  const month = (iso) => dhakaDay(iso).slice(0, 7);
  const firstMonth = month(new Date(first).toISOString());
  const thisMonth = today.slice(0, 7);
  const byMonth = new Map();
  for (const t of txs) {
    if (t.direction !== "in") continue;
    const m = month(t.occurred_at);
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
  }
  const months = [];
  for (let d = `${thisMonth}-01`; months.length < 3;) {
    d = addDays(d, -1).slice(0, 8) + "01";
    const m = d.slice(0, 7);
    if (m <= firstMonth) break;
    months.push(byMonth.get(m) ?? 0);
  }
  return {
    txCount: txs.length,
    historyDays,
    income,
    spend,
    essentialSpend,
    incomeBuckets: months,
    balance,
    budgets: [],
  };
}

function personaSignals(persona) {
  const raw = generateTransactions({ persona, endDay: END_DAY, days: 120 });
  const txs = raw.map((t, i) => ({
    ...t,
    id: `${persona}-${i}`,
    category: categorize(t)?.category ?? "other",
  }));
  const flow = txs.map((t) => ({
    direction: t.direction,
    channel: t.channel,
    counterparty: t.counterparty,
    amount: t.amount,
    occurred_at: t.occurred_at,
    essential: isEssentialCategory(t.category),
  }));
  const net = txs.reduce((n, t) => n + (t.direction === "in" ? t.amount : -t.amount), 0);
  const balance = openingBalance(persona, raw) + net;

  const health = computeHealthScore(healthInputs(txs, balance));
  const forecast = forecastCashflow({ now: NOW, balance, transactions: flow });

  // the demo account's goal: "Phone fund", Rs 1,500 saved today (reset-demo), no target date
  const goal = projectGoal({
    target: 15000,
    saved: 1500,
    targetDate: null,
    contributions: [{ amount: 1500, created_at: NOW.toISOString() }],
    now: NOW,
  });
  const readiness = computeReadiness({
    txCount: txs.length,
    historyDays: health.confidence === "ok" ? 90 : 30,
    incomeBuckets: healthInputs(txs, balance).incomeBuckets,
    budgets: [],
    transactions: flow,
    now: NOW,
    savingsMonths: [0, 1, 2, 3, 4, 5].map((i) => ({ month: `m${i}`, active: i === 0 })),
    firstDay: dhakaDay(raw[0].occurred_at),
  });

  // unread alerts the app would hold: the rule-driven ones and unusual payments of the last week
  const nudges = generateNudges({
    today,
    categoryWeekly: [],
    goals: [{ id: "g", title: "Phone fund", targetDate: null, ageDays: 0, projection: goal }],
    recurring: detectRecurring(flow, NOW),
    forecast,
  }).map((n) => n.type);
  const unusual = detectAnomalies(txs, { candidateFrom: addDays(today, -6) }, NOW).length
    ? ["unusual_transaction"]
    : [];

  const signals = buildLearnSignals({
    incomeType: persona,
    health,
    readiness,
    budgets: [],
    goalStatuses: [goal.status],
    unreadNudges: [...new Set([...nudges, ...unusual])],
    forecast: { insufficient: forecast.insufficient, today: forecast.today, risks: forecast.risks },
  });
  return { signals, health, readiness };
}

const lines = [];
const out = (s = "") => lines.push(s);
const sets = [];

out("# Made for you: persona evaluation");
out("");
out(
  `Simulated data only: 120 days per persona ending ${END_DAY}, no budgets, the demo "Phone fund" goal. Signals are built the way the Edge Function builds them; topics are picked by \`pickPersonalizedTopics\` (threshold 0.4, at most 3, one per category first). No model is called. Regenerate with \`pnpm eval:learn -- --write\`.`,
);
out("");
out(
  "| Persona | Health score (savings / budget / buffer / stability) | Topics picked (score, reason) |",
);
out("|---|---|---|");
for (const persona of PERSONAS) {
  const { signals, health } = personaSignals(persona);
  const picks = pickPersonalizedTopics(signals, [], NOW);
  sets.push(picks.map((p) => p.topic.id).join(","));
  const c = health.components;
  const parts = ["savings", "budget", "buffer", "stability"]
    .map((k) => (c[k].available ? Math.round(c[k].score) : "n/a"))
    .join(" / ");
  const topics = picks.length
    ? picks.map((p) => `\`${p.topic.id}\` (${p.score}, ${p.reason})`).join("<br>")
    : "none";
  out(`| ${LABEL[persona]} | ${Math.round(health.score)} (${parts}) | ${topics} |`);
}
out("");
out("Facts sent to the model for each persona's first topic (numbers and ids only):");
out("");
for (const persona of PERSONAS) {
  const { signals } = personaSignals(persona);
  const top = pickPersonalizedTopics(signals, [], NOW)[0];
  if (top)
    out(
      `- ${LABEL[persona]}, \`${top.topic.id}\`: \`${JSON.stringify(buildModuleFacts(top.topic, signals))}\``,
    );
}

const distinct = new Set(sets).size;
out("");
out(
  `Distinct topic sets across the three personas: **${distinct} of 3**. ${distinct > 1 ? "The personas do not all get the same lessons." : "FAIL: all three personas got the same set."}`,
);

// ------------------------------------------------------------------ style check (no model)
const course = parseLearnContentSql(
  readFileSync(
    new URL("../supabase/migrations/20261003090100_phase5_learn_content.sql", import.meta.url),
    "utf8",
  ),
);
const words = (md) => measureMarkdown(md).words;
out("");
out("## Style check: recorded fixtures next to the hand-written modules");
out("");
out("| Module | Lang | Body words | Sections | Longest sentence |");
out("|---|---|---|---|---|");
for (const m of course) {
  for (const lang of ["en", "bn"]) {
    const ms = measureMarkdown(m.body[lang]);
    out(
      `| ${m.slug} (course) | ${lang} | ${ms.words} | ${ms.sections.length - 1} | ${Math.max(...ms.sentenceWords)} |`,
    );
  }
}
const fixtures = [
  ["buffer_in_days fixture", "en", GOOD_BUFFER_EN, BUFFER_FACTS, "buffer_in_days"],
  ["buffer_in_days fixture", "bn", GOOD_BUFFER_BN, BUFFER_FACTS, "buffer_in_days"],
  ["beyond_basics fixture", "en", GOOD_INVESTING_EN, INVESTING_FACTS, "beyond_basics"],
];
let fixtureFail = false;
for (const [name, lang, mod, facts, topic] of fixtures) {
  const ms = measureMarkdown(renderModuleMarkdown(mod, lang));
  const ok = validateGeneratedModule(mod, facts, topicById(topic), lang).ok;
  if (!ok) fixtureFail = true;
  out(
    `| ${name} | ${lang} | ${ms.words} | ${ms.sections.length - 1} | ${Math.max(...ms.sentenceWords)} |`,
  );
}
out("");
out(
  "The fixtures were written by hand to the prompt; live model output still has to be checked once the function is deployed (see the checklist in docs/PROJECT_STATE.md).",
);

const report = lines.join("\n") + "\n";
console.log(report);
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/pitch/learn-personalization-report.md", import.meta.url), report);
  console.log("Wrote docs/pitch/learn-personalization-report.md");
}
if (distinct < 2 || fixtureFail) process.exit(1);
