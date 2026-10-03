import { describe, expect, it } from "vitest";
import { moduleExpiry, planLearnRefresh, type StoredModuleMeta } from "./learn-plan";
import { buildLearnSignals, buildModuleFacts, topicById, type LearnSignals } from "./learn-topics";

const NOW = new Date("2026-10-03T06:00:00Z");
const comp = (score: number, raw: number) => ({ score, weight: 0.25, available: true, raw });

/** Thin buffer (buffer_in_days), a goal behind (goals_that_last), a budget over (budgets_that_fit). */
const signals: LearnSignals = buildLearnSignals({
  incomeType: "salaried",
  health: {
    score: 50,
    confidence: "ok",
    components: {
      savings: comp(100, 0.2),
      budget: comp(100, 0),
      buffer: comp(0, 0),
      stability: comp(100, 0),
    },
  },
  readiness: null,
  budgets: [{ limit: 100, spent: 200, threshold: 0.8 }],
  goalStatuses: ["behind"],
  unreadNudges: [],
  forecast: null,
});

const row = (topic: string, over: Partial<StoredModuleMeta> = {}): StoredModuleMeta => ({
  id: `row-${topic}`,
  topic_id: topic,
  facts: buildModuleFacts(topicById(topic)!, signals),
  reason_id:
    topic === "buffer_in_days"
      ? "buffer_thin"
      : topic === "goals_that_last"
        ? "goal_behind"
        : "budget_over",
  expires_at: "2026-10-08T00:00:00Z",
  completed_at: null,
  dismissed_at: null,
  ...over,
});
const summary = (stored: StoredModuleMeta[]) =>
  planLearnRefresh(signals, stored, NOW).modules.map((m) => [
    m.pick.topic.id,
    m.reuse ? "reuse" : "write",
  ]);

describe("planLearnRefresh", () => {
  it("writes every picked module when nothing is stored", () => {
    expect(summary([])).toEqual([
      ["buffer_in_days", "write"],
      ["budgets_that_fit", "write"],
      // a buffer score of 0 is also a weak score part; a new category beats a second saving topic
      ["reading_your_score", "write"],
    ]);
  });

  it("reuses a fresh stored module with the same reason and facts", () => {
    expect(summary([row("buffer_in_days"), row("budgets_that_fit")])).toEqual([
      ["buffer_in_days", "reuse"],
      ["budgets_that_fit", "reuse"],
      ["reading_your_score", "write"],
    ]);
  });

  it("writes again when the module is older than 7 days, keeping nothing to fall back on", () => {
    const plan = planLearnRefresh(
      signals,
      [row("buffer_in_days", { expires_at: "2026-10-03T05:59:00Z" })],
      NOW,
    );
    expect(plan.modules[0]).toMatchObject({ reuse: null, fallback: null });
  });

  it("writes again when the reason or the facts changed materially, falling back to the old one", () => {
    const moved = row("buffer_in_days", {
      facts: { ...row("buffer_in_days").facts, buffer_days: 40 },
    });
    const plan = planLearnRefresh(signals, [moved], NOW);
    expect(plan.modules[0]).toMatchObject({ reuse: null, fallback: { id: "row-buffer_in_days" } });
    expect(summary([row("buffer_in_days", { reason_id: "forecast_low" })])[0]).toEqual([
      "buffer_in_days",
      "write",
    ]);
  });

  it("keeps finished modules on show until they expire, and they take a slot", () => {
    const done = row("budgets_that_fit", { completed_at: "2026-10-02T00:00:00Z" });
    const plan = planLearnRefresh(signals, [done], NOW);
    expect(plan.finished.map((r) => r.topic_id)).toEqual(["budgets_that_fit"]);
    // the finished topic is not picked again, so the next best one is
    expect(plan.modules.map((m) => m.pick.topic.id)).toEqual(["buffer_in_days", "goals_that_last"]);
  });

  it("does not bring back a dismissed topic within 14 days", () => {
    const gone = row("buffer_in_days", { dismissed_at: "2026-10-01T00:00:00Z" });
    expect(summary([gone]).map(([id]) => id)).not.toContain("buffer_in_days");
  });

  it("expires a newly written module 7 days later", () => {
    expect(moduleExpiry(NOW)).toBe("2026-10-10T06:00:00.000Z");
  });
});
