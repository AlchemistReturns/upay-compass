import { describe, expect, it } from "vitest";
import { UpaySimPlanProvider } from "./plan";

const req = {
  goalId: "g1",
  monthlyAmount: 2000,
  tenureMonths: 12,
  illustrativeRate: 0.07,
  projectedMaturity: 24_932,
};

describe("UpaySimPlanProvider", () => {
  it("returns a reference and the status requested", async () => {
    const p = new UpaySimPlanProvider(() => "abcd1234-0000-0000-0000-000000000000");
    expect(await p.createSavingsPlan(req)).toEqual({
      reference: "DPS-ABCD1234",
      status: "requested",
    });
  });

  it("gives different references for different ids", async () => {
    const p = new UpaySimPlanProvider();
    const [a, b] = await Promise.all([p.createSavingsPlan(req), p.createSavingsPlan(req)]);
    expect(a.reference).not.toBe(b.reference);
    expect(a.reference).toMatch(/^DPS-[0-9A-F]{8}$/);
  });

  it("rejects an unusable request", async () => {
    const p = new UpaySimPlanProvider();
    await expect(p.createSavingsPlan({ ...req, monthlyAmount: 0 })).rejects.toThrow();
    await expect(p.createSavingsPlan({ ...req, tenureMonths: 1.5 })).rejects.toThrow();
  });
});
