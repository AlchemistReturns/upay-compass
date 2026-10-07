import {
  addDays,
  categorize,
  detectAnomalies,
  dhakaDay,
  median,
  scoreAnomalies,
  type AnomalyTx,
} from "@compass/shared";
import { generateTransactions } from "./generate.ts";
import { PERSONAS } from "./personas.ts";
import { createRng, hashString } from "./prng.ts";

/**
 * Evaluation of the learned anomaly score next to the statistical rule, on injected anomalies of
 * several kinds. Each injected payment is added to a clean copy of one person's history by itself,
 * and each method is asked whether it flags that payment. False alarms are counted on the clean
 * history. Deterministic. Simulated data only.
 */
export type AnomalyKind = "x3" | "x5" | "x8" | "new_merchant" | "odd_hour";
export const ANOMALY_KINDS: AnomalyKind[] = ["x3", "x5", "x8", "new_merchant", "odd_hour"];
export const INJECTION_DAYS_BACK = [55, 35, 15];
const CLEAN_DAYS = 90;

export type Person = { id: string; persona: (typeof PERSONAS)[number]; txs: AnomalyTx[] };

export function makeAnomalyPeople(
  split: "dev" | "holdout",
  count: number,
  endDay: string,
): Person[] {
  return Array.from({ length: count }, (_, i) => {
    const persona = PERSONAS[i % PERSONAS.length]!;
    const seed = `anomaly-${split}-${i}`;
    const txs = generateTransactions({ persona, endDay, days: 150, seed }).map((t) => ({
      id: t.id,
      direction: t.direction,
      channel: t.channel,
      counterparty: t.counterparty,
      amount: t.amount,
      occurred_at: t.occurred_at,
      category: categorize(t)?.category ?? null,
    }));
    return { id: seed, persona, txs };
  });
}

export type Injection = { kind: AnomalyKind; day: string; tx: AnomalyTx };

/** One injected payment of each kind at each of three days, built from the person's own habits. */
export function buildInjections(person: Person, endDay: string): Injection[] {
  const rng = createRng(hashString(`inject|${person.id}`));
  const out: Injection[] = [];
  const spending = person.txs.filter(
    (t) => t.direction === "out" && t.category && !["savings", "income"].includes(t.category),
  );
  ANOMALY_KINDS.forEach((kind, k) => {
    INJECTION_DAYS_BACK.forEach((back, j) => {
      const day = addDays(endDay, -back - (k % 2));
      // A merchant the person already uses, in a category that is not a bill or rent.
      const habit = spending.filter(
        (t) => t.channel === "merchant" && dhakaDay(t.occurred_at) < day,
      );
      if (habit.length < 10) return;
      const base = habit[Math.floor(rng.next() * habit.length)]!;
      const sameMerchant = habit.filter((t) => t.counterparty === base.counterparty);
      const merchantMedian = median(sameMerchant.map((t) => t.amount));
      const categoryMedian = median(
        habit.filter((t) => t.category === base.category).map((t) => t.amount),
      );
      const id = `inj-${person.id}-${kind}-${j}`;
      const at = (hour: number) => `${day}T${String((hour + 18) % 24).padStart(2, "0")}:10:00Z`;
      let tx: AnomalyTx;
      switch (kind) {
        case "x3":
        case "x5":
        case "x8": {
          const m = kind === "x3" ? 3 : kind === "x5" ? 5 : 8;
          tx = { ...base, id, amount: Math.round(merchantMedian * m), occurred_at: at(14) };
          break;
        }
        case "new_merchant":
          tx = {
            ...base,
            id,
            counterparty: `Unfamiliar Shop ${j}`,
            amount: Math.round(categoryMedian * 4),
            occurred_at: at(14),
          };
          break;
        case "odd_hour":
          // 3 a.m. in Dhaka (UTC+6 is 21:00 the day before)
          tx = {
            ...base,
            id,
            amount: Math.round(merchantMedian * 1.5),
            occurred_at: `${addDays(day, -1)}T21:10:00Z`,
          };
          break;
      }
      out.push({ kind, day: kind === "odd_hour" ? addDays(day, -1) : day, tx });
    });
  });
  return out;
}

/** What every method needs to know about one scenario, computed once. */
export type Scenario = {
  kind: AnomalyKind | "clean";
  /** The payment that was injected (none for the clean history). */
  injectedId: string | null;
  rule: Set<string>;
  model: Map<string, { score: number; excess: number }>;
};

export type Scored = { scenarios: Scenario[]; cleanPayments: number; personMonths: number };

/** Runs the rule and the model once per scenario, so many thresholds can be compared cheaply. */
export function scoreScenarios(people: Person[], endDay: string): Scored {
  const now = new Date(`${endDay}T08:00:00Z`);
  const from = addDays(endDay, -(CLEAN_DAYS - 1));
  const scenarios: Scenario[] = [];
  let cleanPayments = 0;
  let personMonths = 0;
  const run = (txs: AnomalyTx[], candidateFrom: string) => ({
    rule: new Set(detectAnomalies(txs, { candidateFrom }, now).map((a) => a.txId)),
    model: new Map(
      scoreAnomalies(txs, { candidateFrom }, now).map(
        (m) => [m.txId, { score: m.score, excess: m.excess }] as const,
      ),
    ),
  });
  for (const person of people) {
    scenarios.push({ kind: "clean", injectedId: null, ...run(person.txs, from) });
    cleanPayments += person.txs.filter(
      (t) => t.direction === "out" && dhakaDay(t.occurred_at) >= from,
    ).length;
    personMonths += CLEAN_DAYS / 30;
    for (const inj of buildInjections(person, endDay)) {
      scenarios.push({
        kind: inj.kind,
        injectedId: inj.tx.id,
        ...run([...person.txs, inj.tx], inj.day),
      });
    }
  }
  return { scenarios, cleanPayments, personMonths };
}

/** Which payments a method flags in one scenario. */
export type Flagger = (s: Scenario) => Set<string>;

export const byRule: Flagger = (s) => s.rule;
export const byScore =
  (threshold: number): Flagger =>
  (s) =>
    new Set([...s.model].filter(([, m]) => m.score >= threshold).map(([id]) => id));
export const byExcess =
  (delta: number): Flagger =>
  (s) =>
    new Set([...s.model].filter(([, m]) => m.excess >= delta).map(([id]) => id));
export const either =
  (a: Flagger, b: Flagger): Flagger =>
  (s) =>
    new Set([...a(s), ...b(s)]);
export const both =
  (a: Flagger, b: Flagger): Flagger =>
  (s) => {
    const y = b(s);
    return new Set([...a(s)].filter((id) => y.has(id)));
  };

export type MethodOutcome = {
  detected: Record<AnomalyKind, number>;
  injected: Record<AnomalyKind, number>;
  falseAlarms: number;
  cleanPayments: number;
  personMonths: number;
};

export function outcomeOf(scored: Scored, flagger: Flagger): MethodOutcome {
  const zero = () =>
    Object.fromEntries(ANOMALY_KINDS.map((k) => [k, 0])) as Record<AnomalyKind, number>;
  const r: MethodOutcome = {
    detected: zero(),
    injected: zero(),
    falseAlarms: 0,
    cleanPayments: scored.cleanPayments,
    personMonths: scored.personMonths,
  };
  for (const s of scored.scenarios) {
    const flagged = flagger(s);
    if (s.kind === "clean") r.falseAlarms += flagged.size;
    else {
      r.injected[s.kind]++;
      if (s.injectedId && flagged.has(s.injectedId)) r.detected[s.kind]++;
    }
  }
  return r;
}
