import type { ComponentKey, HealthResult } from "./health.ts";
import { LEARN_SLUGS } from "./learn.ts";

/**
 * Which learn modules to show first. Plain rules, no model: the weakest part of the health score
 * and the alerts the user has not read yet point at the module that helps, and modules the user
 * has not finished always rank above the ones they have.
 */
export type LearnSlug = (typeof LEARN_SLUGS)[number];

/** Why a module is recommended; the UI turns the key into a sentence in the user's language. */
export type LearnReason =
  | "nudge_budget"
  | "nudge_forecast"
  | "nudge_goal"
  | "nudge_overspend"
  | "nudge_unusual"
  | "weak_savings"
  | "weak_buffer"
  | "weak_stability"
  | "weak_budget"
  | "next_up"
  | "done";

export type RankedModule = { slug: LearnSlug; reason: LearnReason };

/** A health component below this score is "weak" and earns a recommendation. */
export const WEAK_COMPONENT_SCORE = 70;

const COMPONENT_MODULE: Record<ComponentKey, { slug: LearnSlug; reason: LearnReason }> = {
  savings: { slug: "save-small", reason: "weak_savings" },
  buffer: { slug: "emergency-fund", reason: "weak_buffer" },
  stability: { slug: "irregular-income", reason: "weak_stability" },
  budget: { slug: "budget-basics", reason: "weak_budget" },
};

const NUDGE_MODULE: Record<string, { slug: LearnSlug; reason: LearnReason }> = {
  budget_threshold: { slug: "budget-basics", reason: "nudge_budget" },
  budget_exceeded: { slug: "budget-basics", reason: "nudge_budget" },
  forecast_risk: { slug: "emergency-fund", reason: "nudge_forecast" },
  goal_behind: { slug: "goals-that-stick", reason: "nudge_goal" },
  overspend: { slug: "needs-vs-wants", reason: "nudge_overspend" },
  unusual_transaction: { slug: "mobile-money-safety", reason: "nudge_unusual" },
};

export type RankInputs = {
  /** The latest health score breakdown, or null before there is one. */
  health: Pick<HealthResult, "components"> | null;
  /** Types of the alerts the user has not read yet, newest first. */
  activeNudges: string[];
  /** Slugs of the modules the user has finished. */
  completed: ReadonlySet<string>;
};

/**
 * Every module, best recommendation first:
 *   1. unfinished modules an unread alert points at (in the order of the alerts),
 *   2. unfinished modules for the weakest health components (lowest score first),
 *   3. the remaining unfinished modules in course order ("next up"),
 *   4. finished modules, in course order.
 */
export function rankModules(inputs: RankInputs): RankedModule[] {
  const { health, activeNudges, completed } = inputs;
  const reasons = new Map<LearnSlug, LearnReason>();

  for (const type of activeNudges) {
    const hit = NUDGE_MODULE[type];
    if (hit && !reasons.has(hit.slug)) reasons.set(hit.slug, hit.reason);
  }
  const fromNudges = new Set(reasons.keys());

  if (health) {
    const weak = (Object.keys(COMPONENT_MODULE) as ComponentKey[])
      .map((k) => ({ k, c: health.components[k] }))
      .filter(({ c }) => c.available && c.score < WEAK_COMPONENT_SCORE)
      .sort((a, b) => a.c.score - b.c.score);
    for (const { k } of weak) {
      const hit = COMPONENT_MODULE[k];
      if (!reasons.has(hit.slug)) reasons.set(hit.slug, hit.reason);
    }
  }

  const unfinished = LEARN_SLUGS.filter((s) => !completed.has(s));
  const finished = LEARN_SLUGS.filter((s) => completed.has(s));

  const withReason = [...reasons.keys()].filter((s) => !completed.has(s));
  const order = (s: LearnSlug) => [...reasons.keys()].indexOf(s);
  // alert-driven first (they are the most current), then score-driven; both in discovery order
  const alertDriven = withReason
    .filter((s) => fromNudges.has(s))
    .sort((a, b) => order(a) - order(b));
  const scoreDriven = withReason
    .filter((s) => !fromNudges.has(s))
    .sort((a, b) => order(a) - order(b));
  const rest = unfinished.filter((s) => !reasons.has(s));

  return [
    ...[...alertDriven, ...scoreDriven].map((slug) => ({ slug, reason: reasons.get(slug)! })),
    ...rest.map((slug) => ({ slug, reason: "next_up" as const })),
    ...finished.map((slug) => ({ slug, reason: "done" as const })),
  ];
}
