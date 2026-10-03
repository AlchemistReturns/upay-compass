import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HealthResult } from "./health";
import { LEARN_FACT_SHEET } from "./learn-facts";
import {
  LEARN_ROUTES,
  LEARN_TOPICS,
  LEARN_TOPIC_IDS,
  LEARN_TOPIC_REASONS,
  MIN_TOPIC_SCORE,
  buildLearnSignals,
  buildModuleFacts,
  factsChangedMaterially,
  pickPersonalizedTopics,
  topicById,
  type LearnSignalInput,
  type LearnSignals,
} from "./learn-topics";

const NOW = new Date("2026-10-03T06:00:00Z");

type Scores = Partial<Record<"savings" | "budget" | "buffer" | "stability", number | "n/a">>;
const RAW = { savings: 0.2, budget: 0, buffer: 3, stability: 0 };

/** A health breakdown with the given component scores (100 unless stated; "n/a" = unmeasured). */
function health(s: Scores = {}, extra: Partial<HealthResult> = {}): LearnSignalInput["health"] {
  const comp = (k: keyof typeof RAW) => {
    const v = s[k];
    if (v === "n/a") return { score: 50, weight: 0.25, available: false, raw: null };
    const score = v ?? 100;
    // raw follows the score the way the health formula does
    const raw =
      k === "savings"
        ? (score / 100) * 0.2
        : k === "buffer"
          ? (score / 100) * 3
          : k === "stability"
            ? (1 - score / 100) * 0.5
            : 0;
    return { score, weight: 0.25, available: true, raw };
  };
  return {
    score: 80,
    confidence: "ok",
    components: {
      savings: comp("savings"),
      budget: comp("budget"),
      buffer: comp("buffer"),
      stability: comp("stability"),
    },
    ...extra,
  };
}

const input = (over: Partial<LearnSignalInput> = {}): LearnSignalInput => ({
  incomeType: "salaried",
  health: health(),
  readiness: null,
  budgets: [{ limit: 1000, spent: 100, threshold: 0.8 }],
  goalStatuses: ["on_track"],
  unreadNudges: [],
  forecast: { insufficient: false, today: "2026-10-03", risks: [] },
  ...over,
});
const signals = (over: Partial<LearnSignalInput> = {}) => buildLearnSignals(input(over));
const pick = (s: LearnSignals, recent: { topicId: string; at: string }[] = []) =>
  pickPersonalizedTopics(s, recent, NOW).map((p) => p.topic.id);
const signalOf = (id: string, s: LearnSignals) => topicById(id)!.signal(s);

describe("buildLearnSignals", () => {
  it("counts budgets near and over the limit, goals behind or without savings, and forecast risks", () => {
    const s = signals({
      budgets: [
        { limit: 1000, spent: 1200, threshold: 0.8 },
        { limit: 1000, spent: 850, threshold: 0.8 },
        { limit: 1000, spent: 100, threshold: 0.8 },
      ],
      goalStatuses: ["behind", "no_contributions", "on_track", "completed"],
      forecast: {
        insufficient: false,
        today: "2026-10-03",
        risks: [
          { day: "2026-10-10", balance: 300, level: "low" },
          { day: "2026-10-11", balance: -50, level: "negative" },
        ],
      },
    });
    expect(s.budgets).toEqual({ total: 3, near: 1, over: 1 });
    expect(s.goals).toEqual({ active: 3, behind: 1, noSavings: 1 });
    expect(s.forecast).toEqual({
      insufficient: false,
      lowDays: 2,
      negativeDays: 1,
      daysToFirstLow: 7,
    });
  });

  it("ignores risks from a forecast without enough history, and an unknown income type", () => {
    const s = signals({
      incomeType: "pirate",
      forecast: {
        insufficient: true,
        today: "2026-10-03",
        risks: [{ day: "2026-10-04", balance: 0, level: "low" }],
      },
    });
    expect(s.incomeType).toBeNull();
    expect(s.forecast).toMatchObject({ lowDays: 0, daysToFirstLow: null });
  });

  it("passes the optional summaries through when another part of the app supplies them", () => {
    const s = signals({ extras: { cashOut: { count30: 4, total30: 6200 } } });
    expect(s.cashOut).toEqual({ count30: 4, total30: 6200 });
    expect(signals().cashOut).toBeUndefined();
  });
});

describe("topic signal rules", () => {
  it("every topic has a valid category, route and fact keys, and unique ids", () => {
    expect(new Set(LEARN_TOPIC_IDS).size).toBe(LEARN_TOPICS.length);
    expect(LEARN_TOPICS.length).toBeGreaterThanOrEqual(12);
    for (const t of LEARN_TOPICS) {
      expect(Object.keys(LEARN_ROUTES)).toContain(t.route);
      expect(t.goal.length).toBeGreaterThan(20);
      expect(t.outline.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("a healthy, quiet profile triggers nothing except possibly the concept-level growth topic", () => {
    const s = signals();
    const fired = LEARN_TOPICS.filter((t) => (t.signal(s)?.score ?? 0) >= MIN_TOPIC_SCORE);
    expect(fired.map((t) => t.id)).toEqual(["beyond_basics"]);
  });

  it("cash_out_cost needs the optional cash-out summary, and two cash-outs or more", () => {
    expect(signalOf("cash_out_cost", signals())).toBeNull();
    expect(
      signalOf("cash_out_cost", signals({ extras: { cashOut: { count30: 1, total30: 500 } } })),
    ).toBeNull();
    expect(
      signalOf("cash_out_cost", signals({ extras: { cashOut: { count30: 4, total30: 6000 } } })),
    ).toEqual({ score: 0.8, reason: "cash_out_frequent" });
  });

  it("lean_weeks fires on unsteady income or on gig work", () => {
    expect(signalOf("lean_weeks", signals())!.score).toBeLessThan(MIN_TOPIC_SCORE);
    expect(signalOf("lean_weeks", signals({ health: health({ stability: 0 }) }))).toEqual({
      score: 1,
      reason: "income_varies",
    });
    expect(signalOf("lean_weeks", signals({ incomeType: "gig" }))).toEqual({
      score: 0.5,
      reason: "income_gig",
    });
  });

  it("goals_that_last: an unread goal alert beats a goal behind, which beats one with no savings", () => {
    expect(signalOf("goals_that_last", signals())).toBeNull();
    expect(signalOf("goals_that_last", signals({ goalStatuses: ["no_contributions"] }))).toEqual({
      score: 0.6,
      reason: "goal_no_savings",
    });
    expect(signalOf("goals_that_last", signals({ goalStatuses: ["behind"] }))!.score).toBe(0.8);
    expect(signalOf("goals_that_last", signals({ unreadNudges: ["goal_behind"] }))!.score).toBe(
      0.85,
    );
    expect(signalOf("goals_that_last", signals({ goalStatuses: [] }))).toEqual({
      score: 0.45,
      reason: "no_goal",
    });
  });

  it("buffer_in_days fires on a thin buffer or a low-balance forecast", () => {
    expect(signalOf("buffer_in_days", signals())!.score).toBeLessThan(MIN_TOPIC_SCORE);
    expect(signalOf("buffer_in_days", signals({ health: health({ buffer: 0 }) }))).toEqual({
      score: 1,
      reason: "buffer_thin",
    });
    expect(
      signalOf(
        "buffer_in_days",
        signals({
          forecast: {
            insufficient: false,
            today: "2026-10-03",
            risks: [{ day: "2026-10-20", balance: 100, level: "low" }],
          },
        }),
      ),
    ).toEqual({ score: 0.7, reason: "forecast_low" });
  });

  it("month_end_bills fires on late bills, a dip within two weeks, or bills bunched at month end", () => {
    const readiness = (punctuality: number) => ({
      score: 60,
      components: {
        income: { score: 80, weight: 0.3, available: true, raw: null, detail: {} },
        punctuality: { score: punctuality, weight: 0.3, available: true, raw: null, detail: {} },
        savings: { score: 80, weight: 0.25, available: true, raw: null, detail: {} },
        budget: { score: 80, weight: 0.15, available: true, raw: null, detail: {} },
      },
    });
    expect(signalOf("month_end_bills", signals({ readiness: readiness(90) }))!.score).toBeLessThan(
      MIN_TOPIC_SCORE,
    );
    expect(signalOf("month_end_bills", signals({ readiness: readiness(0) }))).toEqual({
      score: 1,
      reason: "bills_late",
    });
    const soon = signals({
      forecast: {
        insufficient: false,
        today: "2026-10-03",
        risks: [{ day: "2026-10-12", balance: 10, level: "low" }],
      },
    });
    expect(signalOf("month_end_bills", soon)).toEqual({ score: 0.65, reason: "bills_squeeze" });
    expect(
      signalOf("month_end_bills", signals({ extras: { monthEnd: { billsShareLastWeek: 0.75 } } })),
    ).toEqual({ score: 0.7, reason: "bills_month_end" });
  });

  it("small_repeats fires on a low savings rate, or many small spends when that summary exists", () => {
    expect(signalOf("small_repeats", signals())!.score).toBeLessThan(MIN_TOPIC_SCORE);
    expect(signalOf("small_repeats", signals({ health: health({ savings: 0 }) }))).toEqual({
      score: 0.85,
      reason: "savings_low",
    });
    expect(
      signalOf(
        "small_repeats",
        signals({ extras: { smallSpends: { count30: 40, total30: 3000 } } }),
      ),
    ).toEqual({ score: 0.85, reason: "small_spends_many" });
  });

  it("festival_planning needs a festival in the next 60 days, and grows as it nears", () => {
    expect(signalOf("festival_planning", signals())).toBeNull();
    const far = signalOf(
      "festival_planning",
      signals({ extras: { festival: { id: "eid", daysAway: 61 } } }),
    );
    expect(far).toBeNull();
    const near = signalOf(
      "festival_planning",
      signals({ extras: { festival: { id: "eid", daysAway: 15 } } }),
    );
    expect(near).toEqual({ score: 0.8, reason: "festival_soon" });
  });

  it("scam_safety fires only on an unread unusual-payment alert", () => {
    expect(signalOf("scam_safety", signals())).toBeNull();
    expect(signalOf("scam_safety", signals({ unreadNudges: ["unusual_transaction"] }))).toEqual({
      score: 0.75,
      reason: "unusual_payment",
    });
  });

  it("beyond_basics needs a solid score, buffer and savings, no budget over, no negative forecast", () => {
    expect(signalOf("beyond_basics", signals())).toEqual({ score: 0.6, reason: "basics_covered" });
    expect(signalOf("beyond_basics", signals({ health: health({}, { score: 74 }) }))).toBeNull();
    expect(
      signalOf("beyond_basics", signals({ health: health({}, { confidence: "low" }) })),
    ).toBeNull();
    expect(signalOf("beyond_basics", signals({ health: health({ buffer: 79 }) }))).toBeNull();
    expect(
      signalOf("beyond_basics", signals({ budgets: [{ limit: 10, spent: 20, threshold: 0.8 }] })),
    ).toBeNull();
    expect(
      signalOf(
        "beyond_basics",
        signals({
          forecast: {
            insufficient: false,
            today: "2026-10-03",
            risks: [{ day: "2026-10-09", balance: -1, level: "negative" }],
          },
        }),
      ),
    ).toBeNull();
  });

  it("reading_your_score fires for a new score or a weak part in a low score", () => {
    expect(signalOf("reading_your_score", signals({ health: null }))).toBeNull();
    expect(
      signalOf("reading_your_score", signals({ health: health({}, { confidence: "low" }) })),
    ).toEqual({ score: 0.42, reason: "score_new" });
    expect(
      signalOf("reading_your_score", signals({ health: health({ buffer: 0 }, { score: 60 }) })),
    ).toEqual({ score: 0.62, reason: "score_weak_part" });
  });

  it("budgets_that_fit: over the limit beats near it, which beats having none", () => {
    expect(
      signalOf(
        "budgets_that_fit",
        signals({ budgets: [{ limit: 10, spent: 20, threshold: 0.8 }] }),
      ),
    ).toEqual({ score: 0.8, reason: "budget_over" });
    expect(
      signalOf("budgets_that_fit", signals({ budgets: [{ limit: 10, spent: 9, threshold: 0.8 }] })),
    ).toEqual({ score: 0.6, reason: "budget_near" });
    expect(
      signalOf("budgets_that_fit", signals({ unreadNudges: ["budget_exceeded"] }))!.score,
    ).toBe(0.75);
    expect(signalOf("budgets_that_fit", signals())).toBeNull();
    expect(signalOf("budgets_that_fit", signals({ budgets: [] }))).toEqual({
      score: 0.42,
      reason: "no_budgets",
    });
  });

  it("borrowing_pressure fires on a forecast below zero, or low days with a thin buffer", () => {
    const risky = (level: "low" | "negative", buffer = 100) =>
      signals({
        health: health({ buffer }),
        forecast: {
          insufficient: false,
          today: "2026-10-03",
          risks: [{ day: "2026-10-15", balance: level === "low" ? 50 : -50, level }],
        },
      });
    expect(signalOf("borrowing_pressure", risky("low"))).toBeNull();
    expect(signalOf("borrowing_pressure", risky("low", 10))).toEqual({
      score: 0.5,
      reason: "money_pressure",
    });
    expect(signalOf("borrowing_pressure", risky("negative"))).toEqual({
      score: 0.75,
      reason: "forecast_negative",
    });
  });

  it("every reason a rule can return is a known reason id", () => {
    const known = new Set<string>(LEARN_TOPIC_REASONS);
    const variants: LearnSignals[] = [
      signals(),
      signals({
        health: health({ savings: 0, budget: 0, buffer: 0, stability: 0 }, { score: 10 }),
      }),
      signals({ health: health({}, { confidence: "low" }), goalStatuses: [] }),
      signals({
        unreadNudges: ["goal_behind", "unusual_transaction", "budget_threshold", "forecast_risk"],
      }),
      signals({
        incomeType: "gig",
        extras: {
          cashOut: { count30: 9, total30: 1 },
          monthEnd: { billsShareLastWeek: 1 },
          smallSpends: { count30: 50, total30: 1 },
          festival: { id: "eid", daysAway: 1 },
        },
      }),
    ];
    for (const s of variants) {
      for (const t of LEARN_TOPICS) {
        const r = t.signal(s);
        if (r) expect(known.has(r.reason), `${t.id}: ${r.reason}`).toBe(true);
      }
    }
  });
});

describe("pickPersonalizedTopics", () => {
  const struggling = () =>
    signals({
      incomeType: "gig",
      health: health({ savings: 10, buffer: 5, stability: 20 }, { score: 30 }),
      budgets: [{ limit: 1000, spent: 1500, threshold: 0.8 }],
      goalStatuses: ["behind"],
      unreadNudges: ["unusual_transaction"],
      forecast: {
        insufficient: false,
        today: "2026-10-03",
        risks: [{ day: "2026-10-08", balance: -200, level: "negative" }],
      },
    });

  it("returns at most three, best first, all above the threshold", () => {
    const picked = pickPersonalizedTopics(struggling(), [], NOW);
    expect(picked).toHaveLength(3);
    expect(picked.every((p) => p.score >= MIN_TOPIC_SCORE)).toBe(true);
    expect([...picked].sort((a, b) => b.score - a.score)).toEqual(picked);
  });

  it("is deterministic: the same input gives the same answer, whatever the history order", () => {
    const recent = [
      { topicId: "lean_weeks", at: "2026-10-01T00:00:00Z" },
      { topicId: "scam_safety", at: "2026-09-30T00:00:00Z" },
    ];
    const a = pick(struggling(), recent);
    const b = pick(struggling(), [...recent].reverse());
    expect(a).toEqual(b);
    expect(pick(struggling(), recent)).toEqual(a);
  });

  it("prefers different categories: two topics from the same group only when nothing else qualifies", () => {
    const picked = pickPersonalizedTopics(struggling(), [], NOW);
    expect(new Set(picked.map((p) => p.topic.category)).size).toBe(3);

    // only "saving" topics qualify: the set may then repeat a category
    const savingOnly = signals({
      health: health({ buffer: 0 }, { score: 70 }),
      goalStatuses: ["behind"],
      budgets: [{ limit: 10, spent: 1, threshold: 0.8 }],
    });
    const ids = pick(savingOnly);
    expect(ids).toEqual(["buffer_in_days", "goals_that_last"]);
  });

  it("drops topics under the threshold, and returns nothing when nothing qualifies", () => {
    expect(pick(signals({ health: health({}, { score: 70 }) }))).toEqual([]);
  });

  it("does not repeat a topic finished or dismissed within 14 days, but may after", () => {
    const s = struggling();
    const first = pick(s);
    const top = first[0]!;
    const within = pick(s, [{ topicId: top, at: "2026-09-20T07:00:00Z" }]); // 13.96 days ago
    expect(within).not.toContain(top);
    const after = pick(s, [{ topicId: top, at: "2026-09-19T05:00:00Z" }]); // 14.04 days ago
    expect(after).toContain(top);
  });
});

describe("buildModuleFacts", () => {
  it("carries only the topic's keys, numbers and ids, never undefined or free text", () => {
    const s = signals({ health: health({ buffer: 20 }, { score: 55 }) });
    for (const t of LEARN_TOPICS) {
      const facts = buildModuleFacts(t, s);
      for (const [k, v] of Object.entries(facts)) {
        expect(t.factKeys, `${t.id}.${k}`).toContain(k);
        expect(typeof v === "number" || /^[a-z0-9_]+$/.test(String(v)), `${t.id}.${k}`).toBe(true);
      }
    }
  });

  it("turns the buffer into whole days, with the target and safety buffer from the formulas", () => {
    const facts = buildModuleFacts(
      topicById("buffer_in_days")!,
      signals({ health: health({ buffer: 20 }) }),
    );
    // 20/100 of 3 months = 0.6 months = 18 days
    expect(facts).toEqual({
      buffer_days: 18,
      buffer_target_days: 90,
      safety_buffer_days: 7,
      low_balance_days: 0,
    });
  });

  it("leaves out what is unknown instead of sending a placeholder", () => {
    const facts = buildModuleFacts(
      topicById("lean_weeks")!,
      signals({ health: null, incomeType: "gig" }),
    );
    expect(facts).toEqual({ income_type: "gig" });
  });

  it("names the weakest score part by id with its score", () => {
    const facts = buildModuleFacts(
      topicById("reading_your_score")!,
      signals({ health: health({ budget: 30, buffer: "n/a" }, { score: 58.6 }) }),
    );
    expect(facts).toEqual({ health_score: 59, weakest_part: "budget", weakest_part_score: 30 });
  });
});

describe("factsChangedMaterially", () => {
  it("is false for small moves and true for big ones, new or missing keys, or a changed id", () => {
    expect(factsChangedMaterially({ a: 100 }, { a: 115 })).toBe(false);
    expect(factsChangedMaterially({ a: 100 }, { a: 130 })).toBe(true);
    expect(factsChangedMaterially({ a: 1 }, { a: 3 })).toBe(false); // moved by 2 only
    expect(factsChangedMaterially({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(factsChangedMaterially({ p: "budget" }, { p: "buffer" })).toBe(true);
  });
});

describe("vetted fact sheet", () => {
  it("every entry names an official source, a link and the day it was checked, in both languages", () => {
    for (const f of LEARN_FACT_SHEET) {
      expect(f.source).not.toBe("");
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(/[অ-হ]/.test(f.bn)).toBe(true);
      expect(f.topics.every((id) => LEARN_TOPIC_IDS.includes(id))).toBe(true);
    }
  });
});

describe("i18n", () => {
  const read = (lang: string) =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../apps/web/src/i18n/${lang}.json`, import.meta.url)),
        "utf8",
      ),
    );
  for (const lang of ["en", "bn"]) {
    it(`${lang}.json has a "why you're seeing this" line for every reason`, () => {
      const reasons = read(lang).learn.foryou.reason;
      for (const r of LEARN_TOPIC_REASONS) expect(reasons[r], r).toBeTruthy();
    });
  }
});
