import type { FeedBatch, FeedContext, Transaction, TransactionFeed } from "@compass/shared";
import { DEFAULT_DAYS, DEFAULT_SEED, generateTransactions } from "./generate.ts";
import { todayInDhaka } from "./dates.ts";
import { PERSONA_CONFIGS, type Persona } from "./personas.ts";

export { generateTransactions, DEFAULT_SEED, DEFAULT_DAYS } from "./generate.ts";
export type { GenerateOptions } from "./generate.ts";
export { PERSONAS, PERSONA_CONFIGS } from "./personas.ts";
export type { Persona } from "./personas.ts";
export { todayInDhaka, addDays } from "./dates.ts";

/**
 * Starting wallet balance for a generated history: the persona's usual figure, raised when needed so
 * the wallet never goes below zero at any point in the history. The histories are generated for
 * whatever day the demo runs on, so the opening balance has to follow them.
 */
export function walletOpeningBalance(
  persona: Persona,
  txs: Pick<Transaction, "direction" | "amount" | "occurred_at">[],
): number {
  const sorted = [...txs].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let running = 0;
  let lowest = 0;
  for (const t of sorted) {
    running += t.direction === "in" ? t.amount : -t.amount;
    lowest = Math.min(lowest, running);
  }
  const needed = Math.ceil((-lowest + 300) / 50) * 50;
  return Math.max(PERSONA_CONFIGS[persona].openingBalance, needed);
}

/** Simulated upay feed: deterministic history for one persona, ending today (Dhaka time). */
export class SimulatedFeed implements TransactionFeed {
  readonly id = "simulated" as const;
  readonly simulated = true;

  constructor(
    private readonly persona: Persona,
    private readonly options: { seed?: string | number; now?: Date; days?: number } = {},
  ) {}

  private opening: number | null = null;

  /** Starting wallet balance for the history last returned by getTransactions (see walletOpeningBalance). */
  get openingBalance(): number {
    return this.opening ?? PERSONA_CONFIGS[this.persona].openingBalance;
  }

  /** The history as generated, before any `since` filter. */
  private generate(): Transaction[] {
    const all = generateTransactions({
      persona: this.persona,
      seed: this.options.seed ?? DEFAULT_SEED,
      days: this.options.days ?? DEFAULT_DAYS,
      endDay: todayInDhaka(this.options.now),
    });
    this.opening = walletOpeningBalance(this.persona, all);
    return all;
  }

  // The simulated feed ignores the user: every user of a persona sees the same demo history.
  async getTransactions(_userId: string, since: Date): Promise<Transaction[]> {
    return this.generate().filter((t) => new Date(t.occurred_at) >= since);
  }

  async pull(_ctx: FeedContext, since: Date): Promise<FeedBatch> {
    const records = this.generate().filter((t) => new Date(t.occurred_at) >= since);
    return { records, openingBalance: this.openingBalance };
  }
}
