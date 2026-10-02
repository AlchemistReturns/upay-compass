import type { Transaction } from "@compass/shared";
import { DEFAULT_DAYS, DEFAULT_SEED, generateTransactions } from "./generate";
import { todayInDhaka } from "./dates";
import { PERSONA_CONFIGS, type Persona } from "./personas";

export { generateTransactions, DEFAULT_SEED, DEFAULT_DAYS } from "./generate";
export type { GenerateOptions } from "./generate";
export { PERSONAS, PERSONA_CONFIGS } from "./personas";
export type { Persona } from "./personas";
export { todayInDhaka, addDays } from "./dates";

/** Swappable feed interface. A real upay API implements this later. */
export interface TransactionFeed {
  getTransactions(userId: string, since: Date): Promise<Transaction[]>;
}

/** Simulated upay feed: deterministic history for one persona, ending today (Dhaka time). */
export class SimulatedFeed implements TransactionFeed {
  constructor(
    private readonly persona: Persona,
    private readonly options: { seed?: string | number; now?: Date; days?: number } = {},
  ) {}

  /** Starting wallet balance for this persona. */
  get openingBalance(): number {
    return PERSONA_CONFIGS[this.persona].openingBalance;
  }

  // The simulated feed ignores userId: every user of a persona sees the same demo history.
  async getTransactions(_userId: string, since: Date): Promise<Transaction[]> {
    const all = generateTransactions({
      persona: this.persona,
      seed: this.options.seed ?? DEFAULT_SEED,
      days: this.options.days ?? DEFAULT_DAYS,
      endDay: todayInDhaka(this.options.now),
    });
    return all.filter((t) => new Date(t.occurred_at) >= since);
  }
}
