import { describe, expect, it } from "vitest";
import { FeedError, checkFeedBatch } from "@compass/shared";
import { UpayApiFeed, mapTransaction, maskPhone } from "./index";

const ctx = { userId: "u", phone: "+8801712345678" };
const NOW = new Date("2026-10-10T00:00:00Z");

const tx = (over: Record<string, unknown> = {}) => ({
  txn_id: "T1",
  amount: 120.5,
  currency: "BDT",
  type: "DEBIT",
  service: "MERCHANT_PAY",
  counterparty_name: "Rahim Tea Stall",
  reference: "tea",
  timestamp: "2026-10-02T12:30:00+06:00",
  status: "SUCCESS",
  ...over,
});

/** A fake fetch that serves canned JSON by URL and records the calls. */
function fakeFetch(routes: (url: URL) => { status?: number; body?: unknown } | "throw") {
  const calls: { url: URL; auth: string | null }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, auth: new Headers(init?.headers).get("Authorization") });
    const r = routes(url);
    if (r === "throw") throw new TypeError("network down");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("mapTransaction", () => {
  it("maps a completed debit", () => {
    expect(mapTransaction(tx())).toEqual({
      kind: "record",
      record: {
        id: "upay-T1",
        amount: 120.5,
        direction: "out",
        channel: "merchant",
        counterparty: "Rahim Tea Stall",
        note: "tea",
        occurred_at: "2026-10-02T06:30:00.000Z",
      },
    });
  });

  it("maps services and directions", () => {
    const r = (o: Record<string, unknown>) =>
      (mapTransaction(tx(o)) as { record: Record<string, unknown> }).record;
    expect(r({ type: "CREDIT", service: "SEND_MONEY" })).toMatchObject({
      direction: "in",
      channel: "send_money",
    });
    expect(r({ service: "cash out" })).toMatchObject({ channel: "cash_out" });
    expect(r({ service: "MOBILE_RECHARGE" })).toMatchObject({ channel: "recharge" });
    expect(r({ service: "BILL_PAY" })).toMatchObject({ channel: "bill" });
  });

  it("skips transactions where no money moved", () => {
    for (const status of ["FAILED", "PENDING", "REVERSED"]) {
      expect(mapTransaction(tx({ status }))).toEqual({ kind: "skip", reason: "not_completed" });
    }
  });

  it("flags what it cannot understand instead of guessing", () => {
    const reason = (o: Record<string, unknown>) => {
      const m = mapTransaction(tx(o));
      return m.kind === "broken" ? m.reason : m.kind;
    };
    expect(reason({ txn_id: undefined })).toBe("missing_id");
    expect(reason({ amount: -5 })).toBe("bad_amount");
    expect(reason({ amount: "lots" })).toBe("bad_amount");
    expect(reason({ type: "SIDEWAYS" })).toBe("bad_direction");
    expect(reason({ service: "TELEPORT" })).toBe("unknown_service");
    expect(reason({ timestamp: "later" })).toBe("bad_timestamp");
  });

  it("stores a masked number, never the full counterparty phone", () => {
    const m = mapTransaction(
      tx({ counterparty_name: undefined, counterparty_msisdn: "+8801987654321" }),
    ) as unknown as { record: { counterparty: string } };
    expect(m.record.counterparty).toBe("***4321");
    expect(maskPhone("12")).toBe("");
  });

  it("follows a custom field map, so the real spec only needs configuration", () => {
    const m = mapTransaction(
      { id: 7, amt: "10", dir: "in", svc: "send_money", when: "2026-10-01T00:00:00Z", who: "Mum" },
      {
        fields: {
          id: "id",
          amount: "amt",
          direction: "dir",
          service: "svc",
          timestamp: "when",
          counterpartyName: "who",
        },
      },
    );
    expect(m).toMatchObject({
      kind: "record",
      record: { id: "upay-7", amount: 10, direction: "in", counterparty: "Mum" },
    });
  });
});

describe("UpayApiFeed", () => {
  const config = (impl: typeof fetch) => ({
    baseUrl: "https://api.upay.test/",
    apiKey: "secret",
    fetch: impl,
  });

  it("refuses to start without credentials", () => {
    expect(() => new UpayApiFeed({ baseUrl: "", apiKey: "" })).toThrow(FeedError);
  });

  it("follows the cursor, maps records, sends the key and works out the opening balance", async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith("/balance")) return { body: { balance: 1000 } };
      return url.searchParams.get("cursor") === "p2"
        ? { body: { data: [tx({ txn_id: "T3", type: "CREDIT", amount: 500 })], next_cursor: null } }
        : {
            body: {
              data: [tx({ txn_id: "T1", amount: 100 }), tx({ txn_id: "T2", status: "FAILED" })],
              next_cursor: "p2",
            },
          };
    });
    const feed = new UpayApiFeed(config(impl));
    const batch = await feed.pull(ctx, new Date(0));

    expect(feed.id).toBe("upay_api");
    expect(feed.simulated).toBe(false);
    expect(batch.records).toHaveLength(2);
    expect(checkFeedBatch(batch, NOW)).toEqual([]);
    // current balance 1000, net of the history = +500 - 100 = +400, so it started at 600
    expect(batch.openingBalance).toBe(600);
    expect(calls.every((c) => c.auth === "Bearer secret")).toBe(true);
    expect(calls[0]!.url.pathname).toBe("/v1/accounts/%2B8801712345678/transactions");
    expect(calls[0]!.url.searchParams.get("from")).toBeNull();
  });

  it("asks only for what is new on an incremental pull and skips the balance", async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { data: [], next_cursor: null } }));
    const batch = await new UpayApiFeed(config(impl)).pull(ctx, new Date("2026-10-01T00:00:00Z"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    expect(batch.openingBalance).toBeNull();
  });

  it("passes unreadable transactions on as broken records", async () => {
    const { impl } = fakeFetch(() => ({
      body: { data: [tx(), tx({ txn_id: "T2", service: "TELEPORT" })], next_cursor: null },
    }));
    const batch = await new UpayApiFeed(config(impl)).pull(ctx, new Date("2026-10-01T00:00:00Z"));
    expect(batch.records).toHaveLength(2);
    expect(batch.records[1]).toEqual({ id: "upay-T2", parse_error: "unknown_service" });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "not_found"],
    [500, "unavailable"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { impl } = fakeFetch(() => ({ status }));
    await expect(new UpayApiFeed(config(impl)).pull(ctx, new Date(0))).rejects.toMatchObject({
      code,
    });
  });

  it("maps network failure, bad shape and runaway cursors to unavailable", async () => {
    const down = fakeFetch(() => "throw").impl;
    await expect(new UpayApiFeed(config(down)).pull(ctx, new Date(0))).rejects.toMatchObject({
      code: "unavailable",
    });
    const odd = fakeFetch(() => ({ body: { nope: true } })).impl;
    await expect(new UpayApiFeed(config(odd)).pull(ctx, new Date(0))).rejects.toMatchObject({
      code: "unavailable",
    });
    const forever = fakeFetch(() => ({ body: { data: [], next_cursor: "again" } })).impl;
    await expect(
      new UpayApiFeed({ ...config(forever), maxPages: 3 }).pull(ctx, new Date(0)),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("needs a verified phone number", async () => {
    const { impl } = fakeFetch(() => ({}));
    await expect(
      new UpayApiFeed(config(impl)).pull({ userId: "u", phone: null }, new Date(0)),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps a missing balance endpoint from failing the history", async () => {
    const { impl } = fakeFetch((url) =>
      url.pathname.endsWith("/balance")
        ? { status: 404 }
        : { body: { data: [tx()], next_cursor: null } },
    );
    const batch = await new UpayApiFeed(config(impl)).pull(ctx, new Date(0));
    expect(batch.records).toHaveLength(1);
    expect(batch.openingBalance).toBeNull();
  });
});
