import { describe, expect, it } from "vitest";
import { FeedError, checkFeedBatch } from "@compass/shared";
import {
  StatementError,
  StatementFeed,
  parseAmount,
  parseCsv,
  parseStatement,
  parseStatementDate,
} from "./index";

const ctx = { userId: "u", phone: "+8801700000001" };
const NOW = new Date("2026-10-10T00:00:00Z");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });

  it("detects semicolon separated files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,250.50", 1250.5],
    ["৳ 500", 500],
    ["Tk 75", 75],
    ["BDT 1,000", 1000],
    ["(500)", -500],
    ["-45.5", -45.5],
    ["১২০০", 1200],
  ])("%s", (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it.each(["", "abc", "12.3.4", "1e5"])("rejects %j", (raw) => expect(parseAmount(raw)).toBeNull());
});

describe("parseStatementDate", () => {
  it("treats a date without a zone as Bangladesh time", () => {
    expect(parseStatementDate("2026-09-30 14:05")).toBe("2026-09-30T08:05:00.000Z");
    expect(parseStatementDate("30/09/2026 14:05")).toBe("2026-09-30T08:05:00.000Z");
    expect(parseStatementDate("30-09-2026")).toBe("2026-09-29T18:00:00.000Z");
    expect(parseStatementDate("30/09/2026 2:05 PM")).toBe("2026-09-30T08:05:00.000Z");
  });

  it("keeps an explicit zone", () => {
    expect(parseStatementDate("2026-09-30T14:05:00Z")).toBe("2026-09-30T14:05:00.000Z");
    expect(parseStatementDate("2026-09-30T14:05:00+0600")).toBe("2026-09-30T08:05:00.000Z");
  });

  it("is day-first for slashes and rejects impossible dates", () => {
    expect(parseStatementDate("03/04/2026")).toBe("2026-04-02T18:00:00.000Z");
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("2026-13-01")).toBeNull();
    expect(parseStatementDate("yesterday")).toBeNull();
  });
});

describe("parseStatement", () => {
  it("reads a type column and infers the channel", () => {
    const csv = [
      "Date,Type,Amount,Name,Note",
      "2026-10-01 09:00,Credit,5000,Employer Ltd,salary",
      "2026-10-02 12:30,Debit,120,Rahim Tea Stall,",
      "2026-10-03 18:00,Debit,500,Grameenphone,recharge",
      "2026-10-04 10:00,Debit,2000,ATM,cash out",
    ].join("\n");
    const { rows } = parseStatement(csv);
    expect(rows.map((r) => r.record?.direction)).toEqual(["in", "out", "out", "out"]);
    expect(rows.map((r) => r.record?.channel)).toEqual([
      "send_money",
      "merchant",
      "recharge",
      "cash_out",
    ]);
  });

  it("reads separate credit and debit columns", () => {
    const csv = [
      "Date,Description,Credit,Debit",
      "01/10/2026,Bonus,1000,",
      "02/10/2026,Lunch,,150",
    ].join("\n");
    const { rows } = parseStatement(csv);
    expect(rows.map((r) => [r.record?.direction, r.record?.amount])).toEqual([
      ["in", 1000],
      ["out", 150],
    ]);
  });

  it("reads one signed amount column", () => {
    const csv = ["date,amount,name", "2026-10-01,3000,Mother", "2026-10-02,-250,Shop"].join("\n");
    expect(parseStatement(csv).rows.map((r) => r.record?.direction)).toEqual(["in", "out"]);
  });

  it("refuses a file where every amount is positive and nothing says which way", () => {
    const csv = ["date,amount,name", "2026-10-01,3000,Mother", "2026-10-02,250,Shop"].join("\n");
    expect(() => parseStatement(csv)).toThrow(new StatementError("direction_unknown"));
  });

  it("reports unreadable rows without dropping the rest", () => {
    const csv = [
      "date,amount,type,name",
      "2026-10-01,100,debit,Shop",
      "not a date,100,debit,Shop",
      "2026-10-03,abc,debit,Shop",
      "2026-10-04,100,debit,",
      "2026-10-05,100,sideways,Shop",
    ].join("\n");
    const { rows } = parseStatement(csv);
    expect(rows.map((r) => r.error)).toEqual([
      null,
      "bad_date",
      "bad_amount",
      "bad_counterparty",
      "bad_direction",
    ]);
    expect(rows[1]?.line).toBe(3);
  });

  it("gives identical rows distinct, stable ids", () => {
    const csv = [
      "date,amount,type,name",
      "2026-10-01 10:00,20,debit,Tea",
      "2026-10-01 10:00,20,debit,Tea",
    ].join("\n");
    const a = parseStatement(csv).rows.map((r) => r.record!.id);
    const b = parseStatement(csv).rows.map((r) => r.record!.id);
    expect(a[0]).not.toBe(a[1]);
    expect(a).toEqual(b);
  });

  it("works out the opening balance from a balance column", () => {
    const csv = [
      "date,amount,type,name,balance",
      "2026-10-01 09:00,1000,credit,Employer,1500",
      "2026-10-02 09:00,200,debit,Shop,1300",
    ].join("\n");
    expect(parseStatement(csv).openingBalance).toBe(500);
  });

  it("rejects files that are unusable as a whole", () => {
    expect(() => parseStatement("date,amount\n")).toThrow("no_rows");
    expect(() => parseStatement("foo,bar\n1,2")).toThrow("missing_columns");
    expect(() => parseStatement("x".repeat(1_000_001))).toThrow("file_too_large");
  });
});

describe("StatementFeed", () => {
  const csv = [
    "Date,Type,Amount,Name",
    "2026-10-01 09:00,Credit,5000,Employer Ltd",
    "2026-10-02 12:30,Debit,120,Rahim Tea Stall",
    "garbage,Debit,1,x",
  ].join("\n");

  it("passes the conformance check apart from the broken row it reports", async () => {
    const feed = new StatementFeed(csv);
    const batch = await feed.pull(ctx, new Date(0));
    expect(feed.id).toBe("statement_csv");
    expect(feed.simulated).toBe(false);
    expect(batch.records).toHaveLength(3);
    const problems = checkFeedBatch(batch, NOW);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("record 2");
  });

  it("honours since and an opening balance typed by the person", async () => {
    const feed = new StatementFeed(csv, { openingBalance: 250 });
    const batch = await feed.pull(ctx, new Date("2026-10-02T00:00:00Z"));
    expect(batch.records).toHaveLength(2);
    expect(batch.openingBalance).toBe(250);
  });

  it("turns a bad file into an invalid_input feed error", async () => {
    await expect(new StatementFeed("foo,bar\n1,2").pull(ctx, new Date(0))).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(new StatementFeed("foo,bar\n1,2").pull(ctx, new Date(0))).rejects.toBeInstanceOf(
      FeedError,
    );
  });
});
