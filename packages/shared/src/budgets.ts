export type BudgetStatus = "ok" | "warning" | "over";

/** warning from the alert threshold up to the limit, over once the limit is passed. */
export function budgetStatus(spent: number, limit: number, threshold: number): BudgetStatus {
  if (spent > limit) return "over";
  if (spent >= limit * threshold) return "warning";
  return "ok";
}
