import { FeedError, type FeedBatch, type FeedContext, type TransactionFeed } from "@compass/shared";
import { parseStatement, StatementError, type StatementParse } from "./parse.ts";

export {
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  StatementError,
  parseAmount,
  parseStatement,
  parseStatementDate,
} from "./parse.ts";
export type { StatementParse, StatementRecord, StatementRow } from "./parse.ts";
export { parseCsv } from "./csv.ts";

/**
 * A upay statement the person exported and uploaded (CSV). It is real data, so rows are not marked
 * simulated. Rows that cannot be read are passed on as broken records, which the ingestion pipeline
 * rejects, counts and logs, so the rest of the file still imports.
 */
export class StatementFeed implements TransactionFeed {
  readonly id = "statement_csv" as const;
  readonly simulated = false;

  constructor(
    private readonly csv: string,
    private readonly options: { openingBalance?: number | null } = {},
  ) {}

  async pull(_ctx: FeedContext, since: Date): Promise<FeedBatch> {
    let parsed: StatementParse;
    try {
      parsed = parseStatement(this.csv);
    } catch (e) {
      if (e instanceof StatementError) throw new FeedError("invalid_input", e.message);
      throw e;
    }
    const records = parsed.rows
      .filter((r) => !r.record || new Date(r.record.occurred_at) >= since)
      .map((r) => r.record ?? { id: `csv-line-${r.line}`, parse_error: r.error });
    // An opening balance the person typed in wins over one worked out from a balance column.
    const opening = this.options.openingBalance ?? parsed.openingBalance;
    return { records, openingBalance: opening ?? null };
  }
}
