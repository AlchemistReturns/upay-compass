import { describe, expect, it } from "vitest";
import { explainTransaction, parseExplainRpc, type ExplainFacts } from "./explain";

const facts = (over: Partial<ExplainFacts> = {}): ExplainFacts => ({
  tx: { direction: "out", channel: "merchant", counterparty: "Campus Canteen", note: "" },
  categoryKey: "food",
  categorySource: "rule",
  needsReview: false,
  userRuleKeyword: null,
  anomaly: null,
  ...over,
});

describe("explaining how a payment was categorized", () => {
  it("a keyword rule names the keyword that matched", () => {
    const e = explainTransaction(facts());
    expect(e.categorization).toEqual({ kind: "keyword", keyword: "canteen" });
  });

  it("a keyword in the note counts too", () => {
    const e = explainTransaction(
      facts({
        tx: {
          direction: "out",
          channel: "merchant",
          counterparty: "Pathao",
          note: "ride to campus",
        },
        categoryKey: "transport",
      }),
    );
    expect(e.categorization.kind).toBe("keyword");
    expect(e.categorization.keyword).toBeTruthy();
  });

  it("money received is income by direction", () => {
    const e = explainTransaction(
      facts({
        tx: { direction: "in", channel: "add_money", counterparty: "Employer Ltd", note: "salary" },
        categoryKey: "income",
      }),
    );
    expect(e.categorization).toEqual({ kind: "income_direction" });
  });

  it("recharge and bill payments go by their channel", () => {
    const recharge = explainTransaction(
      facts({
        tx: { direction: "out", channel: "recharge", counterparty: "Grameenphone", note: "" },
        categoryKey: "recharge_data",
      }),
    );
    expect(recharge.categorization).toEqual({ kind: "channel", channel: "recharge" });
    const bill = explainTransaction(
      facts({
        tx: { direction: "out", channel: "bill", counterparty: "DESCO", note: "electricity" },
        categoryKey: "bills",
      }),
    );
    expect(bill.categorization).toEqual({ kind: "channel", channel: "bill" });
  });

  it("send money with no keyword falls back to its channel default", () => {
    const e = explainTransaction(
      facts({
        tx: { direction: "out", channel: "send_money", counterparty: "Zzyzx", note: "" },
        categoryKey: "family",
      }),
    );
    expect(e.categorization).toEqual({ kind: "channel_default", channel: "send_money" });
  });

  it("a saved correction names the merchant the user taught the app", () => {
    const e = explainTransaction(
      facts({ categorySource: "user", categoryKey: "shopping", userRuleKeyword: "campus canteen" }),
    );
    expect(e.categorization).toEqual({ kind: "user_rule", keyword: "campus canteen" });
  });

  it("an AI categorization says no rule matched and the AI suggested it", () => {
    const e = explainTransaction(
      facts({
        tx: { direction: "out", channel: "merchant", counterparty: "Nila Traders", note: "" },
        categoryKey: "shopping",
        categorySource: "ai",
      }),
    );
    expect(e.categorization).toEqual({ kind: "ai" });
  });

  it("nothing matched and the AI was unsure: filed under Other for review", () => {
    const e = explainTransaction(
      facts({
        tx: { direction: "out", channel: "merchant", counterparty: "Rahim Store", note: "" },
        categoryKey: "other",
        needsReview: true,
      }),
    );
    expect(e.categorization).toEqual({ kind: "unmatched" });
  });

  it("when today's rules no longer agree with the stored category it only says a rule decided", () => {
    const e = explainTransaction(facts({ categoryKey: "shopping" }));
    expect(e.categorization).toEqual({ kind: "rule" });
  });

  it("carries the unusual-payment facts through untouched", () => {
    const anomaly = {
      rule: "robust_z" as const,
      bucket: "merchant" as const,
      amount: 1800,
      typical: 150,
      z: 82.5,
      observations: 40,
    };
    expect(explainTransaction(facts({ anomaly })).anomaly).toEqual(anomaly);
    expect(explainTransaction(facts()).anomaly).toBeNull();
  });
});

describe("parseExplainRpc", () => {
  const anomaly = {
    rule: "new_counterparty",
    bucket: "category",
    amount: 500,
    typical: 100,
    z: null,
    observations: 3,
  };

  it("reads the database function's answer", () => {
    expect(
      parseExplainRpc({
        category_source: "user",
        needs_review: false,
        category_key: "food",
        user_rule_keyword: "tea stall",
        anomaly,
      }),
    ).toEqual({
      category_source: "user",
      needs_review: false,
      category_key: "food",
      user_rule_keyword: "tea stall",
      anomaly,
    });
  });

  it("rejects an answer it does not understand", () => {
    expect(parseExplainRpc(null)).toBeNull();
    expect(parseExplainRpc({ category_source: "magic" })).toBeNull();
  });
});
