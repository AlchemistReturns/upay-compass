// End-to-end check of "Made for you" modules against the LOCAL Supabase stack (pnpm sb start and
// pnpm sb functions serve --env-file supabase/.env.functions). Uses the real function and the real
// OpenAI model from the function secrets, so each run costs a few cents.
// Run: node scripts/e2e-learn-local.mjs [student|gig|salaried] [phone-suffix 1-4]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const URL_ = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const persona = process.argv[2] ?? "gig";
const phone = `+880170000000${process.argv[3] ?? "2"}`;

const client = createClient(URL_, ANON, { auth: { persistSession: false } });
await client.auth.signInWithOtp({ phone });
const { data: auth, error: authError } = await client.auth.verifyOtp({
  phone,
  token: "123456",
  type: "sms",
});
if (authError) throw authError;
const uid = auth.user.id;

const step = async (label, p) => {
  const r = await p;
  if (r.error) {
    console.log(`✗ ${label}:`, r.error.message ?? r.error);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  return r.data;
};

await step(
  "profile onboarded, consent on",
  client
    .from("profiles")
    .update({
      onboarded: true,
      language: "en",
      income_type: persona,
      coach_consent_at: new Date().toISOString(),
    })
    .eq("id", uid),
);
await step(
  `load ${persona} demo data`,
  client.functions.invoke("reset-demo", { body: { persona } }),
);
await client.from("profiles").update({ coach_consent_at: new Date().toISOString() }).eq("id", uid);

const report = [`# Live run: ${persona}\n`];
for (const language of ["en", "bn"]) {
  const started = Date.now();
  const { data, error } = await client.functions.invoke("generate-learn-modules", {
    body: { language },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (error) {
    const body = await error.context?.text?.().catch(() => "");
    console.log(`✗ ${language}: function error: ${error.message} ${body}`);
    continue;
  }
  console.log(`✓ ${language}: status=${data.status}, ${data.modules.length} modules in ${secs}s`);
  report.push(`## ${language} (status ${data.status}, ${secs}s)\n`);
  for (const m of data.modules) {
    const c = m.content;
    console.log(`   - ${m.topic_id} [${m.reason_id}] "${c.title}" (${c.minutes} min)`);
    report.push(`### ${m.topic_id} — ${m.reason_id}\n**${c.title}**\n\n_${c.summary}_\n`);
    for (const s of c.sections) {
      report.push(
        `## ${s.heading}\n${s.paragraph}\n${s.bullets.map((b) => `- ${b}`).join("\n")}\n`,
      );
    }
    report.push(`Try this (${c.try_this.route}): ${c.try_this.text}\n`);
    c.quick_check.forEach((q, i) =>
      report.push(
        `Q${i + 1}: ${q.question} ${q.options.map((o, j) => `${j === q.answer ? "[x]" : "[ ]"} ${o}`).join(" ")} — ${q.explanation}\n`,
      ),
    );
    report.push(`Facts sent: \`${JSON.stringify(m.facts)}\`\n`);
  }
}

const audit = await client
  .from("audit_log")
  .select("detail,created_at")
  .eq("action", "learn_generate")
  .order("created_at", { ascending: false })
  .limit(2);
console.log("audit (counts only):", JSON.stringify(audit.data?.map((a) => a.detail)));
const out = new URL(`../.local-learn-run-${persona}.md`, import.meta.url);
writeFileSync(out, report.join("\n"));
console.log("Full text saved to", out.pathname.slice(1));
