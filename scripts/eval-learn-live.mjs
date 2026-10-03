// Calls the REAL OpenAI model with the real prompt and schema (a few cents per run) and prints why
// each answer passed or was rejected. Key and model come from supabase/.env.functions.
// Run: node scripts/eval-learn-live.mjs [en|bn|both]
import { readFileSync } from "node:fs";
import {
  GENERATED_MODULE_JSON_SCHEMA,
  describeRejection,
  generateLearnModule,
  learnMaxCompletionTokens,
  topicById,
} from "../packages/shared/src/index.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../supabase/.env.functions", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const model = process.env.MODEL || env.OPENAI_LEARN_MODEL || env.OPENAI_COACH_MODEL || "gpt-5-mini";
const reasoning = /^(gpt-5|o\d)/.test(model);
console.log("model:", model);

let calls = 0;
const client = async ({ messages, language }) => {
  calls++;
  const cap = learnMaxCompletionTokens(language, reasoning);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_schema", json_schema: GENERATED_MODULE_JSON_SCHEMA },
      ...(reasoning
        ? { max_completion_tokens: cap, reasoning_effort: "minimal" }
        : { max_tokens: cap, temperature: 0.4 }),
    }),
  });
  if (!res.ok) {
    console.log("   OpenAI HTTP", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const p = await res.json();
  console.log(
    `   [call ${calls}] finish=${p.choices?.[0]?.finish_reason} tokens=${p.usage?.completion_tokens}/${cap}`,
  );
  return p.choices?.[0]?.message?.content ?? null;
};

const CASES = [
  [
    "buffer_in_days",
    { buffer_days: 13, buffer_target_days: 90, safety_buffer_days: 7, low_balance_days: 25 },
  ],
  ["small_repeats", { savings_rate_pct: 0 }],
  ["borrowing_pressure", { negative_balance_days: 12, low_balance_days: 25, days_to_first_low: 3 }],
];
const arg = process.argv[2] ?? "both";
let passed = 0,
  total = 0;
for (const language of arg === "both" ? ["en", "bn"] : [arg]) {
  for (const [id, facts] of CASES) {
    total++;
    console.log(`\n${language} ${id}`);
    const r = await generateLearnModule(topicById(id), facts, language, client);
    if (r.ok) {
      passed++;
      console.log(`   PASS (attempt ${r.attempts}) "${r.content.title}"`);
    } else for (const x of r.reasons) console.log("   REJECT:", describeRejection(x));
  }
}
console.log(`\n${passed}/${total} passed; ${calls} model calls`);
