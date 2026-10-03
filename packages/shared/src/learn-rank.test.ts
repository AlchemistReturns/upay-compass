import { describe, expect, it } from "vitest";
import { LEARN_SLUGS } from "./learn";
import { rankModules, type RankInputs } from "./learn-rank";

type Scores = Partial<Record<"savings" | "budget" | "buffer" | "stability", number | "n/a">>;

/** A health breakdown with the given component scores (100 unless stated; "n/a" = not measurable). */
const health = (s: Scores = {}): RankInputs["health"] => {
  const comp = (v: number | "n/a" | undefined) => ({
    score: v === "n/a" ? 50 : (v ?? 100),
    weight: 0.25,
    available: v !== "n/a",
    raw: null,
  });
  return {
    components: {
      savings: comp(s.savings),
      budget: comp(s.budget),
      buffer: comp(s.buffer),
      stability: comp(s.stability),
    },
  };
};

const rank = (over: Partial<RankInputs> = {}) =>
  rankModules({ health: health(), activeNudges: [], completed: new Set(), ...over });

describe("rankModules", () => {
  it("with nothing to go on, lists every module in course order as 'next up'", () => {
    const r = rank({ health: null });
    expect(r.map((m) => m.slug)).toEqual([...LEARN_SLUGS]);
    expect(r.every((m) => m.reason === "next_up")).toBe(true);
  });

  it("a low savings rate puts the saving module first, the rest in course order", () => {
    const r = rank({ health: health({ savings: 10 }) });
    expect(r[0]).toEqual({ slug: "save-small", reason: "weak_savings" });
    expect(r.slice(1).map((m) => m.slug)).toEqual([
      "budget-basics",
      "needs-vs-wants",
      "emergency-fund",
      "mobile-money-safety",
      "irregular-income",
      "goals-that-stick",
      "borrowing-basics",
    ]);
    expect(r.slice(1).every((m) => m.reason === "next_up")).toBe(true);
  });

  it("each weak component maps to its module, the lowest score first", () => {
    const r = rank({ health: health({ savings: 40, buffer: 20, stability: 60, budget: 69 }) });
    expect(r.slice(0, 4)).toEqual([
      { slug: "emergency-fund", reason: "weak_buffer" }, // 20
      { slug: "save-small", reason: "weak_savings" }, // 40
      { slug: "irregular-income", reason: "weak_stability" }, // 60
      { slug: "budget-basics", reason: "weak_budget" }, // 69
    ]);
  });

  it("70 and above is not weak, and a component without enough data is never weak", () => {
    const r = rank({ health: health({ savings: 70, buffer: "n/a", stability: "n/a" }) });
    expect(r.every((m) => m.reason === "next_up")).toBe(true);
  });

  it("unread alerts come before score-driven picks, in the order of the alerts", () => {
    const r = rank({
      health: health({ savings: 10 }),
      activeNudges: ["budget_exceeded", "forecast_risk"],
    });
    expect(r.slice(0, 3)).toEqual([
      { slug: "budget-basics", reason: "nudge_budget" },
      { slug: "emergency-fund", reason: "nudge_forecast" },
      { slug: "save-small", reason: "weak_savings" },
    ]);
  });

  it("maps each alert type to its module, and ignores alerts with no module", () => {
    const types = {
      budget_threshold: "budget-basics",
      overspend: "needs-vs-wants",
      goal_behind: "goals-that-stick",
      unusual_transaction: "mobile-money-safety",
      forecast_risk: "emergency-fund",
    } as const;
    for (const [type, slug] of Object.entries(types)) {
      expect(rank({ activeNudges: [type] })[0]!.slug).toBe(slug);
    }
    expect(rank({ activeNudges: ["bill_due"] }).every((m) => m.reason === "next_up")).toBe(true);
  });

  it("when an alert and a weak component point at the same module, the alert's reason wins", () => {
    const r = rank({ health: health({ buffer: 5 }), activeNudges: ["forecast_risk"] });
    expect(r[0]).toEqual({ slug: "emergency-fund", reason: "nudge_forecast" });
    expect(r.filter((m) => m.slug === "emergency-fund")).toHaveLength(1);
  });

  it("finished modules always rank below unfinished ones, even when recommended", () => {
    const r = rank({ health: health({ savings: 10 }), completed: new Set(["save-small"]) });
    expect(r.at(-1)).toEqual({ slug: "save-small", reason: "done" });
    expect(r[0]).toEqual({ slug: "budget-basics", reason: "next_up" });
  });

  it("with everything finished, all are 'done' in course order", () => {
    const r = rank({ completed: new Set(LEARN_SLUGS) });
    expect(r.map((m) => m.slug)).toEqual([...LEARN_SLUGS]);
    expect(r.every((m) => m.reason === "done")).toBe(true);
  });

  it("always returns every module exactly once", () => {
    const r = rank({
      health: health({ savings: 5, buffer: 5, stability: 5, budget: 5 }),
      activeNudges: ["overspend", "goal_behind", "budget_exceeded"],
      completed: new Set(["borrowing-basics"]),
    });
    expect([...r.map((m) => m.slug)].sort()).toEqual([...LEARN_SLUGS].sort());
  });
});
