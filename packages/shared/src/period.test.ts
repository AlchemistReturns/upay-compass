import { describe, expect, it } from "vitest";
import { getPeriodRange } from "./period";

// 2026-10-02 is a Friday. 15:00 UTC is 21:00 in Dhaka, still the 2nd.
const now = new Date("2026-10-02T15:00:00Z");

describe("getPeriodRange", () => {
  it("week starts on Monday (Dhaka midnight) and ends at the next midnight", () => {
    expect(getPeriodRange("week", now)).toEqual({
      from: "2026-09-27T18:00:00.000Z", // Mon 28 Sep 00:00 +06
      to: "2026-10-02T18:00:00.000Z", // Sat 3 Oct 00:00 +06
    });
  });

  it("month starts on the 1st", () => {
    expect(getPeriodRange("month", now).from).toBe("2026-09-30T18:00:00.000Z");
  });

  it("quarter is the current month plus the two before it", () => {
    expect(getPeriodRange("quarter", now).from).toBe("2026-07-31T18:00:00.000Z");
  });

  it("uses the Dhaka date, not the UTC date, near midnight", () => {
    // 19:00 UTC on 2 Oct is already 1:00 on 3 Oct in Dhaka.
    const lateNight = new Date("2026-10-02T19:00:00Z");
    expect(getPeriodRange("week", lateNight).to).toBe("2026-10-03T18:00:00.000Z");
    expect(getPeriodRange("month", lateNight).from).toBe("2026-09-30T18:00:00.000Z");
  });

  it("handles a week that starts in the previous month and year-end quarters", () => {
    const newYear = new Date("2027-01-02T06:00:00Z"); // Saturday
    expect(getPeriodRange("week", newYear).from).toBe("2026-12-27T18:00:00.000Z"); // Mon 28 Dec
    expect(getPeriodRange("quarter", newYear).from).toBe("2026-10-31T18:00:00.000Z"); // 1 Nov
  });
});
