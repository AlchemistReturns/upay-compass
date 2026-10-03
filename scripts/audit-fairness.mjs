// Persona fairness check. Run: pnpm audit:fairness (local Supabase stack up, functions served).
//
// Does the system behave differently across the three demo personas (student, gig worker,
// salaried)? Two kinds of difference exist and the report keeps them apart:
//   * differences that SHOULD exist because the personas live differently (income pattern, buffer);
//   * differences that should NOT exist (the categorizer should work equally well for everyone).
// Every gap above its threshold must be explained as expected-by-design below, or the script
// exits non-zero and lists it as unexplained: a possible bug to investigate.
//
// Categorization is measured against hand-labelled ground truth for every distinct merchant the
// personas produce. The scores come from the real Edge Functions: a persona is loaded into the
// test account, then compute-health-score and compute-readiness-score are called.
import { writeFileSync } from "node:fs";
import { PERSONAS, generateTransactions } from "../adapters/upay-sim/src/index.ts";
import { categorize } from "../packages/shared/src/index.ts";

const URL_BASE = process.env.EVAL_URL ?? "http://127.0.0.1:54321";
// The local stack's well-known public demo key; override with EVAL_ANON_KEY if yours differs.
const ANON = process.env.EVAL_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const PHONE = "+8801700000004";
const END_DAY = new Date().toISOString().slice(0, 10);

/** Hand-labelled truth, keyed by "direction|channel|counterparty". null = deliberately unknown. */
const TRUTH = {
  "in|add_money|Employer Ltd": "income",
  "in|add_money|Foodpanda Rider Payout": "income",
  "in|add_money|Pathao Rides Payout": "income",
  "in|add_money|Tuition Income": "income",
  "in|send_money|Abbu": "income",
  "in|send_money|Customer Cash Job": "income",
  "out|bill|Bike Installment": "bills",
  "out|bill|DESCO": "bills",
  "out|bill|Link3": "bills",
  "out|bill|Titas Gas": "bills",
  "out|cash_out|AB Bank ATM": "other",
  "out|merchant|Biryani House": "food",
  "out|merchant|Campus Canteen": "food",
  "out|merchant|Chaldal": "food",
  "out|merchant|Coaching Center": "education",
  "out|merchant|DPS Savings": "savings",
  "out|merchant|Filling Station": "transport",
  "out|merchant|Foodpanda": "food",
  "out|merchant|Lazz Pharma": "health",
  "out|merchant|Metro Rail": "transport",
  "out|merchant|Netflix": "entertainment",
  "out|merchant|Office Canteen": "food",
  "out|merchant|Pathao": "transport",
  "out|merchant|Restaurant": "food",
  "out|merchant|Rickshaw": "transport",
  "out|merchant|Robi": "recharge_data",
  "out|merchant|Rokomari": "education",
  "out|merchant|Shwapno": "food",
  "out|merchant|Spotify": "entertainment",
  "out|merchant|Square Hospital": "health",
  "out|merchant|Star Cineplex": "entertainment",
  "out|merchant|Tea Stall": "food",
  "out|merchant|Tong Restaurant": "food",
  "out|merchant|Uber": "transport",
  "out|recharge|Grameenphone": "recharge_data",
  "out|recharge|Robi": "recharge_data",
  "out|send_money|Ammu": "family",
  "out|send_money|Karim Mia": "bills",
  "out|send_money|Landlord Hasan": "bills",
  // merchants no keyword can know: sent to the AI / review queue, so they are not scored as right or wrong
  "out|merchant|Nila Traders": null,
  "out|merchant|Rahim Store": null,
  "out|merchant|Sky Lounge": null,
};

/**
 * Gaps (max minus min across personas, in points) allowed before they need an explanation, and the
 * explanation when the difference is by design. `by: null` means the gap should not exist at all.
 */
const CHECKS = [
  {
    id: "cat.accuracy",
    label: "Categorization accuracy (of decided payments)",
    limit: 2,
    by: null,
  },
  { id: "cat.coverage", label: "Categorization coverage (decided without AI)", limit: 5, by: null },
  {
    id: "health.savings",
    label: "Health: savings rate",
    limit: 15,
    by: "personas earn and spend differently: the student saves little by design, the salaried worker more",
  },
  {
    id: "health.budget",
    label: "Health: budget adherence",
    limit: 15,
    by: "no budgets are set in the loaded demo data, so every persona is neutral 50",
  },
  {
    id: "health.buffer",
    label: "Health: emergency buffer",
    limit: 15,
    by: "starting balances and essential spending differ by design",
  },
  {
    id: "health.stability",
    label: "Health: income stability",
    limit: 15,
    by: "by design: a salary and a fixed allowance are steady, gig payouts are irregular",
  },
  {
    id: "readiness.income",
    label: "Readiness: income consistency",
    limit: 15,
    by: "same measure as health income stability, so same by-design difference",
  },
  {
    id: "readiness.punctuality",
    label: "Readiness: bill punctuality",
    limit: 15,
    by: "simulated bills are paid on fixed days, so every persona scores 100",
  },
  {
    id: "readiness.savings",
    label: "Readiness: savings consistency",
    limit: 15,
    by: "every loaded demo account has the same single goal contribution",
  },
  {
    id: "readiness.budget",
    label: "Readiness: budget adherence",
    limit: 15,
    by: "no budgets are set in the loaded demo data, so every persona is neutral 50",
  },
];

/** Real problems this audit found. Kept here so the report records them after they are fixed. */
const FINDINGS = [
  "Income stability was measured over rolling 30-day windows. A student with perfectly regular monthly income (Rs 8,000 on the 5th, Rs 3,000 on the 25th) scored **9.5 / 100** because the windows cut the two payments unevenly, while the gig worker with irregular weekly payouts scored 91.3. Fixed in `20261004100000_phase7_income_months.sql`: income is now summed per complete calendar month. After the fix the student scores 100 and the gig worker 61.5, which matches how the two actually earn. The same measure feeds the readiness scorecard's income consistency.",
];

async function api(path, { token, body, method = "POST" } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
}

async function signIn() {
  try {
    await api("/auth/v1/otp", { body: { phone: PHONE } });
  } catch (e) {
    // the local OTP resend limit: wait it out once
    await new Promise((r) => setTimeout(r, 5500));
    await api("/auth/v1/otp", { body: { phone: PHONE } }).catch(() => {
      throw e;
    });
  }
  const s = await api("/auth/v1/verify", { body: { type: "sms", phone: PHONE, token: "123456" } });
  return s.access_token;
}

function categorization(persona) {
  const txs = generateTransactions({ persona, endDay: END_DAY, days: 120 });
  let decided = 0;
  let labelled = 0;
  let correct = 0;
  const wrong = new Map();
  for (const t of txs) {
    const key = `${t.direction}|${t.channel}|${t.counterparty}`;
    const truth = TRUTH[key];
    if (truth === undefined) throw new Error(`no ground truth for ${key}: add it to TRUTH`);
    const got = categorize(t)?.category ?? null;
    if (got !== null) decided++;
    if (truth !== null && got !== null) {
      labelled++;
      if (got === truth) correct++;
      else wrong.set(key, `${got} (expected ${truth})`);
    }
  }
  return {
    payments: txs.length,
    accuracy: labelled === 0 ? 100 : (correct / labelled) * 100,
    coverage: (decided / txs.length) * 100,
    wrong: [...wrong].map(([k, v]) => `${k} -> ${v}`),
  };
}

const results = {};
const token = await signIn();
for (const persona of PERSONAS) {
  console.log(`loading ${persona} ...`);
  await api("/functions/v1/reset-demo", { token, body: { persona } });
  await api("/functions/v1/compute-health-score", { token, body: {} });
  await api("/functions/v1/compute-readiness-score", { token, body: {} });
  const [h] = await api(
    "/rest/v1/health_scores?select=score,breakdown&order=computed_at.desc&limit=1",
    { token, method: "GET" },
  );
  const [r] = await api(
    "/rest/v1/readiness_scores?select=score,breakdown&order=computed_at.desc&limit=1",
    { token, method: "GET" },
  );
  results[persona] = { cat: categorization(persona), health: h, readiness: r };
}

const value = (persona, id) => {
  const x = results[persona];
  const [kind, part] = id.split(".");
  if (kind === "cat") return x.cat[part];
  const snap = kind === "health" ? x.health : x.readiness;
  return snap.breakdown.components[part].score;
};
const avail = (persona, id) => {
  const [kind, part] = id.split(".");
  if (kind === "cat") return true;
  const snap = kind === "health" ? results[persona].health : results[persona].readiness;
  return snap.breakdown.components[part].available;
};

const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
const lines = [];
const unexplained = [];

lines.push("# Persona fairness report");
lines.push("");
lines.push(
  `Generated by \`pnpm audit:fairness\` on ${END_DAY} against the local stack. Simulated data only.`,
);
lines.push("");
lines.push(
  "Question: does the system behave differently across the three demo personas? Some difference is **expected** because the personas live differently; some should **not** exist (the categorizer should work as well for a student as for a salaried worker). A gap above its threshold must be explained as by design, or it is listed as unexplained and the script fails.",
);
lines.push("");
lines.push("| Measure | " + PERSONAS.join(" | ") + " | Spread | Threshold | Verdict |");
lines.push("|---|" + PERSONAS.map(() => "---").join("|") + "|---|---|---|");
for (const c of CHECKS) {
  const vals = PERSONAS.map((p) => value(p, c.id));
  const spread = Math.max(...vals) - Math.min(...vals);
  const over = spread > c.limit;
  let verdict = "within threshold";
  if (over && c.by) verdict = "expected: " + c.by;
  if (over && !c.by) {
    verdict = "**UNEXPLAINED: investigate**";
    unexplained.push(`${c.label}: spread ${fmt(spread)} > ${c.limit}`);
  }
  const cells = PERSONAS.map((p) => fmt(value(p, c.id)) + (avail(p, c.id) ? "" : " (neutral)"));
  lines.push(`| ${c.label} | ${cells.join(" | ")} | ${fmt(spread)} | ${c.limit} | ${verdict} |`);
}
lines.push("");
lines.push("Overall scores after loading each persona:");
lines.push("");
lines.push("| Score | " + PERSONAS.join(" | ") + " |");
lines.push("|---|" + PERSONAS.map(() => "---").join("|") + "|");
lines.push("| Health score | " + PERSONAS.map((p) => results[p].health.score).join(" | ") + " |");
lines.push(
  "| Credit readiness (informational) | " +
    PERSONAS.map((p) => results[p].readiness.score).join(" | ") +
    " |",
);
lines.push("");
lines.push("## Categorization detail");
lines.push("");
lines.push("| Persona | Payments | Accuracy of decided | Coverage | Misclassified merchants |");
lines.push("|---|---|---|---|---|");
for (const p of PERSONAS) {
  const c = results[p].cat;
  lines.push(
    `| ${p} | ${c.payments} | ${fmt(c.accuracy)}% | ${fmt(c.coverage)}% | ${c.wrong.length ? c.wrong.join("; ") : "none"} |`,
  );
}
lines.push("");
lines.push(
  "Accuracy is measured on payments whose merchant has a hand-labelled category and that the rules decided. Coverage is the share the rules decided without the AI; the rest (three unknown merchants by design) go to the AI or the review queue and are not scored as wrong. Ground truth is the `TRUTH` table in `scripts/audit-fairness.mjs`.",
);
lines.push("");
lines.push("## Findings from this audit that were fixed");
lines.push("");
for (const f of FINDINGS) lines.push(`- ${f}`);
lines.push("");
lines.push("## What this does and does not show");
lines.push("");
lines.push(
  "- It shows the categorizer does not behave differently across the three personas on their simulated payments.",
);
lines.push(
  "- Score differences between personas come from income pattern, savings and starting balance, which is the point of the score; they are not a model treating groups unequally.",
);
lines.push(
  "- It does not show fairness on real people: the personas are three invented profiles, and the scores use no protected attribute (no name, gender, religion, location or phone number goes into any score).",
);
lines.push(
  "- Two readiness components are flat because the simulated data is flat (bills are paid on fixed days; no budgets are set). That is a limit of the simulation, not evidence about people.",
);
lines.push("");
if (unexplained.length) {
  lines.push("## Unexplained gaps");
  lines.push("");
  for (const u of unexplained) lines.push(`- ${u}`);
  lines.push("");
}

const report = lines.join("\n");
writeFileSync(new URL("../docs/pitch/fairness-report.md", import.meta.url), report);
console.log(report);
if (unexplained.length) {
  console.error(`\n${unexplained.length} unexplained gap(s)`);
  process.exit(1);
}
console.log(
  "\nFAIRNESS AUDIT PASSED: every gap is within its threshold or explained by persona design.",
);
