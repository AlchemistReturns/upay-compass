// Voice command evaluation against the real model. Run: pnpm eval:voice
//
// Sends the 100 sentences of the golden set through exactly what the voice-command function does
// (the same prompt and JSON schema, then the same validation code) and measures:
//   - intent accuracy
//   - slot accuracy (amount, direction, category, date, merchant, goal, title)
//   - amount safety: an accepted command must carry the amount the person said. A wrong amount
//     that gets accepted is the one failure that must never happen, so it fails the run.
// Costs a few cents of OpenAI usage. Reads OPENAI_API_KEY (and OPENAI_VOICE_MODEL) from the
// environment or supabase/.env.functions.
import { readFileSync } from "node:fs";
import {
  RAW_COMMAND_JSON_SCHEMA,
  resolveVoiceDate,
  validateCommand,
  voiceParsePrompt,
} from "../packages/shared/src/index.ts";
import { GOALS, GOLDEN as MAIN, HOLDOUT, TODAY } from "./voice-golden.mjs";

const HOLDOUT_RUN = process.argv.includes("--holdout");
const GOLDEN = HOLDOUT_RUN ? HOLDOUT : MAIN;

function readEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(
      new URL("../supabase/.env.functions", import.meta.url),
      "utf8",
    ).split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch {
    // no env file: rely on the environment
  }
  return env;
}
const env = readEnv();
const KEY = env.OPENAI_API_KEY;
const MODEL = env.OPENAI_VOICE_MODEL || "gpt-4.1-mini";
if (!KEY) {
  console.error("OPENAI_API_KEY is not set (environment or supabase/.env.functions)");
  process.exit(2);
}
const reasoning = /^(gpt-5|o\d)/.test(MODEL);

async function ask(text) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      ...(reasoning ? { reasoning_effort: "minimal" } : { temperature: 0 }),
      response_format: { type: "json_schema", json_schema: RAW_COMMAND_JSON_SCHEMA },
      messages: [
        { role: "system", content: voiceParsePrompt(TODAY, GOALS) },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const payload = await res.json();
  return JSON.parse(payload.choices[0].message.content);
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

/** Compare an accepted command with what was expected; returns the list of mismatched fields. */
function mismatches(expect, cmd) {
  const bad = [];
  const intent = cmd.intent;
  if (!asList(expect.intent).includes(intent)) return ["intent"];
  if (intent === "add_transaction") {
    if (expect.amount !== undefined && cmd.amount !== expect.amount) bad.push("amount");
    if (expect.direction && cmd.direction !== expect.direction) bad.push("direction");
    if (expect.category !== undefined && !asList(expect.category).includes(cmd.category))
      bad.push("category");
    if (
      expect.date &&
      !asList(expect.date).some((d) => resolveVoiceDate(d, TODAY) === cmd.date || d === cmd.date)
    )
      bad.push("date");
    if (expect.merchant && !new RegExp(expect.merchant, "i").test(cmd.merchant))
      bad.push("merchant");
  } else if (intent === "delete_transaction") {
    if (expect.which && cmd.which !== expect.which) bad.push("which");
    if (expect.amount !== undefined && cmd.amount !== expect.amount) bad.push("amount");
    if (expect.direction && cmd.direction !== expect.direction) bad.push("direction");
    if (expect.date && !asList(expect.date).some((d) => resolveVoiceDate(d, TODAY) === cmd.date))
      bad.push("date");
    if (expect.merchant && !new RegExp(expect.merchant, "i").test(cmd.merchant ?? ""))
      bad.push("merchant");
  } else if (intent === "create_budget") {
    if (expect.amount !== undefined && cmd.limit !== expect.amount) bad.push("amount");
    if (expect.category !== undefined && !asList(expect.category).includes(cmd.category))
      bad.push("category");
  } else if (intent === "create_goal") {
    if (expect.amount !== undefined && cmd.target !== expect.amount) bad.push("amount");
    if (expect.title && !new RegExp(expect.title, "i").test(cmd.title)) bad.push("title");
    if (expect.targetDate !== undefined && cmd.targetDate !== expect.targetDate)
      bad.push("targetDate");
  } else if (intent === "add_to_goal") {
    if (expect.amount !== undefined && cmd.amount !== expect.amount) bad.push("amount");
    if (expect.goal !== undefined && !asList(expect.goal).includes(cmd.goalId)) bad.push("goal");
  }
  return bad;
}

const results = [];
let next = 0;
async function worker() {
  while (next < GOLDEN.length) {
    const i = next++;
    const g = GOLDEN[i];
    try {
      const raw = await ask(g.text);
      const v = validateCommand(raw, { transcript: g.text, today: TODAY, goals: GOALS });
      results[i] = { g, raw, v };
    } catch (e) {
      results[i] = { g, error: String(e.message ?? e) };
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

let intentOk = 0;
let accepted = 0;
let acceptedClean = 0;
let rejected = 0;
let amountWrongAccepted = 0;
let errors = 0;
const rejectedBy = {};
const failures = [];
const byGroup = {};
for (const r of results) {
  const grp = (byGroup[r.g.group] ??= { n: 0, intent: 0, clean: 0, rejected: 0 });
  grp.n++;
  if (r.error) {
    errors++;
    failures.push(`ERROR  ${r.g.text}  (${r.error})`);
    continue;
  }
  const expectedIntent = asList(r.g.expect.intent);
  if (!r.v.ok) {
    rejected++;
    grp.rejected++;
    rejectedBy[r.v.reason] = (rejectedBy[r.v.reason] ?? 0) + 1;
    // a refusal is right for "unclear" sentences and for the reasons a case allows, and a safe (if
    // unhelpful) outcome otherwise
    if (
      (expectedIntent.includes("unclear") && r.v.reason === "unclear") ||
      r.g.expect.refuse?.includes(r.v.reason)
    ) {
      intentOk++;
      grp.intent++;
      grp.clean++;
    } else {
      failures.push(`REFUSED ${r.g.text}  -> ${r.v.reason}`);
    }
    continue;
  }
  accepted++;
  const bad = mismatches(r.g.expect, r.v.command);
  if (!bad.includes("intent")) {
    intentOk++;
    grp.intent++;
  }
  if (bad.length === 0) {
    acceptedClean++;
    grp.clean++;
  } else {
    if (bad.includes("amount")) amountWrongAccepted++;
    failures.push(`WRONG   ${r.g.text}  -> ${bad.join(",")}  ${JSON.stringify(r.v.command)}`);
  }
}

const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`);
console.log(
  `# Voice command evaluation (model ${MODEL}, ${GOLDEN.length} sentences${HOLDOUT_RUN ? ", HOLD-OUT set" : ""})\n`,
);
console.log("| Group | Sentences | Right intent | Fully right | Refused by code |");
console.log("|---|---|---|---|---|");
for (const [name, s] of Object.entries(byGroup)) {
  console.log(`| ${name} | ${s.n} | ${s.intent} | ${s.clean} | ${s.rejected} |`);
}
console.log(
  `| **all** | ${GOLDEN.length} | ${intentOk} (${pct(intentOk, GOLDEN.length)}) | ${acceptedClean + failures.filter(() => false).length + results.filter((r) => !r.error && !r.v.ok && asList(r.g.expect.intent).includes("unclear") && r.v.reason === "unclear").length} | ${rejected} |`,
);
console.log("");
console.log(
  `Accepted by the code: ${accepted}. Of those, fully right: ${acceptedClean} (${pct(acceptedClean, accepted)}).`,
);
console.log(`Refused by the code: ${rejected} ${JSON.stringify(rejectedBy)}.`);
console.log(`**Accepted with a wrong amount: ${amountWrongAccepted}** (must be 0).`);
if (errors) console.log(`Calls that failed: ${errors}.`);
if (failures.length) {
  console.log("\nCases to look at:");
  for (const f of failures) console.log(`- ${f}`);
}

// Exit code: amount safety is absolute; intent accuracy has a floor.
const intentAcc = intentOk / GOLDEN.length;
if (amountWrongAccepted > 0) {
  console.error("\nFAILED: a command with a wrong amount was accepted");
  process.exit(1);
}
if (intentAcc < 0.9) {
  console.error(`\nFAILED: intent accuracy ${pct(intentOk, GOLDEN.length)} is below 90%`);
  process.exit(1);
}
console.log("\nVOICE EVAL PASSED");
