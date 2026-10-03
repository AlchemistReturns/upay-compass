import { dayDiff } from "./dates.ts";
import { BUFFER_DAYS, type RiskFlag } from "./forecast.ts";
import type { GoalProjection } from "./goals.ts";
import {
  BUFFER_TARGET_MONTHS,
  COMPONENT_KEYS,
  type ComponentKey,
  type HealthResult,
} from "./health.ts";
import { vettedFactsFor } from "./learn-facts.ts";
import type { ReadinessKey, ReadinessResult } from "./readiness.ts";

/**
 * "Made for you" learn modules (F28): which topics to teach this person, decided by code.
 *
 * Each topic has a signal rule: a pure function from what the app already knows about the person
 * (score components, budgets, goals, unread alerts, forecast risks, income type) to a score from 0
 * to 1 and a reason id. The best few topics are picked here; a language model only writes the text,
 * from a small facts object built here (numbers and ids only). The model never chooses the topic,
 * never computes a number and never gives investment, loan or insurance advice.
 */

/* ------------------------------------------------------------------------------------ signals */

/** Score of one component, and whether there was enough data to measure it. */
export type SignalComponent = { score: number; available: boolean; raw: number | null };

/**
 * What the topic rules look at. Built by `buildLearnSignals` from data the app already has; no new
 * analysis. The optional fields at the end are for summaries other work may add later (cash-outs,
 * month-end bills, small repeated spends, festival dates). Topics that need them stay silent until
 * they are filled in, and pick them up as soon as they are.
 */
export type LearnSignals = {
  incomeType: "student" | "gig" | "salaried" | null;
  health: {
    score: number;
    confidence: "low" | "ok";
    components: Record<ComponentKey, SignalComponent>;
  } | null;
  readiness: {
    score: number;
    components: Record<ReadinessKey, SignalComponent>;
  } | null;
  budgets: { total: number; near: number; over: number };
  goals: { active: number; behind: number; noSavings: number };
  /** Types of the alerts the person has not read yet. */
  unreadNudges: string[];
  forecast: {
    insufficient: boolean;
    /** Days in the next 30 below the safety buffer, and below zero. */
    lowDays: number;
    negativeDays: number;
    /** Days from today to the first such day, or null. */
    daysToFirstLow: number | null;
  } | null;
  /** Cash-outs in the last 30 days (optional; not computed in this branch). */
  cashOut?: { count30: number; total30: number };
  /** Share (0-1) of regular bills that fall in the last 7 days of the month (optional). */
  monthEnd?: { billsShareLastWeek: number };
  /** Small payments (under about ৳200) in the last 30 days (optional). */
  smallSpends?: { count30: number; total30: number };
  /** The next festival and how far away it is (optional; dates must come from learn-facts.ts). */
  festival?: { id: string; daysAway: number };
};

type StoredForecast = {
  insufficient: boolean;
  today: string;
  risks: RiskFlag[];
};

export type LearnSignalInput = {
  incomeType: string | null;
  /** The latest health score breakdown, or null. */
  health: Pick<HealthResult, "score" | "confidence" | "components"> | null;
  /** The latest readiness breakdown, or null. */
  readiness: Pick<ReadinessResult, "score" | "components"> | null;
  /** This month's budgets: limit, spent so far and the alert threshold (0-1). */
  budgets: { limit: number; spent: number; threshold: number }[];
  /** Status of each active goal (from projectGoal). */
  goalStatuses: GoalProjection["status"][];
  unreadNudges: string[];
  forecast: StoredForecast | null;
  extras?: Pick<LearnSignals, "cashOut" | "monthEnd" | "smallSpends" | "festival">;
};

const component = (c: { score: number; available: boolean; raw: number | null }) => ({
  score: c.score,
  available: c.available,
  raw: c.raw,
});

/** Turns what the app has loaded into the signals the topic rules read. Pure. */
export function buildLearnSignals(input: LearnSignalInput): LearnSignals {
  const income = input.incomeType;
  const forecast = input.forecast;
  const firstRisk = forecast && !forecast.insufficient ? forecast.risks[0] : undefined;
  return {
    incomeType: income === "student" || income === "gig" || income === "salaried" ? income : null,
    health: input.health
      ? {
          score: input.health.score,
          confidence: input.health.confidence,
          components: Object.fromEntries(
            COMPONENT_KEYS.map((k) => [k, component(input.health!.components[k])]),
          ) as Record<ComponentKey, SignalComponent>,
        }
      : null,
    readiness: input.readiness
      ? {
          score: input.readiness.score,
          components: Object.fromEntries(
            Object.entries(input.readiness.components).map(([k, c]) => [k, component(c)]),
          ) as Record<ReadinessKey, SignalComponent>,
        }
      : null,
    budgets: {
      total: input.budgets.length,
      over: input.budgets.filter((b) => b.spent > b.limit).length,
      near: input.budgets.filter((b) => b.spent <= b.limit && b.spent >= b.limit * b.threshold)
        .length,
    },
    goals: {
      active: input.goalStatuses.filter((s) => s !== "completed").length,
      behind: input.goalStatuses.filter((s) => s === "behind").length,
      noSavings: input.goalStatuses.filter((s) => s === "no_contributions").length,
    },
    unreadNudges: [...input.unreadNudges],
    forecast: forecast
      ? {
          insufficient: forecast.insufficient,
          lowDays: forecast.insufficient ? 0 : forecast.risks.length,
          negativeDays: forecast.insufficient
            ? 0
            : forecast.risks.filter((r) => r.level === "negative").length,
          daysToFirstLow: firstRisk ? dayDiff(forecast.today, firstRisk.day) : null,
        }
      : null,
    ...input.extras,
  };
}

/* ------------------------------------------------------------------------------------- topics */

/** Screens a "Try this" button may open. The topic fixes which one; the model cannot change it. */
export const LEARN_ROUTES = {
  budgets: "/budgets",
  goals: "/goals",
  forecast: "/forecast",
  score: "/score",
  readiness: "/readiness",
  transactions: "/transactions",
  profile: "/profile",
} as const;
export type LearnRouteId = keyof typeof LEARN_ROUTES;

/** Groups of topics; the picker prefers topics from different groups. */
export type TopicCategory = "cashflow" | "saving" | "spending" | "safety" | "understanding";

/**
 * Why a topic was picked. The app renders "Why you're seeing this" from this id through i18n
 * templates (learn.foryou.reason.<id>), never from model text.
 */
export const LEARN_TOPIC_REASONS = [
  "cash_out_frequent",
  "income_varies",
  "income_gig",
  "goal_behind",
  "goal_no_savings",
  "no_goal",
  "buffer_thin",
  "forecast_low",
  "bills_late",
  "bills_squeeze",
  "bills_month_end",
  "small_spends_many",
  "savings_low",
  "festival_soon",
  "unusual_payment",
  "basics_covered",
  "score_new",
  "score_weak_part",
  "budget_over",
  "budget_near",
  "no_budgets",
  "forecast_negative",
  "money_pressure",
] as const;
export type TopicReason = (typeof LEARN_TOPIC_REASONS)[number];

export type TopicSignal = { score: number; reason: TopicReason } | null;

export type FactValue = number | string;
export type ModuleFacts = Record<string, FactValue | string[]>;

export type LearnTopic = {
  id: string;
  category: TopicCategory;
  /** What the reader should come away with (prompt input, English). */
  goal: string;
  /** Points the module should cover, in order (prompt input, English). Concept-level. */
  outline: readonly string[];
  /** Keys the facts object may carry. Nothing else is sent to the model. */
  factKeys: readonly string[];
  /** Topic-specific things the text must not do (prompt input; the validator enforces the general ones). */
  banned: readonly string[];
  /** The screen the "Try this" button opens. */
  route: LearnRouteId;
  /** 0-1 and a reason, or null when the topic does not apply. */
  signal: (s: LearnSignals) => TopicSignal;
  /** Numbers and ids for the text, from the same signals. Only keys in `factKeys`. */
  facts: (s: LearnSignals) => Record<string, FactValue | undefined>;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n);
/** A measurable component under 70 is weak: 70 gives 0, 0 gives 1. */
const weakness = (c: SignalComponent | undefined) =>
  c && c.available && c.score < 70 ? clamp01((70 - c.score) / 70) : 0;
/** The larger of several candidate signals; null when none applies. */
function best(...candidates: TopicSignal[]): TopicSignal {
  let top: TopicSignal = null;
  for (const c of candidates) if (c && c.score > 0 && (!top || c.score > top.score)) top = c;
  return top;
}
const sig = (score: number, reason: TopicReason): TopicSignal =>
  score > 0 ? { score: Math.round(clamp01(score) * 1000) / 1000, reason } : null;

/** Never in any generated module (also enforced by the validator). */
const COMMON_BANNED = [
  "Do not name any bank, wallet, app, company, fund, product, share or coin.",
  "Do not tell the reader to invest, borrow, take a loan, or buy any financial product.",
  "Do not promise or estimate any return, profit, interest or outcome.",
] as const;

export const LEARN_TOPICS: readonly LearnTopic[] = [
  {
    id: "cash_out_cost",
    category: "spending",
    goal: "Understand that every cash-out can carry a fee and that paying digitally where possible keeps more money in the wallet.",
    outline: [
      "What a cash-out costs in general terms (a fee each time, set by the provider)",
      "How many cash-outs the reader made recently, from the facts",
      "Simple ways to need fewer: pay the shop or person directly, group cash needs into one trip",
    ],
    factKeys: ["cash_outs_30d", "cash_out_total_30d"],
    banned: ["Do not state any fee amount or rate; none is supplied."],
    route: "transactions",
    signal: (s) =>
      s.cashOut && s.cashOut.count30 >= 2
        ? sig(0.4 + 0.1 * s.cashOut.count30, "cash_out_frequent")
        : null,
    facts: (s) => ({
      cash_outs_30d: s.cashOut?.count30,
      cash_out_total_30d: s.cashOut ? round(s.cashOut.total30) : undefined,
    }),
  },
  {
    id: "lean_weeks",
    category: "cashflow",
    goal: "Plan around the lean weeks of an uneven income, and keep a small reserve that smooths the gaps.",
    outline: [
      "Why uneven income makes planning feel hard, without blame",
      "How much the reader's monthly income changed, from the facts",
      "Plan on a lean week, set the extra from good weeks aside, draw on it in lean weeks",
    ],
    factKeys: ["income_change_pct", "stability_score", "income_type"],
    banned: [],
    route: "forecast",
    signal: (s) =>
      best(
        sig(0.35 + 0.65 * weakness(s.health?.components.stability), "income_varies"),
        s.incomeType === "gig" ? sig(0.5, "income_gig") : null,
      ),
    facts: (s) => {
      const c = s.health?.components.stability;
      return {
        income_change_pct: c?.available && c.raw !== null ? round(c.raw * 100) : undefined,
        stability_score: c?.available ? round(c.score) : undefined,
        income_type: s.incomeType ?? undefined,
      };
    },
  },
  {
    id: "goals_that_last",
    category: "saving",
    goal: "Understand why savings goals stall and how to set one the reader can keep: small, dated, and paid first.",
    outline: [
      "Why goals stall: too big, no date, saving what is left instead of first",
      "Where the reader's goals stand, from the facts (counts only)",
      "Make the next step small and regular, and adjust the date rather than stop",
    ],
    factKeys: ["goals_active", "goals_behind", "goals_without_savings"],
    banned: [],
    route: "goals",
    signal: (s) =>
      best(
        s.unreadNudges.includes("goal_behind") ? sig(0.85, "goal_behind") : null,
        s.goals.behind > 0 ? sig(0.8, "goal_behind") : null,
        s.goals.noSavings > 0 ? sig(0.6, "goal_no_savings") : null,
        s.goals.active === 0 && s.health ? sig(0.45, "no_goal") : null,
      ),
    facts: (s) => ({
      goals_active: s.goals.active,
      goals_behind: s.goals.behind,
      goals_without_savings: s.goals.noSavings,
    }),
  },
  {
    id: "buffer_in_days",
    category: "saving",
    goal: "See the emergency buffer as a number of days of essential spending, and grow it a few days at a time.",
    outline: [
      "What a buffer is for: a surprise bill or a week without income",
      "How many days of essentials the reader's balance covers, and the app's target, from the facts",
      "Grow it in small steps: first the safety buffer days, then a month",
    ],
    factKeys: ["buffer_days", "buffer_target_days", "safety_buffer_days", "low_balance_days"],
    banned: [],
    route: "goals",
    signal: (s) =>
      best(
        sig(0.3 + 0.7 * weakness(s.health?.components.buffer), "buffer_thin"),
        s.forecast && s.forecast.lowDays > 0 ? sig(0.7, "forecast_low") : null,
        s.unreadNudges.includes("forecast_risk") ? sig(0.75, "forecast_low") : null,
      ),
    facts: (s) => {
      const c = s.health?.components.buffer;
      return {
        buffer_days: c?.available && c.raw !== null ? round(c.raw * 30) : undefined,
        buffer_target_days: BUFFER_TARGET_MONTHS * 30,
        safety_buffer_days: BUFFER_DAYS,
        low_balance_days: s.forecast && !s.forecast.insufficient ? s.forecast.lowDays : undefined,
      };
    },
  },
  {
    id: "month_end_bills",
    category: "cashflow",
    goal: "Notice when regular bills bunch together near the end of the month, and set money for them aside when income arrives.",
    outline: [
      "Why bills that land together squeeze the balance",
      "What the reader's forecast and bill timing show, from the facts",
      "Set bill money aside on payday, and check the forecast a week ahead",
    ],
    factKeys: ["punctuality_score", "days_to_first_low", "low_balance_days", "bills_month_end_pct"],
    banned: [],
    route: "forecast",
    signal: (s) =>
      best(
        sig(0.3 + 0.7 * weakness(s.readiness?.components.punctuality), "bills_late"),
        s.forecast && s.forecast.daysToFirstLow !== null && s.forecast.daysToFirstLow <= 14
          ? sig(0.65, "bills_squeeze")
          : null,
        s.monthEnd && s.monthEnd.billsShareLastWeek >= 0.5
          ? sig(0.4 + 0.4 * s.monthEnd.billsShareLastWeek, "bills_month_end")
          : null,
      ),
    facts: (s) => {
      const p = s.readiness?.components.punctuality;
      return {
        punctuality_score: p?.available ? round(p.score) : undefined,
        days_to_first_low: s.forecast?.daysToFirstLow ?? undefined,
        low_balance_days: s.forecast && !s.forecast.insufficient ? s.forecast.lowDays : undefined,
        bills_month_end_pct: s.monthEnd ? round(s.monthEnd.billsShareLastWeek * 100) : undefined,
      };
    },
  },
  {
    id: "small_repeats",
    category: "spending",
    goal: "See how small repeated spends add up, and choose one to trim without giving up everything.",
    outline: [
      "Small amounts feel harmless one at a time",
      "What the reader's savings rate or small spends look like, from the facts",
      "Pick one small habit to trim, keep the ones that matter",
    ],
    factKeys: ["savings_rate_pct", "small_spends_30d", "small_spend_total_30d"],
    banned: [],
    route: "budgets",
    signal: (s) =>
      best(
        s.smallSpends && s.smallSpends.count30 >= 15
          ? sig(0.45 + s.smallSpends.count30 / 100, "small_spends_many")
          : null,
        sig(0.25 + 0.6 * weakness(s.health?.components.savings), "savings_low"),
      ),
    facts: (s) => {
      const c = s.health?.components.savings;
      return {
        savings_rate_pct: c?.available && c.raw !== null ? round(c.raw * 100) : undefined,
        small_spends_30d: s.smallSpends?.count30,
        small_spend_total_30d: s.smallSpends ? round(s.smallSpends.total30) : undefined,
      };
    },
  },
  {
    id: "festival_planning",
    category: "saving",
    goal: "Plan for festival spending (gifts, clothes, travel, food) ahead of time so it does not empty the wallet at once.",
    outline: [
      "Festival costs are predictable even though they feel sudden",
      "How far away the next festival is, from the facts",
      "List the usual costs, divide them over the weeks left, set a small goal",
    ],
    factKeys: ["festival", "days_to_festival"],
    banned: ["Do not state any festival date; only the number of days in the facts."],
    route: "goals",
    signal: (s) =>
      s.festival && s.festival.daysAway >= 0 && s.festival.daysAway <= 60
        ? sig(0.5 + 0.4 * (1 - s.festival.daysAway / 60), "festival_soon")
        : null,
    facts: (s) => ({ festival: s.festival?.id, days_to_festival: s.festival?.daysAway }),
  },
  {
    id: "scam_safety",
    category: "safety",
    goal: "Recognise the common mobile-money tricks and what to do when a payment or message looks wrong.",
    outline: [
      "Most losses come from tricking people, not breaking the system",
      "Never share a PIN or one-time code; a real company never asks",
      "If a payment looks unfamiliar, check it and change the PIN",
    ],
    factKeys: [],
    banned: ["Do not give any phone number, website or link to contact."],
    route: "profile",
    signal: (s) =>
      s.unreadNudges.includes("unusual_transaction") ? sig(0.75, "unusual_payment") : null,
    facts: () => ({}),
  },
  {
    id: "beyond_basics",
    category: "understanding",
    goal: "Concept-level only: what investing means, how risk and return go together, why promises of sure profit are a warning sign, and what to check before putting money anywhere.",
    outline: [
      "Investing means putting money where it may grow or shrink; it is not saving",
      "Higher possible gain always comes with higher risk of loss",
      "An offer that says you cannot lose is a warning sign",
      "Questions to ask first: who holds the money, can I get it back, is it licensed",
    ],
    factKeys: ["health_score", "buffer_days"],
    banned: [
      "Do not name or describe any product, firm, fund, share, coin, scheme or platform.",
      "Do not say the reader should invest, buy or choose anything, now or later.",
      "Do not mention any rate, percentage or amount of return.",
      "Do not use the words guaranteed, risk-free or sure profit; say 'an offer that says you cannot lose'.",
    ],
    route: "score",
    signal: (s) => {
      const h = s.health;
      if (!h || h.confidence !== "ok" || h.score < 75) return null;
      const c = h.components;
      const solid =
        c.buffer.available && c.buffer.score >= 80 && c.savings.available && c.savings.score >= 70;
      if (!solid || s.budgets.over > 0 || (s.forecast?.negativeDays ?? 0) > 0) return null;
      return sig(0.5 + (h.score - 75) / 50, "basics_covered");
    },
    facts: (s) => {
      const c = s.health?.components.buffer;
      return {
        health_score: s.health ? round(s.health.score) : undefined,
        buffer_days: c?.available && c.raw !== null ? round(c.raw * 30) : undefined,
      };
    },
  },
  {
    id: "reading_your_score",
    category: "understanding",
    goal: "Read the health score as four separate parts, and know that the weakest part is the one worth working on.",
    outline: [
      "The score is made of four parts: saving, budgets, buffer, income steadiness",
      "The reader's score and its weakest part, from the facts",
      "A low part is information, not a judgement; one part at a time",
    ],
    factKeys: ["health_score", "weakest_part", "weakest_part_score"],
    banned: [],
    route: "score",
    signal: (s) => {
      const h = s.health;
      if (!h) return null;
      if (h.confidence === "low") return sig(0.42, "score_new");
      const weakest = Math.min(
        ...COMPONENT_KEYS.filter((k) => h.components[k].available).map(
          (k) => h.components[k].score,
        ),
      );
      return weakest < 50 && h.score < 65
        ? sig(0.42 + (50 - weakest) / 250, "score_weak_part")
        : null;
    },
    facts: (s) => {
      const h = s.health;
      if (!h) return {};
      const available = COMPONENT_KEYS.filter((k) => h.components[k].available);
      const weakest = available.reduce<ComponentKey | undefined>(
        (w, k) => (w === undefined || h.components[k].score < h.components[w].score ? k : w),
        undefined,
      );
      return {
        health_score: round(h.score),
        weakest_part: weakest,
        weakest_part_score: weakest ? round(h.components[weakest].score) : undefined,
      };
    },
  },
  {
    id: "budgets_that_fit",
    category: "spending",
    goal: "Use a budget as a plan the reader controls rather than a rule that punishes, and adjust a limit that keeps breaking.",
    outline: [
      "A budget is a plan made in advance, not a restriction",
      "Where the reader's budgets stand, from the facts (counts only)",
      "If a limit keeps breaking, change the limit or the plan, and check weekly",
    ],
    factKeys: ["budgets_total", "budgets_over", "budgets_near"],
    banned: [],
    route: "budgets",
    signal: (s) =>
      best(
        s.budgets.over > 0 ? sig(0.8, "budget_over") : null,
        s.unreadNudges.some((n) => n.startsWith("budget_")) ? sig(0.75, "budget_near") : null,
        s.budgets.near > 0 ? sig(0.6, "budget_near") : null,
        s.budgets.total === 0 && s.health ? sig(0.42, "no_budgets") : null,
      ),
    facts: (s) => ({
      budgets_total: s.budgets.total,
      budgets_over: s.budgets.over,
      budgets_near: s.budgets.near,
    }),
  },
  {
    id: "borrowing_pressure",
    category: "cashflow",
    goal: "Concept-level: what to think through before borrowing when money is tight (total cost, repaying in a lean month, pressure tactics), without any advice to borrow or not.",
    outline: [
      "Tight weeks make quick loans tempting",
      "What the reader's forecast shows, from the facts",
      "Before any loan: the total repaid, the lean-month test, never decide under pressure",
    ],
    factKeys: ["negative_balance_days", "low_balance_days", "days_to_first_low"],
    banned: [
      "Do not name any lender, app or loan product.",
      "Do not say whether the reader should or should not borrow.",
      "Do not state any interest rate or fee.",
    ],
    route: "forecast",
    signal: (s) =>
      best(
        s.forecast && s.forecast.negativeDays > 0 ? sig(0.75, "forecast_negative") : null,
        s.forecast && s.forecast.lowDays > 0 && weakness(s.health?.components.buffer) > 0.5
          ? sig(0.5, "money_pressure")
          : null,
      ),
    facts: (s) => ({
      negative_balance_days:
        s.forecast && !s.forecast.insufficient ? s.forecast.negativeDays : undefined,
      low_balance_days: s.forecast && !s.forecast.insufficient ? s.forecast.lowDays : undefined,
      days_to_first_low: s.forecast?.daysToFirstLow ?? undefined,
    }),
  },
];

export const LEARN_TOPIC_IDS = LEARN_TOPICS.map((t) => t.id);

export function topicById(id: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.id === id);
}

/** General rules for every topic's text (prompt input). */
export function bannedNotes(topic: LearnTopic): string[] {
  return [...COMMON_BANNED, ...topic.banned];
}

/* ---------------------------------------------------------------------------------- selection */

/** A topic must score at least this to be picked. */
export const MIN_TOPIC_SCORE = 0.4;
/** At most this many "Made for you" modules. */
export const MAX_PERSONAL_TOPICS = 3;
/** A topic finished or dismissed within this many days is not picked again. */
export const TOPIC_REPEAT_DAYS = 14;

export type PickedTopic = { topic: LearnTopic; score: number; reason: TopicReason };

/**
 * Up to three topics for this person, best first.
 *   - Topics scoring under MIN_TOPIC_SCORE are dropped.
 *   - Topics in `recent` (finished or dismissed) less than TOPIC_REPEAT_DAYS ago are dropped.
 *   - Diversity: one topic per category first, then, only if slots are left, the best remaining.
 *     So whenever topics from two categories qualify, the set covers at least two.
 *   - Ties keep catalog order, so the same input always gives the same answer.
 */
export function pickPersonalizedTopics(
  signals: LearnSignals,
  recent: { topicId: string; at: string }[],
  now: Date,
): PickedTopic[] {
  const cutoff = now.getTime() - TOPIC_REPEAT_DAYS * 86_400_000;
  const blocked = new Set(recent.filter((r) => Date.parse(r.at) > cutoff).map((r) => r.topicId));

  const candidates = LEARN_TOPICS.flatMap((topic, index) => {
    if (blocked.has(topic.id)) return [];
    const s = topic.signal(signals);
    if (!s || s.score < MIN_TOPIC_SCORE) return [];
    return [{ topic, score: Math.round(s.score * 1000) / 1000, reason: s.reason, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: typeof candidates = [];
  const categories = new Set<TopicCategory>();
  for (const c of candidates) {
    if (picked.length === MAX_PERSONAL_TOPICS) break;
    if (categories.has(c.topic.category)) continue;
    picked.push(c);
    categories.add(c.topic.category);
  }
  for (const c of candidates) {
    if (picked.length === MAX_PERSONAL_TOPICS) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ topic, score, reason }) => ({ topic, score, reason }));
}

/* -------------------------------------------------------------------------------------- facts */

/**
 * The only data the model sees for a module: numbers and ids under the topic's allowed keys, plus
 * the ids of any vetted facts (learn-facts.ts) for the topic. No names, no merchants, no list of
 * transactions. Keys whose value is unknown are left out, so the model cannot be tempted to fill
 * them in.
 */
export function buildModuleFacts(topic: LearnTopic, signals: LearnSignals): ModuleFacts {
  const raw = topic.facts(signals);
  const facts: ModuleFacts = {};
  for (const key of topic.factKeys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) facts[key] = value;
    else if (typeof value === "string" && /^[a-z0-9_]+$/.test(value)) facts[key] = value;
  }
  const vetted = vettedFactsFor(topic.id).map((f) => f.id);
  if (vetted.length) facts.vetted_facts = vetted;
  return facts;
}

/**
 * Whether stored facts are out of date enough to write the module again: a key appeared or
 * vanished, an id changed, or a number moved by more than 20% (and by more than 2, so a count
 * going from 1 to 2 does not count).
 */
export function factsChangedMaterially(previous: ModuleFacts, next: ModuleFacts): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const k of keys) {
    const a = previous[k];
    const b = next[k];
    if (a === undefined || b === undefined) return true;
    if (typeof a === "number" && typeof b === "number") {
      const diff = Math.abs(a - b);
      if (diff > 2 && diff > 0.2 * Math.max(Math.abs(a), Math.abs(b))) return true;
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      return true;
    }
  }
  return false;
}
