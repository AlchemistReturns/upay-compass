import { transactionSchema, type Transaction } from "@compass/shared";
import { addDays, calendarDay, dhakaTimeToIso } from "./dates.ts";
import { PERSONA_CONFIGS, type Persona } from "./personas.ts";
import { createRng, hashString } from "./prng.ts";

export type GenerateOptions = {
  persona: Persona;
  /** Same seed + persona + day always yields the same transactions. */
  seed?: string | number;
  /** Last day to generate, "YYYY-MM-DD" in Dhaka time (inclusive). */
  endDay: string;
  /** How many days of history to generate (default 90). */
  days?: number;
};

export const DEFAULT_SEED = "compass-demo";
export const DEFAULT_DAYS = 90;

/**
 * Deterministic transaction history for a persona. Every day is drawn from its own PRNG keyed by
 * (seed, persona, day), so two runs that overlap on a day agree on that day regardless of `endDay`.
 * Ids are stable too, which lets re-ingesting the same feed be idempotent.
 */
export function generateTransactions(opts: GenerateOptions): Transaction[] {
  const { persona, endDay } = opts;
  const seed = opts.seed ?? DEFAULT_SEED;
  const days = opts.days ?? DEFAULT_DAYS;
  const config = PERSONA_CONFIGS[persona];
  const result: Transaction[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(endDay, -i);
    const day = calendarDay(key);
    const rng = createRng(hashString(`${seed}|${persona}|${key}`));
    const drafts = config.day(day, rng);

    drafts.forEach((draft, index) => {
      const hour = draft.hour ?? rng.int(8, 21);
      const minute = rng.int(0, 59);
      const tx: Transaction = {
        id: `sim-${persona}-${key}-${index + 1}`,
        amount: draft.amount,
        direction: draft.direction,
        channel: draft.channel,
        counterparty: draft.counterparty,
        note: draft.note ?? "",
        occurred_at: dhakaTimeToIso(key, hour, minute),
      };
      // Fail loudly in tests if a persona ever produces something the pipeline would reject.
      result.push(transactionSchema.parse(tx));
    });
  }

  return result.sort(
    (a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id),
  );
}
