import type { Transaction } from "@compass/shared";

export type Persona = "student" | "gig" | "salaried";

/** Swappable feed interface. A real upay API implements this later. */
export interface TransactionFeed {
  getTransactions(userId: string, since: Date): Promise<Transaction[]>;
}

// TODO(phase 2): seeded PRNG + persona generators.
