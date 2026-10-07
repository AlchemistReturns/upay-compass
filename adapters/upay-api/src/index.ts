import { FeedError, type FeedBatch, type FeedContext, type TransactionFeed } from "@compass/shared";
import { DEFAULT_FIELD_MAP, mapTransaction, pick, type MapOptions } from "./map.ts";

export * from "./map.ts";

export type UpayApiConfig = MapOptions & {
  /** e.g. https://api.upay.example, no trailing slash needed */
  baseUrl: string;
  /** partner credential, sent as a Bearer token; never sent to the browser */
  apiKey: string;
  /** injectable for tests; defaults to the global fetch */
  fetch?: typeof fetch;
  /** transactions per page (default 200) */
  pageSize?: number;
  /** safety stop against a cursor that never ends (default 50 pages) */
  maxPages?: number;
  timeoutMs?: number;
};

const EPOCH = 0;

/**
 * Pulls a person's transactions from upay's partner API, keyed by their verified phone number.
 *
 * ASSUMED endpoints (replace when upay shares its real spec; see docs/integration/upay-adapter.md):
 *   GET {baseUrl}/v1/accounts/{phone}/transactions?from=<ISO>&limit=<n>&cursor=<c>
 *   GET {baseUrl}/v1/accounts/{phone}/balance
 * Authorization: Bearer <apiKey>. Responses are mapped through `FieldMap` / `ServiceMap`.
 * Nothing here has run against the real upay API.
 */
export class UpayApiFeed implements TransactionFeed {
  readonly id = "upay_api" as const;
  readonly simulated = false;
  private readonly http: typeof fetch;
  private readonly base: string;

  constructor(private readonly config: UpayApiConfig) {
    if (!config.baseUrl || !config.apiKey) throw new FeedError("not_configured");
    this.base = config.baseUrl.replace(/\/+$/, "");
    this.http = config.fetch ?? fetch;
  }

  private async get(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await this.http(`${this.base}${path}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      throw new FeedError("unavailable", "upay API did not respond");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new FeedError("unauthorized");
    if (res.status === 404) throw new FeedError("not_found");
    if (!res.ok) throw new FeedError("unavailable", `upay API returned ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new FeedError("unavailable", "upay API returned something that is not JSON");
    }
  }

  async pull(ctx: FeedContext, since: Date): Promise<FeedBatch> {
    if (!ctx.phone) throw new FeedError("not_found", "no verified phone number for this person");
    const account = `/v1/accounts/${encodeURIComponent(ctx.phone)}`;
    const fields = { ...DEFAULT_FIELD_MAP, ...this.config.fields };
    const limit = this.config.pageSize ?? 200;
    const maxPages = this.config.maxPages ?? 50;
    const full = since.getTime() <= EPOCH;

    const records: unknown[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (!full) query.set("from", since.toISOString());
      if (cursor) query.set("cursor", cursor);
      const body = await this.get(`${account}/transactions?${query}`);
      const items = pick(body, fields.items);
      if (!Array.isArray(items)) throw new FeedError("unavailable", "unexpected response shape");
      for (const raw of items) {
        const mapped = mapTransaction(raw, this.config);
        if (mapped.kind === "record") records.push(mapped.record);
        // A transaction we cannot read goes on as a broken record, so the pipeline counts and logs it.
        else if (mapped.kind === "broken")
          records.push({ id: mapped.id, parse_error: mapped.reason });
      }
      const next = pick(body, fields.nextCursor);
      cursor = typeof next === "string" && next ? next : null;
      if (!cursor) break;
      if (page === maxPages - 1) throw new FeedError("unavailable", "too many pages");
    }

    // The opening balance is only knowable for a full pull: today's balance minus everything since.
    let openingBalance: number | null = null;
    if (full) {
      try {
        const balanceBody = await this.get(`${account}/balance`);
        const current = Number(pick(balanceBody, fields.balance));
        if (Number.isFinite(current)) {
          const net = records.reduce<number>((n, r) => {
            const t = r as { direction?: string; amount?: number };
            return typeof t.amount === "number"
              ? n + (t.direction === "in" ? t.amount : -t.amount)
              : n;
          }, 0);
          openingBalance = current - net;
        }
      } catch {
        // the history is still useful without a balance; the stored one is left alone
      }
    }
    return { records, openingBalance };
  }
}
