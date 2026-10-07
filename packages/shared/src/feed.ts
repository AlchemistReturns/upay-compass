/**
 * The contract between Compass and any source of upay transactions. The ingestion pipeline knows
 * only this interface; the simulator, a statement (CSV) import and a real upay API are all plugins
 * behind it. To add a source: implement `TransactionFeed`, register it in
 * `supabase/functions/_shared/feeds.ts`, and run `checkFeedBatch` over its output in a test.
 * See docs/integration/upay-adapter.md.
 */
import { transactionSchema } from "./types.ts";

/** Which source a batch came from. Stored in the audit log; `simulated` also marks the rows. */
export type FeedSourceId = "simulated" | "statement_csv" | "upay_api";

/** Who the pull is for. The pipeline has already authenticated them. */
export type FeedContext = {
  userId: string;
  /** Verified phone number in E.164 (+8801XXXXXXXXX), null if unknown. Real feeds key accounts by it. */
  phone: string | null;
};

/**
 * What a feed returns. `records` are deliberately untyped: the pipeline validates every record with
 * `transactionSchema` and rejects (and logs) the bad ones, so a feed never has to be trusted.
 */
export type FeedBatch = {
  records: unknown[];
  /**
   * Wallet balance just before the earliest record, when the source knows it (the simulator does; a
   * statement may). null leaves the stored value alone.
   */
  openingBalance: number | null;
};

export interface TransactionFeed {
  readonly id: FeedSourceId;
  /** true only for generated data; sets `is_simulated` on the stored rows. */
  readonly simulated: boolean;
  /**
   * Transactions that happened at or after `since`. Record ids must be stable across calls, because
   * they become `external_id` and make re-importing the same period a no-op.
   */
  pull(ctx: FeedContext, since: Date): Promise<FeedBatch>;
}

/** Why a feed could not deliver. The pipeline maps `code` to an HTTP status and a clear message. */
export type FeedErrorCode =
  | "not_configured" // no credentials / URL set for this source
  | "unauthorized" // the source rejected our credentials or this person's link
  | "not_found" // the source has no account for this person
  | "invalid_input" // the caller's own input (for example a malformed CSV) is unusable
  | "unavailable"; // the source is down, slow or returned something unusable

export class FeedError extends Error {
  readonly code: FeedErrorCode;
  constructor(code: FeedErrorCode, message?: string) {
    super(message ?? code);
    this.name = "FeedError";
    this.code = code;
  }
}

export const FEED_ERROR_STATUS: Record<FeedErrorCode, number> = {
  not_configured: 501,
  unauthorized: 502,
  not_found: 404,
  invalid_input: 400,
  unavailable: 503,
};

/**
 * Conformance check for a feed's output, for use in an adapter's tests. Returns the problems found
 * (empty means the batch is fine): every record parses, ids are unique, no record is in the future.
 */
export function checkFeedBatch(batch: FeedBatch, now: Date = new Date()): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  batch.records.forEach((record, i) => {
    const parsed = transactionSchema.safeParse(record);
    if (!parsed.success) {
      problems.push(
        `record ${i}: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`,
      );
      return;
    }
    const tx = parsed.data;
    if (seen.has(tx.id)) problems.push(`record ${i}: duplicate id ${tx.id}`);
    seen.add(tx.id);
    if (new Date(tx.occurred_at).getTime() > now.getTime() + 5 * 60_000) {
      problems.push(`record ${i}: occurred_at ${tx.occurred_at} is in the future`);
    }
  });
  if (batch.openingBalance !== null && !Number.isFinite(batch.openingBalance)) {
    problems.push("openingBalance is not a number");
  }
  return problems;
}
