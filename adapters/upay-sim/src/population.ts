import { categorize, isEssentialCategory, type FlowTx } from "@compass/shared";
import { addDays } from "./dates.ts";
import { generateTransactions } from "./generate.ts";
import { walletOpeningBalance } from "./index.ts";
import { PERSONAS, type Persona } from "./personas.ts";
import { createRng, hashString } from "./prng.ts";

/**
 * Many simulated people for training and testing models. Each one is a persona's history with its
 * own seed, end day (so paydays fall at different points of the month) and spending level.
 * Splits use different seed names, so no person appears in two of them. "shifted" people are
 * drawn from settings no other split uses: much smaller or larger spending, noisy amounts and
 * dropped transactions. Models that only learned the generator should fall apart on them.
 */
export type Split = "train" | "validation" | "dev" | "test" | "holdout" | "final" | "shifted";

export type UserSpec = {
  id: string;
  split: Split;
  persona: Persona;
  seed: string;
  endDay: string;
  days: number;
  amountScale: number;
  /** Each amount is multiplied by a random factor in [1 - noise, 1 + noise]. */
  noise: number;
  /** Share of transactions removed at random. */
  dropRate: number;
};

export type PopulationUser = {
  spec: UserSpec;
  txs: FlowTx[];
  openingBalance: number;
};

export const POPULATION_BASE_DAY = "2026-10-02";
export const POPULATION_DAYS = 180;

export function makePopulation(split: Split, count: number): UserSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = `${split}-${i}`;
    const rng = createRng(hashString(`spec|${seed}`));
    const persona = PERSONAS[i % PERSONAS.length]!;
    const shifted = split === "shifted";
    const amountScale = shifted
      ? rng.chance(0.5)
        ? 0.3 + rng.next() * 0.2
        : 2 + rng.next()
      : 0.6 + rng.next();
    return {
      id: seed,
      split,
      persona,
      seed,
      endDay: addDays(POPULATION_BASE_DAY, -rng.int(0, 29)),
      days: POPULATION_DAYS,
      amountScale,
      noise: shifted ? 0.25 : 0,
      dropRate: shifted ? 0.1 : 0,
    };
  });
}

export function buildUser(spec: UserSpec): PopulationUser {
  const rng = createRng(hashString(`perturb|${spec.seed}`));
  const generated = generateTransactions({
    persona: spec.persona,
    seed: spec.seed,
    endDay: spec.endDay,
    days: spec.days,
  });
  const txs: FlowTx[] = [];
  for (const t of generated) {
    if (spec.dropRate > 0 && rng.chance(spec.dropRate)) continue;
    const factor = spec.noise > 0 ? 1 - spec.noise + rng.next() * 2 * spec.noise : 1;
    const amount = Math.max(1, Math.round(t.amount * spec.amountScale * factor));
    const c = categorize(t);
    txs.push({
      direction: t.direction,
      channel: t.channel,
      counterparty: t.counterparty,
      amount,
      occurred_at: t.occurred_at,
      essential: c ? isEssentialCategory(c.category) : false,
    });
  }
  return { spec, txs, openingBalance: walletOpeningBalance(spec.persona, txs) };
}
