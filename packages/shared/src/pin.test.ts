import { describe, expect, it } from "vitest";
import { createPinRecord, verifyPin } from "./pin";

describe("pin hashing", () => {
  it("verifies the right pin and rejects a wrong one", async () => {
    const rec = await createPinRecord("4321", 1000);
    expect(await verifyPin("4321", rec)).toBe(true);
    expect(await verifyPin("1234", rec)).toBe(false);
  });

  it("uses a fresh salt per record and never stores the pin", async () => {
    const a = await createPinRecord("4321", 1000);
    const b = await createPinRecord("4321", 1000);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain("4321");
  });
});
