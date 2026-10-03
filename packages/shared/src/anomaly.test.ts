import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "./dates";
import {
  MIN_SCALE,
  Z_THRESHOLD,
  detectAnomalies,
  modifiedZ,
  robustScale,
  type AnomalyTx,
} from "./anomaly";

/** The first Friday on or after 2026-07-03, then every following Friday. */
const FRIDAYS = (() => {
  let d = "2026-07-03";
  while (weekdayOf(d) !== 5) d = addDays(d, 1);
  return Array.from({ length: 12 }, (_, i) => addDays(d, 7 * i));
})();

let seq = 0;
const tx = (day: string, amount: number, over: Partial<AnomalyTx> = {}): AnomalyTx => ({
  id: `t${String(++seq).padStart(4, "0")}`,
  direction: "out",
  channel: "merchant",
  counterparty: "Campus Canteen",
  amount,
  occurred_at: `${day}T06:00:00Z`,
  category: "food",
  ...over,
});

const NOW = new Date("2026-09-30T08:00:00Z");

describe("robust scale and modified z-score (hand-computed)", () => {
  it("a tight bucket is held at the Rs 20 floor", () => {
    // values 100,110,90,105,95: median 100; |deviations| 0,10,10,5,5 -> MAD 5; 1.4826 x 5 = 7.4 < 20
    const s = robustScale([100, 110, 90, 105, 95]);
    expect(s.median).toBe(100);
    expect(s.mad).toBe(5);
    expect(s.scale).toBe(MIN_SCALE);
    expect(modifiedZ(200, [100, 110, 90, 105, 95]).z).toBe(5); // 100 / 20
    expect(modifiedZ(160, [100, 110, 90, 105, 95]).z).toBe(3); // 60 / 20
    expect(modifiedZ(170, [100, 110, 90, 105, 95]).z).toBe(Z_THRESHOLD); // 70 / 20 = 3.5 exactly
  });

  it("a wide bucket uses 1.4826 x MAD", () => {
    // 100..500: median 300; |deviations| 200,100,0,100,200 -> MAD 100; scale 148.26
    const bucket = [100, 200, 300, 400, 500];
    expect(robustScale(bucket).scale).toBeCloseTo(148.26, 2);
    expect(modifiedZ(900, bucket).z).toBeCloseTo(4.0467, 3); // 600 / 148.26
    expect(modifiedZ(800, bucket).z).toBeCloseTo(3.3725, 3); // 500 / 148.26
  });

  it("is the same number as 0.6745 x (x - median) / MAD above the floor", () => {
    const bucket = [100, 200, 300, 400, 500];
    const { median: med, mad } = robustScale(bucket);
    expect(modifiedZ(900, bucket).z).toBeCloseTo((0.6745 * (900 - med)) / mad, 3);
  });
});

describe("detectAnomalies: rule 1 (same category and weekday)", () => {
  const history = () => [100, 110, 90, 105, 95].map((a, i) => tx(FRIDAYS[i]!, a)); // five Fridays, as above

  it("flags a payment far above the usual amount for that weekday, with the numbers", () => {
    const target = tx(FRIDAYS[5]!, 200);
    const r = detectAnomalies([...history(), target], { candidateFrom: FRIDAYS[5]! }, NOW);
    expect(r).toEqual([
      {
        txId: target.id,
        category: "food",
        amount: 200,
        typical: 100,
        z: 5,
        bucket: "merchant",
        rule: "robust_z",
        observations: 5,
      },
    ]);
  });

  it("does not flag a payment at or below the threshold", () => {
    for (const amount of [160, 170, 40, 100]) {
      const r = detectAnomalies(
        [...history(), tx(FRIDAYS[5]!, amount)],
        { candidateFrom: FRIDAYS[5]! },
        NOW,
      );
      expect(r, `amount ${amount}`).toEqual([]);
    }
    // 171 -> z = 71 / 20 = 3.55
    const r = detectAnomalies(
      [...history(), tx(FRIDAYS[5]!, 171)],
      { candidateFrom: FRIDAYS[5]! },
      NOW,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.z).toBe(3.6); // 3.55 rounded to one decimal
  });

  it("needs at least five earlier payments in the bucket (four are not enough)", () => {
    const four = history().slice(0, 4);
    const r = detectAnomalies([...four, tx(FRIDAYS[4]!, 900)], { candidateFrom: FRIDAYS[4]! }, NOW);
    expect(r).toEqual([]);
  });

  it("compares like with like: other weekdays and other categories are separate buckets", () => {
    // five Sundays of Rs 1000 food and five Fridays of Rs 100 transport do not make a Friday Rs 200 food unusual-or-not
    const sundays = Array.from({ length: 5 }, (_, i) => tx(addDays(FRIDAYS[i]!, 2), 1000));
    const transport = FRIDAYS.slice(0, 5).map((d) =>
      tx(d, 100, { category: "transport", counterparty: "Rickshaw" }),
    );
    const r = detectAnomalies(
      [...sundays, ...transport, tx(FRIDAYS[5]!, 200)],
      { candidateFrom: FRIDAYS[5]! },
      NOW,
    );
    expect(r).toEqual([]); // no Friday food bucket yet, and a known merchant (rule 2 needs a first-time one)
  });

  it("only looks back 90 days", () => {
    const old = [100, 110, 90, 105, 95].map((a, i) => tx(addDays(FRIDAYS[0]!, -200 + i * 7), a));
    const r = detectAnomalies([...old, tx(FRIDAYS[0]!, 900)], { candidateFrom: FRIDAYS[0]! }, NOW);
    expect(r).toEqual([]); // the history is too old to count
  });

  it("flags only upward outliers, and never money in, savings or recurring payments", () => {
    const base = history();
    const income = tx(FRIDAYS[5]!, 5000, { direction: "in", category: "income" });
    const saving = tx(FRIDAYS[5]!, 5000, { category: "savings", counterparty: "DPS" });
    expect(detectAnomalies([...base, income, saving], { candidateFrom: FRIDAYS[5]! }, NOW)).toEqual(
      [],
    );

    // rent on the 5th every month is expected, even though it dwarfs everything else in "bills"
    const rent = ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05"].map((d) =>
      tx(d, 6500, { category: "bills", counterparty: "Landlord", channel: "send_money" }),
    );
    expect(detectAnomalies(rent, { candidateFrom: "2026-09-05" }, NOW)).toEqual([]);
  });

  it("only returns candidates on or after candidateFrom", () => {
    const early = tx(FRIDAYS[5]!, 900);
    const late = tx(FRIDAYS[6]!, 900);
    const r = detectAnomalies([...history(), early, late], { candidateFrom: FRIDAYS[6]! }, NOW);
    expect(r.map((a) => a.txId)).toEqual([late.id]);
  });

  it("gives the same answer however the input is ordered", () => {
    const all = [...history(), tx(FRIDAYS[5]!, 200)];
    const a = detectAnomalies(all, { candidateFrom: FRIDAYS[0]! }, NOW);
    const b = detectAnomalies([...all].reverse(), { candidateFrom: FRIDAYS[0]! }, NOW);
    expect(b).toEqual(a);
  });
});

describe("detectAnomalies: comparing with the same merchant first", () => {
  // a delivery app (Rs 250 to 450) and a canteen (Rs 90 to 110) are both "food"
  const mixed = () => [
    ...[100, 90, 110, 95, 105].map((a, i) => tx(addDays(FRIDAYS[0]!, i * 2), a)),
    ...[250, 450, 300, 400, 350].map((a, i) =>
      tx(addDays(FRIDAYS[0]!, 1 + i * 2), a, { counterparty: "Foodpanda" }),
    ),
  ];
  const day = addDays(FRIDAYS[0]!, 14);

  it("a normal delivery order is not unusual just because the canteen is cheaper", () => {
    const order = tx(day, 400, { counterparty: "Foodpanda" });
    // against the whole category it would look far out (Friday canteen bucket median ~100, z = 15)
    const categoryOnly = detectAnomalies(
      [...mixed(), order],
      { candidateFrom: day, bucketing: "category_weekday" },
      NOW,
    );
    expect(categoryOnly.map((a) => a.txId)).toEqual([]); // fewer than 5 Friday payments here, so quiet either way
    expect(detectAnomalies([...mixed(), order], { candidateFrom: day }, NOW)).toEqual([]);
  });

  it("a canteen lunch ten times the usual is flagged, with the merchant's own typical amount", () => {
    const lunch = tx(day, 1000);
    const r = detectAnomalies([...mixed(), lunch], { candidateFrom: day }, NOW);
    expect(r).toHaveLength(1);
    // merchant bucket: 100,90,110,95,105 -> median 100, MAD 5, scale 20 (floor): z = 900 / 20 = 45
    expect(r[0]).toMatchObject({ bucket: "merchant", typical: 100, z: 45, rule: "robust_z" });
  });

  it("falls back to the category and weekday bucket for a merchant with little history", () => {
    const history = [100, 110, 90, 105, 95].map((a, i) =>
      tx(FRIDAYS[i]!, a, { counterparty: `Stall ${i}` }),
    );
    const target = tx(FRIDAYS[5]!, 200, { counterparty: "Stall 9" });
    const r = detectAnomalies([...history, target], { candidateFrom: FRIDAYS[5]! }, NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bucket: "category_weekday", z: 5 });
  });
});

describe("detectAnomalies: rule 2 (first-time counterparty in a sparse bucket)", () => {
  // three earlier food payments of 100, 120, 80 on different weekdays: median 100, no bucket of 5
  const base = () => [
    tx(addDays(FRIDAYS[0]!, 0), 100),
    tx(addDays(FRIDAYS[0]!, 1), 120),
    tx(addDays(FRIDAYS[0]!, 2), 80),
  ];
  const day = addDays(FRIDAYS[0]!, 10);

  it("flags a first-time merchant paid more than twice the category median and at least Rs 300 above it", () => {
    const t = tx(day, 500, { counterparty: "Fancy Place" });
    const r = detectAnomalies([...base(), t], { candidateFrom: day }, NOW);
    expect(r).toEqual([
      {
        txId: t.id,
        category: "food",
        amount: 500,
        typical: 100,
        z: null,
        bucket: "category",
        rule: "new_counterparty",
        observations: 3,
      },
    ]);
  });

  it("does not flag a known merchant, a small excess, or a category with too little history", () => {
    expect(detectAnomalies([...base(), tx(day, 500)], { candidateFrom: day }, NOW)).toEqual([]); // known merchant
    expect(
      detectAnomalies(
        [...base(), tx(day, 350, { counterparty: "Fancy Place" })],
        { candidateFrom: day },
        NOW,
      ),
    ).toEqual([]); // 350 < 400 (350 - 100 = 250 < 300)
    expect(
      detectAnomalies(
        [...base().slice(0, 2), tx(day, 900, { counterparty: "Fancy Place" })],
        { candidateFrom: day },
        NOW,
      ),
    ).toEqual([]); // only 2 earlier payments
  });
});
