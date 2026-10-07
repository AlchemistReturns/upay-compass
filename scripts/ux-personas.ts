// Persona-based evaluation: each persona runs every task in tap and voice mode, using the step
// lists measured in ux-tasks.ts and the parameters in ux-persona-params.ts. Seeded, so repeatable.
// Run: pnpm ux:personas
import {
  MODES,
  PAIRED_TASK_KEYS as TASK_KEYS,
  TASKS,
  slug,
  writeUsabilityData,
  type StepKind,
} from "./ux-tasks.ts";
import {
  PERSONAS,
  RUNS,
  SEED,
  TAP_CONFUSION_AT_ZERO_LITERACY,
  type PersonaParams,
} from "./ux-persona-params.ts";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function failChance(p: PersonaParams, kind: StepKind) {
  if (kind === "field") return p.typingErrorRate;
  if (kind === "speak") return p.speechMisrecognitionRate;
  return p.tapErrorRate ?? TAP_CONFUSION_AT_ZERO_LITERACY * (1 - p.digitalLiteracy); // tap, confirm
}

type Tally = {
  runs: number;
  done: number;
  steps: number;
  errors: number;
  giveUps: number;
  giveUpAt: number;
};
const blank = (): Tally => ({ runs: 0, done: 0, steps: 0, errors: 0, giveUps: 0, giveUpAt: 0 });

const random = rng(SEED);
const byPersonaMode = new Map<string, Tally>();
const byTaskMode = new Map<string, Tally>();
function get(m: Map<string, Tally>, k: string) {
  let t = m.get(k);
  if (!t) m.set(k, (t = blank()));
  return t;
}

for (const p of PERSONAS) {
  for (const task of TASK_KEYS) {
    for (const mode of MODES) {
      const steps = TASKS[task].flows[mode]!.steps;
      for (let r = 0; r < RUNS; r++) {
        let attempts = 0;
        let errors = 0;
        let gaveUpAt = 0;
        let i = 0;
        while (i < steps.length && !gaveUpAt) {
          attempts++;
          if (random() < failChance(p, steps[i].kind)) {
            errors++;
            if (errors > p.patience) gaveUpAt = i + 1;
          } else i++;
        }
        for (const t of [
          get(byPersonaMode, `${p.name}|${mode}`),
          get(byTaskMode, `${task}|${mode}`),
        ]) {
          t.runs++;
          t.steps += attempts;
          t.errors += errors;
          if (gaveUpAt) {
            t.giveUps++;
            t.giveUpAt += gaveUpAt;
          } else t.done++;
        }
      }
    }
  }
}

const avg = (n: number, d: number) => (d ? (n / d).toFixed(2) : "-");
const row = (t: Tally) =>
  `${((100 * t.done) / t.runs).toFixed(1)}% | ${avg(t.steps, t.runs)} | ${avg(t.errors, t.runs)} | ${avg(t.giveUpAt, t.giveUps)}`;

console.log("Persona-based evaluation: 8 personas, parameters in scripts/ux-persona-params.ts.");
console.log(`${RUNS} seeded runs per persona, task and mode (seed ${SEED}). Results below are`);
console.log(
  "persona-based (from parameters); the step lists they run on are measured from the code.\n",
);

console.log("By persona (average over the 5 tasks) [persona-based]\n");
console.log(
  "| Persona | Lang | Mode | Completion | Avg steps taken | Avg errors | Avg give-up step |",
);
console.log("|---|---|---|---|---|---|---|");
for (const p of PERSONAS)
  for (const m of MODES)
    console.log(`| ${p.name} | ${p.lang} | ${m} | ${row(byPersonaMode.get(`${p.name}|${m}`)!)} |`);

console.log("\nBy task (all personas) [persona-based]; flow steps are measured\n");
console.log(
  "| Task | Mode | Flow steps (measured) | Completion | Avg steps taken | Avg errors | Avg give-up step |",
);
console.log("|---|---|---|---|---|---|---|");
for (const k of TASK_KEYS)
  for (const m of MODES)
    console.log(
      `| ${TASKS[k].label} | ${m} | ${TASKS[k].flows[m]!.steps.length} | ${row(byTaskMode.get(`${k}|${m}`)!)} |`,
    );

console.log("\nTap vs voice (all personas, all tasks) [persona-based]\n");
console.log("| Mode | Completion | Avg steps taken | Avg errors | Avg give-up step |");
console.log("|---|---|---|---|---|");
for (const m of MODES) {
  const t = blank();
  for (const [k, v] of byTaskMode)
    if (k.endsWith(`|${m}`)) for (const f of Object.keys(t) as (keyof Tally)[]) t[f] += v[f];
  console.log(`| ${m} | ${row(t)} |`);
}

// the same figures, for the admin Usability evidence section
const stats = (t: Tally) => ({
  completionPct: Math.round((1000 * t.done) / t.runs) / 10,
  avgSteps: Math.round((100 * t.steps) / t.runs) / 100,
  avgErrors: Math.round((100 * t.errors) / t.runs) / 100,
});
const all: Record<string, Tally> = { tap: blank(), voice: blank() };
for (const [k, v] of byTaskMode)
  for (const f of Object.keys(v) as (keyof Tally)[]) all[k.split("|")[1]][f] += v[f];
writeUsabilityData("personas", {
  runsPerCell: RUNS,
  seed: SEED,
  overall: { tap: stats(all.tap), voice: stats(all.voice) },
  personas: PERSONAS.map((p) => ({
    id: slug(p.name),
    name: p.name,
    lang: p.lang,
    tap: stats(byPersonaMode.get(`${p.name}|tap`)!),
    voice: stats(byPersonaMode.get(`${p.name}|voice`)!),
  })),
});
