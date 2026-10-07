import type { SavingsPlanProvider, SavingsPlanReceipt, SavingsPlanRequest } from "@compass/shared";

/**
 * Savings-plan provider for the demo. It contacts no one and moves no money: it checks the request
 * and returns a reference with status "requested". A real upay product API would implement
 * SavingsPlanProvider the same way and be created in its place (see docs/integration/upay-adapter.md).
 */
export class UpaySimPlanProvider implements SavingsPlanProvider {
  /** `newId` is injectable so tests get stable references. */
  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

  async createSavingsPlan(req: SavingsPlanRequest): Promise<SavingsPlanReceipt> {
    if (!(req.monthlyAmount > 0)) throw new Error("monthlyAmount must be above 0");
    if (!Number.isInteger(req.tenureMonths) || req.tenureMonths < 1) {
      throw new Error("tenureMonths must be a whole number of months");
    }
    const reference = `DPS-${this.newId().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    return { reference, status: "requested" };
  }
}
