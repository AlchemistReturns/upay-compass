import type { ActionId, ComponentKey } from "./health.ts";
import type { Affordability, Forecast } from "./forecast.ts";

/**
 * What the AI coach is allowed to see: a compact summary of the user's own numbers. It never
 * contains phone numbers, names, merchant or counterparty names, or a transaction list. Every
 * figure is computed here, in code; the model only explains them.
 */
export type CoachContextInput = {
  language: "bn" | "en";
  incomeType: string | null;
  balance: number;
  last30: {
    income: number;
    spend: number;
    byCategory: { category: string; total: number }[];
  };
  /** Spending in the last 7 days, and the average week over the 8 weeks before it. */
  week: {
    thisWeek: { category: string; total: number }[];
    usualWeek: { category: string; total: number }[];
  };
  budgets: { category: string; limit: number; spent: number }[];
  goals: {
    title: string;
    target: number;
    saved: number;
    targetDate: string | null;
    projectedDate: string | null;
    status: string;
  }[];
  health: {
    score: number;
    confidence: "low" | "ok";
    components: Record<ComponentKey, number>;
    actions: ActionId[];
  } | null;
  forecast: Forecast | null;
  txCount: number;
  historyDays: number;
};

export type CoachContext = {
  language: "bn" | "en";
  currency: "BDT (taka, written with the symbol ৳)";
  incomeType: string | null;
  walletBalance: number;
  dataSufficiency: "ok" | "thin";
  history: { transactions: number; days: number };
  last30Days: {
    income: number;
    spending: number;
    saved: number;
    spendingByCategory: { category: string; total: number }[];
  };
  weekComparison: {
    thisWeekSpending: number;
    usualWeeklySpending: number;
    thisWeekByCategory: { category: string; total: number }[];
    usualWeekByCategory: { category: string; total: number }[];
  };
  budgetsThisMonth: {
    category: string;
    limit: number;
    spent: number;
    status: "ok" | "near" | "over";
  }[];
  goals: CoachContextInput["goals"];
  healthScore: {
    score: number;
    confidence: "low" | "ok";
    componentScores: Record<ComponentKey, number>;
    topImprovementAreas: string[];
  } | null;
  forecast30Days:
    | { available: false }
    | {
        available: true;
        confidence: "low" | "ok";
        safetyBuffer: number;
        lowestBalance: { day: string; balance: number };
        daysBelowBuffer: number;
        firstDayBelowBuffer: string | null;
        expectedRecurringIncome: number;
        expectedRecurringPayments: number;
      };
  /** Present only when the user asked "can I afford X?"; computed by code. */
  affordability?: Affordability & { explanation: string };
};

const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-US")}`;

/**
 * The affordability result as one plain English sentence, so the coach can restate it without
 * quoting field names. Every figure in it comes from `canAfford`.
 */
export function explainAffordability(a: Affordability): string {
  if (a.verdict === "insufficient") {
    return `There is not enough transaction history to say whether ${taka(a.amount)} is affordable. Ask the user to add more transactions.`;
  }
  const lowest =
    a.lowestAfter !== null && a.lowestDay
      ? ` Over the next 30 days the balance would bottom out at ${taka(a.lowestAfter)} on ${a.lowestDay}, against a safety buffer of ${taka(a.safetyBuffer)}.`
      : "";
  const negative = a.firstNegativeDay
    ? ` It would first drop below zero on ${a.firstNegativeDay}.`
    : "";
  const verdict = {
    yes: "Answer: yes, the user can afford it; the balance stays above the safety buffer.",
    tight:
      "Answer: it is possible but tight; the balance stays above zero but dips below the safety buffer.",
    no: "Answer: no, not comfortably; the balance would go below zero.",
  }[a.verdict];
  return `If the user spends ${taka(a.amount)} today, the wallet balance goes from ${taka(a.balanceNow)} to ${taka(a.balanceAfter)}.${lowest}${negative} ${verdict}`;
}

/** Improvement areas in plain words, so the model never repeats an internal id like build_buffer. */
export const ACTION_WORDS: Record<ActionId, string> = {
  save_more: "saving a bit more each month",
  set_budgets: "setting a budget for the biggest spending category",
  fix_budget: "bringing an over-limit budget back under control",
  build_buffer: "building up an emergency buffer",
  smooth_income: "putting money aside in better weeks to cover leaner ones",
};

/** Below this the coach must say there is not enough data instead of guessing. */
export const THIN_TRANSACTIONS = 15;
export const THIN_HISTORY_DAYS = 14;

const r = (n: number) => Math.round(n);

export function buildCoachContext(
  input: CoachContextInput,
  affordability?: Affordability,
): CoachContext {
  const f = input.forecast;
  const thin = input.txCount < THIN_TRANSACTIONS || input.historyDays < THIN_HISTORY_DAYS;

  return {
    language: input.language,
    currency: "BDT (taka, written with the symbol ৳)",
    incomeType: input.incomeType,
    walletBalance: r(input.balance),
    dataSufficiency: thin ? "thin" : "ok",
    history: { transactions: input.txCount, days: input.historyDays },
    last30Days: {
      income: r(input.last30.income),
      spending: r(input.last30.spend),
      // From the rounded figures, so the three numbers the model sees always add up.
      saved: r(input.last30.income) - r(input.last30.spend),
      spendingByCategory: input.last30.byCategory
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
        .map((c) => ({ category: c.category, total: r(c.total) })),
    },
    weekComparison: {
      thisWeekSpending: input.week.thisWeek.reduce((n, c) => n + r(c.total), 0),
      usualWeeklySpending: input.week.usualWeek.reduce((n, c) => n + r(c.total), 0),
      thisWeekByCategory: input.week.thisWeek
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map((c) => ({ category: c.category, total: r(c.total) })),
      usualWeekByCategory: input.week.usualWeek
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map((c) => ({ category: c.category, total: r(c.total) })),
    },
    budgetsThisMonth: input.budgets.map((b) => ({
      category: b.category,
      limit: r(b.limit),
      spent: r(b.spent),
      status: b.spent > b.limit ? "over" : b.spent >= b.limit * 0.8 ? "near" : "ok",
    })),
    goals: input.goals.map((g) => ({
      ...g,
      target: r(g.target),
      saved: r(g.saved),
    })),
    healthScore: input.health
      ? {
          score: input.health.score,
          confidence: input.health.confidence,
          componentScores: Object.fromEntries(
            Object.entries(input.health.components).map(([k, v]) => [k, r(v)]),
          ) as Record<ComponentKey, number>,
          topImprovementAreas: input.health.actions.map((a) => ACTION_WORDS[a]),
        }
      : null,
    forecast30Days:
      f && !f.insufficient && f.lowest
        ? {
            available: true,
            confidence: f.confidence,
            safetyBuffer: r(f.safetyBuffer),
            lowestBalance: { day: f.lowest.day, balance: r(f.lowest.balance) },
            daysBelowBuffer: f.risks.length,
            firstDayBelowBuffer: f.firstRiskDay,
            expectedRecurringIncome: r(f.expectedIncome),
            expectedRecurringPayments: r(f.expectedBills),
          }
        : { available: false },
    ...(affordability
      ? { affordability: { ...affordability, explanation: explainAffordability(affordability) } }
      : {}),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Reading "can I afford X?" out of a message                                                  */
/* ------------------------------------------------------------------------------------------ */

/** The language to answer in: whatever script the user wrote in, else their app language. */
export function detectReplyLanguage(message: string, fallback: "bn" | "en"): "bn" | "en" {
  if (/[ঀ-৿]/.test(message)) return "bn";
  if (/[A-Za-z]{2,}/.test(message)) return "en";
  return fallback;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

const AFFORD_INTENT =
  /(afford|buy|purchase|get a|get an|spend|pay for|splurge|কিনতে|কিনব|কিনবো|কিনি|কেনা|কিনে|পারব|পারবো|পারি|খরচ করতে|নিতে পারি)/i;
const CURRENCY_MARK = /(?:৳|tk\.?|taka|টাকা)/i;

/** Amounts mentioned in text, with "5k", "5 thousand", "৫ হাজার" and lakh expanded. */
export function extractAmounts(text: string): { amount: number; marked: boolean }[] {
  const t = toAscii(text).replace(/(\d),(?=\d{3}\b)/g, "$1");
  const found: { amount: number; marked: boolean }[] = [];
  const re =
    /(৳|tk\.?\s*)?(\d+(?:\.\d+)?)\s*(k\b|thousand|হাজার|lakh|lac|লাখ)?\s*(taka|tk\b|টাকা)?/gi;
  for (const m of t.matchAll(re)) {
    let amount = Number(m[2]);
    const unit = (m[3] ?? "").toLowerCase();
    if (unit === "k" || unit === "thousand" || unit === "হাজার") amount *= 1000;
    else if (unit === "lakh" || unit === "lac" || unit === "লাখ") amount *= 100_000;
    if (!(amount > 0)) continue;
    found.push({ amount, marked: Boolean(m[1] || m[4] || CURRENCY_MARK.test(m[0]!)) });
  }
  return found;
}

/** The amount in an affordability question, or null if this is not one. */
export function detectAffordIntent(text: string): { amount: number } | null {
  if (!AFFORD_INTENT.test(text)) return null;
  const amounts = extractAmounts(text).filter((a) => a.amount >= 100);
  if (amounts.length === 0) return null;
  // Prefer an amount marked as money; otherwise the largest, skipping things that look like years.
  const marked = amounts.find((a) => a.marked);
  if (marked) return { amount: marked.amount };
  const plausible = amounts.filter((a) => !(a.amount >= 1900 && a.amount <= 2100));
  const pick = plausible.sort((a, b) => b.amount - a.amount)[0];
  return pick ? { amount: pick.amount } : null;
}

/** Every number in a nested object, for checking that a reply only cites numbers we supplied. */
export function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) into.add(Math.abs(value));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, into));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectNumbers(v, into));
  } else if (typeof value === "string") {
    for (const m of toAscii(value).matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(m[0]));
  }
  return into;
}
