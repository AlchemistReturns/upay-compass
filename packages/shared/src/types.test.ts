import { describe, expect, it } from "vitest";
import { transactionSchema } from "./types";

describe("transactionSchema", () => {
  it("accepts a valid transaction", () => {
    const r = transactionSchema.safeParse({
      id: "t1",
      amount: 120,
      direction: "out",
      channel: "merchant",
      counterparty: "Pathao",
      occurred_at: "2026-01-01T10:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-positive amount", () => {
    const r = transactionSchema.safeParse({
      id: "t1",
      amount: 0,
      direction: "out",
      channel: "merchant",
      counterparty: "x",
      occurred_at: "2026-01-01T10:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });
});
