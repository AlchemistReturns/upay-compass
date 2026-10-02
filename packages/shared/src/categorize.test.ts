import { describe, expect, it } from "vitest";
import type { CategoryKey } from "./categories";
import { categorize, normalizeKeyword, type CategorizableTransaction } from "./categorize";

type Golden = [
  direction: "in" | "out",
  channel: CategorizableTransaction["channel"],
  counterparty: string,
  note: string,
  expected: CategoryKey,
];

/** Hand-labelled set in the style of the simulated feed. The last three are merchants no keyword can know. */
const GOLDEN: Golden[] = [
  ["out", "merchant", "Foodpanda", "", "food"],
  ["out", "merchant", "Pathao", "ride to campus", "transport"],
  ["out", "merchant", "Pathao Food", "", "food"],
  ["out", "merchant", "Uber", "", "transport"],
  ["out", "recharge", "Grameenphone", "", "recharge_data"],
  ["out", "recharge", "01711223344", "", "recharge_data"],
  ["out", "bill", "DESCO", "", "bills"],
  ["out", "bill", "Titas Gas", "", "bills"],
  ["out", "bill", "Link3", "wifi", "bills"],
  ["out", "merchant", "Shwapno", "", "food"],
  ["out", "merchant", "Agora", "", "food"],
  ["out", "merchant", "Chaldal", "", "food"],
  ["out", "merchant", "Daraz", "", "shopping"],
  ["out", "merchant", "Aarong", "", "shopping"],
  ["out", "merchant", "Star Tech", "", "shopping"],
  ["out", "merchant", "Netflix", "", "entertainment"],
  ["out", "merchant", "Spotify", "", "entertainment"],
  ["out", "merchant", "Star Cineplex", "", "entertainment"],
  ["out", "send_money", "Rahim Sir", "tuition fee", "education"],
  ["out", "merchant", "Udemy", "", "education"],
  ["out", "merchant", "Rokomari", "books", "education"],
  ["out", "merchant", "Lazz Pharma", "medicine", "health"],
  ["out", "merchant", "Labaid Hospital", "", "health"],
  ["out", "send_money", "Ammu", "", "family"],
  ["out", "send_money", "Karim", "borrowed", "family"],
  ["out", "cash_out", "AB Bank ATM", "", "other"],
  ["out", "merchant", "Rickshaw", "", "transport"],
  ["out", "merchant", "বাজার", "", "food"],
  ["out", "merchant", "পাঠাও", "", "transport"],
  ["in", "add_money", "Salary", "", "income"],
  ["in", "send_money", "Abbu", "pocket money", "income"],
  ["in", "add_money", "bKash", "", "income"],
  ["out", "merchant", "DPS Savings", "", "savings"],
  ["out", "merchant", "সঞ্চয়", "ডিপিএস", "savings"],
  ["out", "merchant", "Robi", "data pack", "recharge_data"],
  ["out", "merchant", "KFC", "", "food"],
  ["out", "merchant", "Pizza Hut", "", "food"],
  ["out", "merchant", "Metro Rail", "", "transport"],
  ["out", "merchant", "Dhaka Bus", "fare", "transport"],
  ["out", "merchant", "Square Hospital", "", "health"],
  ["out", "merchant", "Bata", "", "shopping"],
  ["out", "merchant", "Steam", "", "entertainment"],
  ["out", "merchant", "Coaching Center", "", "education"],
  ["out", "merchant", "House Rent", "", "bills"],
  ["out", "send_money", "Sumi", "lunch", "food"],
  ["out", "merchant", "Tea Stall", "", "food"],
  ["out", "merchant", "Hoichoi", "", "entertainment"],
  ["out", "merchant", "Pathao", "parcel", "transport"],
  ["out", "merchant", "Rahim Store", "", "food"],
  ["out", "merchant", "Nila Traders", "", "shopping"],
  ["out", "merchant", "Sky Lounge", "", "entertainment"],
];

describe("categorize (golden set)", () => {
  it("has about 50 labelled transactions", () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(50);
  });

  it("classifies more than 85% correctly (unknowns count as misses)", () => {
    const misses: string[] = [];
    for (const [direction, channel, counterparty, note, expected] of GOLDEN) {
      const got = categorize({ direction, channel, counterparty, note })?.category ?? null;
      if (got !== expected)
        misses.push(`${counterparty} (${note}) -> ${got}, expected ${expected}`);
    }
    const accuracy = 1 - misses.length / GOLDEN.length;
    // Only the three unknowable merchants should be missed.
    expect(accuracy).toBeGreaterThan(0.85);
    expect(misses).toHaveLength(3);
  });
});

describe("categorize (behaviour)", () => {
  const base = { direction: "out", channel: "merchant" } as const;

  it("returns null for an unknown merchant so the AI fallback can run", () => {
    expect(categorize({ ...base, counterparty: "Zxq Traders" })).toBeNull();
  });

  it("user corrections beat every other rule and report source=user", () => {
    const rules = [{ keyword: normalizeKeyword("  Pathao "), category: "food" as const }];
    const r = categorize({ ...base, counterparty: "Pathao" }, rules);
    expect(r).toEqual({ category: "food", source: "user", matchedBy: "user_rule" });
  });

  it("user rules match the whole counterparty, not substrings", () => {
    const rules = [{ keyword: "pathao", category: "food" as const }];
    expect(categorize({ ...base, counterparty: "Pathao Food" }, rules)?.source).toBe("rule");
  });

  it("the longest keyword wins", () => {
    expect(categorize({ ...base, counterparty: "Pathao Food" })?.category).toBe("food");
    expect(categorize({ ...base, counterparty: "Pathao" })?.category).toBe("transport");
  });

  it("short keywords do not match inside other words", () => {
    expect(categorize({ ...base, counterparty: "Business Centre" })).toBeNull();
    expect(categorize({ ...base, counterparty: "GP" })?.category).toBe("recharge_data");
  });

  it("channel rules come before keywords; keywords come before weak channel defaults", () => {
    expect(
      categorize({ direction: "out", channel: "bill", counterparty: "Netflix" })?.category,
    ).toBe("bills");
    expect(
      categorize({ direction: "out", channel: "send_money", counterparty: "X", note: "tuition" })
        ?.category,
    ).toBe("education");
  });

  it("short Bangla keywords match whole tokens only", () => {
    expect(categorize({ ...base, counterparty: "মাছ" })).toBeNull();
    expect(categorize({ ...base, counterparty: "চা" })?.category).toBe("food");
    expect(categorize({ ...base, counterparty: "মা" })?.category).toBe("family");
    expect(categorize({ ...base, counterparty: "দোকান", note: "চা বিস্কুট" })?.category).toBe(
      "food",
    );
  });

  it("money in is income unless the user said otherwise", () => {
    expect(
      categorize({ direction: "in", channel: "send_money", counterparty: "Netflix refund" })
        ?.category,
    ).toBe("income");
  });
});
