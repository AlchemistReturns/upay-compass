import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "../dates.ts";
import { forecastCashflow } from "../forecast.ts";
import { forecastForMode } from "./forecast-mode.ts";
import { detectRecurring, type FlowTx } from "../recurring.ts";
import { ensemblePredictor } from "./forecast-ensemble.ts";
import { addForecastTrainingRows, ridgeSpendPredictor } from "./forecast-ridge.ts";
import { FORECAST_FEATURE_NAMES, featuresForDay, originContext } from "./features.ts";
import { mlMode, parseMlMode } from "./flags.ts";
import { fitHoltWinters, forecastHoltWinters, holtWintersPredictor } from "./holt-winters.ts";
import { RidgeAccumulator, ridgePredict, solveLinear } from "./linear.ts";
import { f1, mae, precision, recall, smape } from "./metrics.ts";
import { weekdayMeanIncome, weekdayMedianPredictor } from "./predictors.ts";
import type { SpendPredictor, SpendPredictorInput } from "./types.ts";

const TODAY = "2026-10-02";

/** n consecutive days ending on TODAY, with spend from `fn(day index, weekday)`. */
function history(n: number, fn: (i: number, wd: number) => number): SpendPredictorInput {
  const days = Array.from({ length: n }, (_, i) => addDays(TODAY, -(n - 1 - i)));
  return {
    today: TODAY,
    horizon: 14,
    days,
    spend: days.map((d, i) => fn(i, weekdayOf(d))),
    income: days.map(() => 0),
    recurring: [],
  };
}

describe("solveLinear", () => {
  it("solves a small system", () => {
    expect(
      solveLinear(
        [
          [2, 1],
          [1, 3],
        ],
        [5, 10],
      )!.map((v) => Math.round(v * 1e9) / 1e9),
    ).toEqual([1, 3]);
  });
  it("returns null for a singular matrix", () => {
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });
});

describe("RidgeAccumulator", () => {
  it("recovers an exact linear relationship with almost no penalty", () => {
    const acc = new RidgeAccumulator(2);
    for (let i = 0; i < 20; i++) acc.add([i, (i * 7) % 5], 3 + 2 * i - ((i * 7) % 5));
    const m = acc.fit(1e-9)!;
    expect(m.intercept).toBeCloseTo(3, 4);
    expect(m.coef[0]).toBeCloseTo(2, 4);
    expect(m.coef[1]).toBeCloseTo(-1, 4);
    expect(acc.mse(m)).toBeLessThan(1e-8);
  });

  it("shrinks coefficients as the penalty grows, and never penalises the intercept", () => {
    const acc = new RidgeAccumulator(1);
    for (let i = 0; i < 20; i++) acc.add([i], 10 + i);
    const weak = acc.fit(0.001)!;
    const strong = acc.fit(1e6)!;
    expect(Math.abs(strong.coef[0]!)).toBeLessThan(Math.abs(weak.coef[0]!));
    expect(strong.intercept).toBeCloseTo(19.5, 1); // the mean of y
  });

  it("matches the error computed row by row, and merges like one big accumulator", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      x: [i % 7, (i * 3) % 11],
      y: (i % 5) + 1,
    }));
    const whole = new RidgeAccumulator(2);
    const a = new RidgeAccumulator(2);
    const b = new RidgeAccumulator(2);
    rows.forEach((r, i) => {
      whole.add(r.x, r.y);
      (i < 12 ? a : b).add(r.x, r.y);
    });
    a.merge(b);
    const m = whole.fit(1)!;
    const m2 = a.fit(1)!;
    expect(m2.intercept).toBeCloseTo(m.intercept, 9);
    const direct = rows.reduce((s, r) => s + (ridgePredict(m, r.x) - r.y) ** 2, 0) / rows.length;
    expect(whole.mse(m)).toBeCloseTo(direct, 9);
  });
});

describe("metrics", () => {
  it("computes errors", () => {
    expect(mae([1, 2, 3], [1, 4, 0])).toBeCloseTo(5 / 3);
    expect(smape([0, 10], [0, 10])).toBe(0);
    expect(smape([10], [0])).toBe(200);
  });
  it("computes precision, recall and F1", () => {
    const c = { tp: 6, fp: 2, fn: 4 };
    expect(precision(c)).toBeCloseTo(0.75);
    expect(recall(c)).toBeCloseTo(0.6);
    expect(f1(c)).toBeCloseTo((2 * 0.75 * 0.6) / 1.35);
  });
});

describe("flags", () => {
  it("falls back to the given default for a missing or unrecognised value", () => {
    expect(parseMlMode(undefined)).toBe("off");
    expect(parseMlMode("yes")).toBe("off");
    expect(parseMlMode("yes", "on")).toBe("on");
    expect(parseMlMode("off", "on")).toBe("off");
    expect(parseMlMode(" ON ")).toBe("on");
    expect(mlMode("forecast", { ML_FORECAST: "shadow" })).toBe("shadow");
    expect(mlMode("anomaly", { ML_FORECAST: "on" })).toBe("off");
    // the forecast and the categorizer are on unless switched off; the anomaly score is off
    expect(mlMode("forecast", {})).toBe("on");
    expect(mlMode("categorize", {})).toBe("on");
    expect(mlMode("anomaly", {})).toBe("off");
    expect(mlMode("forecast", { ML_FORECAST: "off" })).toBe("off");
    expect(mlMode("categorize", { ML_CATEGORIZE: "shadow" })).toBe("shadow");
  });
});

describe("features", () => {
  it("has one value per named feature, with a single weekday set", () => {
    const input = history(60, (_, wd) => (wd === 5 ? 400 : 100));
    const ctx = originContext(input);
    const x = featuresForDay(ctx, addDays(TODAY, 3));
    expect(x).toHaveLength(FORECAST_FEATURE_NAMES.length);
    expect(x.slice(0, 7).reduce((a, b) => a + b, 0)).toBe(1);
    expect(x.slice(0, 7)[weekdayOf(addDays(TODAY, 3))]).toBe(1);
  });

  it("scales levels by the person's own mean spend", () => {
    const small = originContext(history(60, () => 100));
    const big = originContext(history(60, () => 10_000));
    expect(small.trail7).toBeCloseTo(1);
    expect(big.trail7).toBeCloseTo(1);
    expect(big.scale).toBeCloseTo(100 * small.scale);
  });
});

describe("Holt-Winters", () => {
  const weekly = (_: number, wd: number) => (wd === 5 ? 500 : wd === 0 ? 50 : 150);

  it("declines with less than 28 days", () => {
    expect(holtWintersPredictor(history(20, weekly))).toBeNull();
  });

  it("learns a clean weekly pattern", () => {
    const input = history(84, weekly);
    const fit = fitHoltWinters(input.days, input.spend)!;
    const out = forecastHoltWinters(fit, TODAY, 14);
    out.forEach((v, i) => {
      const wd = weekdayOf(addDays(TODAY, i + 1));
      expect(Math.abs(v - weekly(0, wd))).toBeLessThan(15);
    });
  });

  it("never predicts below zero and reports an error size", () => {
    const p = holtWintersPredictor(history(60, (i) => (i % 9 === 0 ? 900 : 0)))!;
    expect(Math.min(...p.spend)).toBeGreaterThanOrEqual(0);
    expect(p.sigma).toBeGreaterThan(0);
    expect(p.method).toBe("holt_winters");
  });
});

describe("weekday-median predictor", () => {
  it("returns the median of each weekday", () => {
    const input = history(56, (_, wd) => (wd === 2 ? 300 : 100));
    const p = weekdayMedianPredictor(input)!;
    p.spend.forEach((v, i) => {
      expect(v).toBe(weekdayOf(addDays(TODAY, i + 1)) === 2 ? 300 : 100);
    });
  });
});

describe("ridge predictor", () => {
  it("declines without weights, and when the feature list does not match", () => {
    const input = history(60, () => 100);
    expect(ridgeSpendPredictor(null)(input)).toBeNull();
    const bad = {
      version: 1,
      featureNames: ["x"],
      intercept: 1,
      coef: [0],
      lambda: 1,
      trainedOn: "test",
    };
    expect(ridgeSpendPredictor(bad)(input)).toBeNull();
  });

  it("multiplies the prediction back by the person's own scale", () => {
    const weights = {
      version: 1,
      featureNames: FORECAST_FEATURE_NAMES,
      intercept: 1,
      coef: new Array<number>(FORECAST_FEATURE_NAMES.length).fill(0),
      lambda: 1,
      trainedOn: "test",
    };
    const p = ridgeSpendPredictor(weights)(history(60, () => 250))!;
    p.spend.forEach((v) => expect(v).toBeCloseTo(250));
  });

  it("adds one training row per future day", () => {
    const acc = new RidgeAccumulator(FORECAST_FEATURE_NAMES.length);
    const input = history(60, () => 100);
    expect(addForecastTrainingRows(acc, input, new Array<number>(14).fill(100))).toBe(14);
    expect(acc.n).toBe(14);
    expect(
      addForecastTrainingRows(
        acc,
        history(10, () => 1),
        [1, 2],
      ),
    ).toBe(0);
  });
});

describe("ensemble", () => {
  const weekly = (_: number, wd: number) => (wd === 5 ? 500 : 150);

  it("declines with less than 42 days", () => {
    expect(ensemblePredictor({ hw: holtWintersPredictor })(history(41, weekly))).toBeNull();
  });

  it("weights sum to one and the forecast stays between its members", () => {
    const p = ensemblePredictor({ hw: holtWintersPredictor })(history(84, weekly))!;
    expect(p.method).toBe("ensemble");
    expect(Object.values(p.weights!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    expect(p.sigma).toBeGreaterThanOrEqual(0);
    expect(p.spend).toHaveLength(14);
  });

  it("drops a member that disagrees wildly with the heuristic", () => {
    const wild: SpendPredictor = (i) => ({
      spend: new Array<number>(i.horizon).fill(1e6),
      method: "wild",
    });
    const p = ensemblePredictor({ wild, hw: holtWintersPredictor })(history(84, weekly))!;
    expect(p.weights).not.toHaveProperty("wild");
    expect(p.weights).toHaveProperty("hw");
    expect(Math.max(...p.spend)).toBeLessThan(1000);
  });

  it("declines when every model has been thrown out, and never blends the heuristic itself", () => {
    const wild: SpendPredictor = (i) => ({
      spend: new Array<number>(i.horizon).fill(1e6),
      method: "wild",
    });
    expect(ensemblePredictor({ wild })(history(84, weekly))).toBeNull();
    const p = ensemblePredictor({ hw: holtWintersPredictor })(history(84, weekly))!;
    expect(p.weights).not.toHaveProperty("weekday_median");
  });

  it("gives more weight to the member that was more accurate on this person", () => {
    const good: SpendPredictor = (i) => ({
      spend: Array.from({ length: i.horizon }, (_, k) =>
        weekly(0, weekdayOf(addDays(i.today, k + 1))),
      ),
      method: "good",
    });
    const poor: SpendPredictor = (i) => ({
      spend: new Array<number>(i.horizon).fill(400),
      method: "poor",
    });
    const p = ensemblePredictor({ good, poor })(history(84, weekly))!;
    expect(p.weights!.good!).toBeGreaterThan(p.weights!.poor!);
  });
});

describe("forecastCashflow with a spend predictor", () => {
  // 100 days: a salary on the 1st, rent on the 5th, a daily lunch and a bigger Friday meal.
  const txs: FlowTx[] = [];
  for (let i = 99; i >= 0; i--) {
    const day = addDays(TODAY, -i);
    const at = `${day}T08:00:00Z`;
    const dom = Number(day.slice(8));
    txs.push({
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: weekdayOf(day) === 5 ? 300 : 100,
      occurred_at: at,
      essential: true,
    });
    if (dom === 1)
      txs.push({
        direction: "in",
        channel: "add_money",
        counterparty: "Employer",
        amount: 30000,
        occurred_at: at,
      });
    if (dom === 5)
      txs.push({
        direction: "out",
        channel: "bill",
        counterparty: "Landlord",
        amount: 8000,
        occurred_at: at,
        essential: true,
      });
  }
  const base = { now: new Date(`${TODAY}T06:00:00Z`), balance: 12000, transactions: txs };

  it("with no predictor behaves as before and reports the heuristic", () => {
    const f = forecastCashflow(base);
    expect(f.method).toBe("heuristic");
    expect(f.spendPath).toHaveLength(30);
    expect(f.band).toBeNull();
  });

  it("uses a predictor's spend and builds a band that widens with time", () => {
    const flat: SpendPredictor = (i) => ({
      spend: new Array<number>(i.horizon).fill(10),
      method: "flat",
      sigma: 50,
    });
    const f = forecastCashflow({ ...base, spendPredictor: flat });
    expect(f.method).toBe("flat");
    expect(f.spendPath!.every((v) => v === 10)).toBe(true);
    const w = (i: number) => f.band!.upper[i]!.balance - f.band!.lower[i]!.balance;
    expect(w(0)).toBe(0);
    expect(w(30)).toBeGreaterThan(w(5));
  });

  it("falls back to the heuristic when the predictor declines, throws or returns bad numbers", () => {
    const reference = forecastCashflow(base);
    const bad: SpendPredictor[] = [
      () => null,
      () => {
        throw new Error("boom");
      },
      (i) => ({ spend: new Array<number>(i.horizon).fill(Number.NaN), method: "nan" }),
      (i) => ({ spend: new Array<number>(i.horizon).fill(-5), method: "neg" }),
      (i) => ({ spend: new Array<number>(i.horizon - 1).fill(5), method: "short" }),
    ];
    for (const spendPredictor of bad) {
      const f = forecastCashflow({ ...base, spendPredictor });
      expect(f.method).toBe("heuristic");
      expect(f.series).toEqual(reference.series);
    }
  });

  it("hands the predictor the history without recurring payments", () => {
    let seen: SpendPredictorInput | null = null;
    forecastCashflow({
      ...base,
      spendPredictor: (i) => {
        seen = i;
        return null;
      },
    });
    const input = seen as SpendPredictorInput | null;
    expect(input).not.toBeNull();
    expect(input!.days.at(-1)).toBe(TODAY);
    expect(input!.spend).toHaveLength(input!.days.length);
    // Rent (8000) and salary are recurring, so no day's everyday spending reaches them.
    expect(Math.max(...input!.spend)).toBeLessThanOrEqual(300);
    expect(input!.recurring.length).toBeGreaterThanOrEqual(2);
  });
});

describe("forecastForMode", () => {
  const txs: FlowTx[] = [];
  for (let i = 99; i >= 0; i--) {
    const day = addDays(TODAY, -i);
    const at = `${day}T08:00:00Z`;
    const dom = Number(day.slice(8));
    txs.push({
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: weekdayOf(day) === 5 ? 300 : 100 + (i % 4) * 20,
      occurred_at: at,
      essential: true,
    });
    if (dom === 1)
      txs.push({
        direction: "in",
        channel: "add_money",
        counterparty: "Employer",
        amount: 30000,
        occurred_at: at,
      });
    if (dom === 5)
      txs.push({
        direction: "out",
        channel: "bill",
        counterparty: "Landlord",
        amount: 8000,
        occurred_at: at,
        essential: true,
      });
  }
  const input = { now: new Date(`${TODAY}T06:00:00Z`), balance: 12000, transactions: txs };

  it("off returns exactly the plain forecast and no shadow", () => {
    const r = forecastForMode(input, "off");
    expect(r.shadow).toBeNull();
    expect(r.forecast).toEqual(forecastCashflow(input));
    expect(r.forecast.method).toBe("heuristic");
  });

  it("shadow returns the plain forecast and describes the model's version beside it", () => {
    const r = forecastForMode(input, "shadow");
    expect(r.forecast).toEqual(forecastCashflow(input));
    expect(r.shadow).not.toBeNull();
    expect(r.shadow!.method).toBe("ensemble");
    expect(r.shadow!.spendTotal).toBeGreaterThan(0);
  });

  it("on returns the model's forecast, with a band", () => {
    const r = forecastForMode(input, "on");
    expect(r.shadow).toBeNull();
    expect(r.forecast.method).toBe("ensemble");
    expect(r.forecast.band).not.toBeNull();
    expect(r.forecast.series).toHaveLength(31);
  });

  it("on falls back to the plain forecast with too little history for the model", () => {
    const short = txs.filter((t) => t.occurred_at >= `${addDays(TODAY, -34)}T00:00:00Z`);
    const r = forecastForMode({ ...input, transactions: short }, "on");
    if (!r.forecast.insufficient) expect(r.forecast.method).toBe("heuristic");
  });

  it.each(["on", "shadow"] as const)(
    "%s: if the model throws, declines or returns bad numbers, the result is exactly the plain forecast",
    (mode) => {
      const failing: SpendPredictor[] = [
        () => {
          throw new Error("model crashed");
        },
        () => null,
        (i) => ({ spend: new Array<number>(i.horizon).fill(Number.NaN), method: "bad" }),
        (i) => ({ spend: new Array<number>(i.horizon).fill(-1), method: "bad" }),
      ];
      for (const predictor of failing) {
        const r = forecastForMode(input, mode, predictor);
        expect(r.forecast).toEqual(forecastCashflow(input));
        expect(r.forecast.method).toBe("heuristic");
        expect(r.shadow === null || r.shadow.method === "heuristic").toBe(true);
      }
    },
  );

  it("gives no model forecast when there is not enough history at all", () => {
    const r = forecastForMode({ ...input, transactions: txs.slice(0, 5) }, "on");
    expect(r.forecast.insufficient).toBe(true);
    expect(r.shadow).toBeNull();
  });
});

describe("centred forecast with a predictor", () => {
  // A salary, rent that varies from month to month (so the cautious amount is above the typical one)
  // and a steady daily lunch.
  const txs: FlowTx[] = [];
  const rent = [9000, 11000, 9500, 12000, 9000];
  for (let i = 119; i >= 0; i--) {
    const day = addDays(TODAY, -i);
    const at = `${day}T08:00:00Z`;
    const dom = Number(day.slice(8));
    txs.push({
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: 100,
      occurred_at: at,
      essential: true,
    });
    if (dom === 1)
      txs.push({
        direction: "in",
        channel: "add_money",
        counterparty: "Employer",
        amount: 30000,
        occurred_at: at,
      });
    if (dom === 5)
      txs.push({
        direction: "out",
        channel: "bill",
        counterparty: "Landlord",
        amount: rent[Number(day.slice(5, 7)) % 5]!,
        occurred_at: at,
        essential: true,
      });
  }
  const base = { now: new Date(`${TODAY}T06:00:00Z`), balance: 6000, transactions: txs };
  const plain = forecastCashflow(base);
  const same: SpendPredictor = (i) => ({
    spend: plain.spendPath!.slice(0, i.horizon),
    method: "same",
  });

  it("plans around the typical bill, not the cautious one", () => {
    const rentItem = plain.recurring.find((r) => r.counterparty === "Landlord")!;
    expect(rentItem.amountStable).toBe(false);
    expect(rentItem.expectedAmount).toBeGreaterThan(rentItem.typicalAmount);
    const centred = forecastCashflow({ ...base, spendPredictor: same });
    expect(centred.expectedBills).toBeLessThan(plain.expectedBills);
    expect(centred.series.at(-1)!.balance).toBeGreaterThan(plain.series.at(-1)!.balance);
  });

  it("keeps the shortfall warning on the cautious path, so it matches the plain forecast", () => {
    const centred = forecastCashflow({ ...base, spendPredictor: same });
    expect(plain.risks.length).toBeGreaterThan(0);
    expect(centred.risks).toEqual(plain.risks);
    expect(centred.firstRiskDay).toBe(plain.firstRiskDay);
  });

  it("uses the predictor's income in place of the weekday medians", () => {
    const rich: SpendPredictor = (i) => ({
      spend: new Array<number>(i.horizon).fill(0),
      income: new Array<number>(i.horizon).fill(1000),
      method: "rich",
    });
    const f = forecastCashflow({ ...base, spendPredictor: rich });
    const lastNet = f.series.at(-1)!.balance - f.series[0]!.balance;
    expect(lastNet).toBeGreaterThan(30 * 1000 - 1);
  });
});

describe("weekdayMeanIncome", () => {
  it("averages each weekday's income over the history", () => {
    const input = history(56, () => 0);
    input.income = input.days.map((d) => (weekdayOf(d) === 4 ? 700 : 0));
    const out = weekdayMeanIncome(input);
    out.forEach((v, i) => expect(v).toBe(weekdayOf(addDays(TODAY, i + 1)) === 4 ? 700 : 0));
  });
});

describe("detectRecurring allowing a missed occurrence", () => {
  const at = (day: string): string => `${day}T08:00:00Z`;
  const pay = (days: string[]): FlowTx[] =>
    days.map((d) => ({
      direction: "in" as const,
      channel: "add_money" as const,
      counterparty: "Employer",
      amount: 20000,
      occurred_at: at(d),
    }));
  const now = new Date(`${TODAY}T06:00:00Z`);

  // Paid on the 1st of each month, but August's payment is missing from the data.
  const skipped = pay(["2026-06-01", "2026-07-01", "2026-09-01", "2026-10-01"]);

  it("misses the item the strict way, finds it when allowed, and says how reliable it is", () => {
    expect(detectRecurring(skipped, now)).toHaveLength(0);
    const found = detectRecurring(skipped, now, { allowMissed: true });
    expect(found).toHaveLength(1);
    expect(found[0]!.cadence).toBe("monthly");
    expect(found[0]!.reliability).toBeCloseTo(4 / 5);
  });

  it("gives the same result as before when nothing is missing, and no reliability without the option", () => {
    const clean = pay(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    const strict = detectRecurring(clean, now);
    expect(strict).toHaveLength(1);
    expect(strict[0]!.reliability).toBeUndefined();
    const lenient = detectRecurring(clean, now, { allowMissed: true });
    expect(lenient).toHaveLength(1);
    expect(lenient[0]!.reliability).toBe(1);
    expect(lenient[0]!.nextDay).toBe(strict[0]!.nextDay);
  });

  it("does not read a fortnightly payment as a weekly one with every other payment missing", () => {
    const fortnightly = pay(["2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"]);
    const found = detectRecurring(fortnightly, now, { allowMissed: true });
    expect(found).toHaveLength(1);
    expect(found[0]!.cadence).toBe("biweekly");
  });

  it("leaves irregular payments alone", () => {
    const irregular = pay(["2026-07-03", "2026-07-29", "2026-09-12", "2026-10-01"]);
    expect(detectRecurring(irregular, now, { allowMissed: true })).toHaveLength(0);
  });
});

describe("a model forecast that declines is the plain forecast exactly", () => {
  it("even though the model path detects recurring payments more loosely", () => {
    const txs: FlowTx[] = [];
    for (let i = 99; i >= 0; i--) {
      const day = addDays(TODAY, -i);
      txs.push({
        direction: "out",
        channel: "merchant",
        counterparty: "Canteen",
        amount: 100,
        occurred_at: `${day}T08:00:00Z`,
        essential: true,
      });
    }
    const input = { now: new Date(`${TODAY}T06:00:00Z`), balance: 5000, transactions: txs };
    const declining: SpendPredictor = () => null;
    expect(forecastCashflow({ ...input, spendPredictor: declining })).toEqual(
      forecastCashflow(input),
    );
  });
});
