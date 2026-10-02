import { describe, expect, it } from "vitest";
import { addDays, dayDiff, mondayOf, weekdayOf, addMonths, dhakaDay } from "./dates";
import { backtestForecast, canAfford, forecastCashflow } from "./forecast";
import { detectRecurring, type FlowTx } from "./recurring";

const NOW = new Date("2026-10-02T08:00:00Z"); // 14:00 on Fri 2 Oct in Dhaka

const tx = (
  day: string,
  direction: "in" | "out",
  channel: FlowTx["channel"],
  counterparty: string,
  amount: number,
  essential = false,
): FlowTx => ({
  direction,
  channel,
  counterparty,
  amount,
  occurred_at: `${day}T06:00:00Z`, // noon in Dhaka
  essential,
});

/** 300 a day of essentials, rent of 10,000 on the 5th, salary of 30,000 on the 1st. */
function steady(from: string, to: string): FlowTx[] {
  const out: FlowTx[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(tx(d, "out", "merchant", "Tea Stall", 300, true));
    const dom = Number(d.slice(8));
    if (dom === 5) out.push(tx(d, "out", "send_money", "Landlord", 10000));
    if (dom === 1) out.push(tx(d, "in", "add_money", "Employer", 30000));
  }
  return out;
}

describe("date helpers", () => {
  it("work in Bangladesh time", () => {
    expect(dhakaDay("2026-10-02T19:00:00Z")).toBe("2026-10-03");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(dayDiff("2026-09-30", "2026-10-02")).toBe(2);
    expect(weekdayOf("2026-10-02")).toBe(5);
    expect(mondayOf("2026-10-02")).toBe("2026-09-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
});

describe("detectRecurring", () => {
  it("finds a stable weekly income and plans its next date", () => {
    const thursdays = ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"];
    const [item] = detectRecurring(
      thursdays.map((d) => tx(d, "in", "add_money", "Payout", 5000)),
      NOW,
    );
    expect(item).toMatchObject({
      cadence: "weekly",
      amountStable: true,
      expectedAmount: 5000,
      lastDay: "2026-10-01",
      nextDay: "2026-10-08",
    });
  });

  it("is cautious when amounts vary: low end for income, high end for payments", () => {
    const days = ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"];
    const income = [2000, 6000, 3000, 8000, 4000].map((a, i) =>
      tx(days[i]!, "in", "add_money", "Gig Payout", a),
    );
    const bill = [650, 900, 700, 850, 800].map((a, i) =>
      tx(days[i]!, "out", "bill", "Power Co", a),
    );
    const items = detectRecurring([...income, ...bill], NOW);
    const inc = items.find((i) => i.direction === "in")!;
    const pay = items.find((i) => i.direction === "out")!;
    expect(inc.amountStable).toBe(false);
    expect(inc.expectedAmount).toBe(3000); // 25th percentile of 2000,3000,4000,6000,8000
    expect(pay.expectedAmount).toBe(850); // 75th percentile of 650,700,800,850,900
  });

  it("ignores daily habits, one-offs, pairs, and schedules that stopped", () => {
    const daily = steady("2026-09-01", "2026-10-02").filter((t) => t.counterparty === "Tea Stall");
    const pair = [
      tx("2026-08-05", "out", "bill", "Two Times", 100),
      tx("2026-09-05", "out", "bill", "Two Times", 100),
    ];
    const stopped = ["2026-05-01", "2026-06-01", "2026-07-01"].map((d) =>
      tx(d, "out", "bill", "Old Sub", 500),
    );
    expect(detectRecurring([...daily, ...pair, ...stopped], NOW)).toEqual([]);
  });

  it("detects monthly schedules and fortnightly ones", () => {
    const monthly = ["2026-07-05", "2026-08-05", "2026-09-05"].map((d) =>
      tx(d, "out", "send_money", "Landlord", 10000),
    );
    const fortnight = ["2026-09-04", "2026-09-18", "2026-10-02"].map((d) =>
      tx(d, "out", "merchant", "Gym", 1500),
    );
    const items = detectRecurring([...monthly, ...fortnight], NOW);
    expect(items.find((i) => i.counterparty === "Landlord")).toMatchObject({
      cadence: "monthly",
      nextDay: "2026-10-05",
    });
    expect(items.find((i) => i.counterparty === "Gym")).toMatchObject({
      cadence: "biweekly",
      nextDay: "2026-10-16",
    });
  });
});

describe("forecastCashflow (hand-computed)", () => {
  const history = steady("2026-07-05", "2026-10-02");

  it("projects balance = start - 300/day - rent on the 5th + salary on 1 Nov, and flags the dip", () => {
    const f = forecastCashflow({ now: NOW, balance: 20000, transactions: history });
    expect(f.insufficient).toBe(false);
    expect(f.series).toHaveLength(31);
    expect(f.series[0]).toEqual({ day: "2026-10-02", balance: 20000 });
    expect(f.series[1]).toEqual({ day: "2026-10-03", balance: 19700 });
    expect(f.series[3]).toEqual({ day: "2026-10-05", balance: 9100 }); // 20000 - 900 - 10000
    expect(f.series[30]).toEqual({ day: "2026-11-01", balance: 31000 }); // salary lands

    expect(f.safetyBuffer).toBe(2100); // 7 days of 300 essentials
    expect(f.risks.map((r) => [r.day, r.balance, r.level])).toEqual([
      ["2026-10-29", 1900, "low"],
      ["2026-10-30", 1600, "low"],
      ["2026-10-31", 1300, "low"],
    ]);
    expect(f.firstRiskDay).toBe("2026-10-29");
    expect(f.lowest).toEqual({ day: "2026-10-31", balance: 1300 });
    expect(f.expectedIncome).toBe(30000);
    expect(f.expectedBills).toBe(10000);
    expect(f.confidence).toBe("ok");
  });

  it("flags a negative balance as such", () => {
    const f = forecastCashflow({ now: NOW, balance: 5000, transactions: history });
    expect(f.risks.some((r) => r.level === "negative")).toBe(true);
    expect(f.lowest!.balance).toBeLessThan(0);
  });

  it("refuses to forecast on too little history, instead of guessing", () => {
    const short = steady("2026-09-25", "2026-10-02");
    const f = forecastCashflow({ now: NOW, balance: 20000, transactions: short });
    expect(f.insufficient).toBe(true);
    expect(f.series).toEqual([]);
    expect(forecastCashflow({ now: NOW, balance: 0, transactions: [] }).insufficient).toBe(true);
  });
});

describe("canAfford (code decides, the coach only explains)", () => {
  const history = steady("2026-07-05", "2026-10-02");

  it("says yes when the balance stays above the safety buffer", () => {
    const f = forecastCashflow({ now: NOW, balance: 40000, transactions: history });
    const a = canAfford(5000, 40000, f);
    expect(a.verdict).toBe("yes");
    expect(a.balanceAfter).toBe(35000);
    expect(a.lowestAfter).toBe(16300); // 21300 lowest point - 5000
  });

  it("says tight when it stays positive but dips under the buffer", () => {
    const f = forecastCashflow({ now: NOW, balance: 20000, transactions: history });
    const a = canAfford(500, 20000, f);
    expect(a.verdict).toBe("tight");
    expect(a.lowestAfter).toBe(800);
    expect(a.lowestDay).toBe("2026-10-31");
  });

  it("says no when the balance would go negative, and when", () => {
    const f = forecastCashflow({ now: NOW, balance: 20000, transactions: history });
    const a = canAfford(5000, 20000, f);
    expect(a.verdict).toBe("no");
    expect(a.firstNegativeDay).toBe("2026-10-19"); // 5000 - 300 * 17 < 0
    expect(canAfford(25000, 20000, f).verdict).toBe("no");
  });

  it("does not guess without a forecast", () => {
    const f = forecastCashflow({ now: NOW, balance: 100, transactions: [] });
    expect(canAfford(500, 100, f)).toMatchObject({ verdict: "insufficient", balanceAfter: -400 });
  });
});

describe("backtestForecast", () => {
  const long = steady("2026-05-05", "2026-10-02");
  // After the cut the account's real balance is whatever the history implies.
  const balance = long.reduce((n, t) => n + (t.direction === "in" ? t.amount : -t.amount), 20000);

  it("beats a seasonal-naive forecast on held-out days", () => {
    const b = backtestForecast({ now: NOW, balance, transactions: long }, 30);
    expect(b).not.toBeNull();
    expect(b!.days).toBe(30);
    expect(b!.mae).toBeLessThan(1); // recurring salary and rent are placed on the right days
    expect(b!.naiveMae).toBeGreaterThan(1000); // a 28-day repeat misses rent and salary
    expect(b!.improvementPct).toBeGreaterThan(90);
  });

  it("returns null when there is not enough history before the cut", () => {
    const short = steady("2026-09-01", "2026-10-02");
    expect(backtestForecast({ now: NOW, balance: 1000, transactions: short }, 30)).toBeNull();
  });
});
