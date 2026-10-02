import { describe, expect, it } from "vitest";
import { budgetStatus } from "./budgets";

describe("budgetStatus", () => {
  it.each([
    [0, 1000, 0.8, "ok"],
    [799, 1000, 0.8, "ok"],
    [800, 1000, 0.8, "warning"],
    [1000, 1000, 0.8, "warning"],
    [1001, 1000, 0.8, "over"],
    [500, 1000, 1, "ok"],
  ] as const)("spent %s of %s at %s is %s", (spent, limit, threshold, expected) => {
    expect(budgetStatus(spent, limit, threshold)).toBe(expected);
  });
});
