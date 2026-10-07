import { describe, expect, it } from "vitest";
import type { AnomalyTx } from "../anomaly.ts";
import { addDays } from "../dates.ts";
import {
  ANOMALY_FEATURE_NAMES,
  anomalyFeatures,
  detectAnomaliesCombined,
  scoreAnomalies,
} from "./anomaly-ml.ts";
import { fitIsolationForest, isolationScore } from "./isolation-forest.ts";

describe("isolation forest", () => {
  // A tight cluster of points, and one far away.
  const cluster = Array.from({ length: 80 }, (_, i) => [
    10 + ((i * 7) % 10) / 10,
    20 + ((i * 3) % 10) / 10,
  ]);

  it("declines with too few rows", () => {
    expect(fitIsolationForest(cluster.slice(0, 5))).toBeNull();
  });

  it("scores a far-away point as more unusual than the cluster", () => {
    const forest = fitIsolationForest(cluster, { seed: 4 })!;
    const inside = isolationScore(forest, [10.5, 20.5]);
    const outside = isolationScore(forest, [40, -10]);
    expect(outside).toBeGreaterThan(inside);
    expect(outside).toBeGreaterThan(inside + 0.05);
    expect(inside).toBeLessThan(0.55);
    expect(outside).toBeLessThan(1);
    expect(inside).toBeGreaterThan(0);
  });

  it("is reproducible with the same seed", () => {
    const a = fitIsolationForest(cluster, { seed: 9, trees: 20 })!;
    const b = fitIsolationForest(cluster, { seed: 9, trees: 20 })!;
    expect(isolationScore(a, [11, 21])).toBe(isolationScore(b, [11, 21]));
  });
});

const END = "2026-10-02";
const NOW = new Date(`${END}T08:00:00Z`);

/** Ninety days of everyday payments: a canteen lunch and a weekly shop, always at similar amounts. */
function habits(): AnomalyTx[] {
  const out: AnomalyTx[] = [];
  for (let i = 100; i >= 1; i--) {
    const day = addDays(END, -i);
    out.push({
      id: `lunch-${i}`,
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: 100 + (i % 5) * 10,
      occurred_at: `${day}T07:00:00Z`,
      category: "food",
    });
    if (i % 7 === 0) {
      out.push({
        id: `shop-${i}`,
        direction: "out",
        channel: "merchant",
        counterparty: "Shwapno",
        amount: 900 + (i % 3) * 50,
        occurred_at: `${day}T10:00:00Z`,
        category: "food",
      });
    }
  }
  return out;
}

describe("anomaly features and scores", () => {
  it("has one named feature per value", () => {
    const txs = habits();
    const p = {
      sorted: txs,
      days: txs.map((t) => t.occurred_at.slice(0, 10)),
      hours: txs.map(() => 13),
    };
    expect(anomalyFeatures(p, 40)).toHaveLength(ANOMALY_FEATURE_NAMES.length);
  });

  it("declines with too little history", () => {
    expect(scoreAnomalies(habits().slice(0, 15), { candidateFrom: addDays(END, -3) }, NOW)).toEqual(
      [],
    );
  });

  it("scores a payment ten times the usual far above ordinary ones, and says why", () => {
    const big: AnomalyTx = {
      id: "big",
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: 1300,
      occurred_at: `${END}T07:00:00Z`,
      category: "food",
    };
    const normal: AnomalyTx = {
      ...big,
      id: "normal",
      amount: 120,
      occurred_at: `${addDays(END, -0)}T07:30:00Z`,
    };
    const scores = scoreAnomalies([...habits(), big, normal], { candidateFrom: END }, NOW);
    const bigScore = scores.find((s) => s.txId === "big")!;
    const normalScore = scores.find((s) => s.txId === "normal")!;
    expect(bigScore.score).toBeGreaterThan(normalScore.score);
    expect(bigScore.score).toBeGreaterThan(0.6);
    expect(bigScore.excess).toBeGreaterThan(normalScore.excess);
    expect(bigScore.reasons.length).toBeGreaterThan(0);
  });

  it("never scores money in, savings or recurring payments", () => {
    const txs: AnomalyTx[] = [
      ...habits(),
      {
        id: "in",
        direction: "in",
        channel: "add_money",
        counterparty: "Employer",
        amount: 50000,
        occurred_at: `${END}T07:00:00Z`,
        category: "income",
      },
      {
        id: "save",
        direction: "out",
        channel: "merchant",
        counterparty: "DPS",
        amount: 9000,
        occurred_at: `${END}T07:00:00Z`,
        category: "savings",
      },
    ];
    const ids = scoreAnomalies(txs, { candidateFrom: END }, NOW).map((s) => s.txId);
    expect(ids).not.toContain("in");
    expect(ids).not.toContain("save");
  });
});

describe("combined detection", () => {
  it("keeps what the rule flags and adds payments only the model scores very high", () => {
    const big: AnomalyTx = {
      id: "big",
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: 1400,
      occurred_at: `${END}T07:00:00Z`,
      category: "food",
    };
    const out = detectAnomaliesCombined([...habits(), big], { candidateFrom: END }, NOW);
    const hit = out.find((c) => c.txId === "big");
    expect(hit).toBeDefined();
    expect(hit!.rule).not.toBeNull();
    expect(hit!.model).not.toBeNull();
  });

  it("flags nothing on ordinary payments", () => {
    const ok: AnomalyTx = {
      id: "ok",
      direction: "out",
      channel: "merchant",
      counterparty: "Canteen",
      amount: 120,
      occurred_at: `${END}T07:00:00Z`,
      category: "food",
    };
    expect(detectAnomaliesCombined([...habits(), ok], { candidateFrom: END }, NOW)).toEqual([]);
  });
});
