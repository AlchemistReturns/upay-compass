/**
 * Financial health score (0-100). A pure, explainable function: every number the UI shows comes from
 * here, never from a language model. Weights follow the spec: savings 30, budgets 25, buffer 25,
 * income stability 20. Each component is normalized to 0-100 first.
 */

export type HealthInputs = {
  /** Transactions the user has at all. */
  txCount: number;
  /** Days of history inside the 90-day window (1-90). */
  historyDays: number;
  /** Money in over the window. */
  income: number;
  /** Money out over the window, excluding transfers into savings. */
  spend: number;
  /** Money out in essential categories over the window (not used by the buffer any more). */
  essentialSpend: number;
  /** Essential spending per complete calendar month (Bangladesh time), newest first (up to 3). */
  essentialMonths: number[];
  /** Essential spending so far in the current calendar month. */
  essentialThisMonth: number;
  /** Income per complete calendar month (Bangladesh time), newest first (up to 3). */
  incomeBuckets: number[];
  /** Current wallet balance. */
  balance: number;
  /** This month's budgets with spending so far. */
  budgets: { categoryId: number; limit: number; spent: number }[];
};

export const HEALTH_WEIGHTS = { savings: 0.3, budget: 0.25, buffer: 0.25, stability: 0.2 } as const;
export type ComponentKey = keyof typeof HEALTH_WEIGHTS;
export const COMPONENT_KEYS = Object.keys(HEALTH_WEIGHTS) as ComponentKey[];

/** 20% of income saved earns full marks. */
export const SAVINGS_TARGET_RATE = 0.2;
/** Three months of essential spending in the wallet earns full marks. */
export const BUFFER_TARGET_MONTHS = 3;
/** Income varying by 50% or more between months earns zero. */
export const STABILITY_ZERO_CV = 0.5;
/** A budget 50% over its limit earns zero for that budget. */
export const BUDGET_OVERSHOOT_ZERO = 0.5;
/** A component that cannot be measured yet counts as neutral. */
export const NEUTRAL_SCORE = 50;

const MIN_TRANSACTIONS = 15;
const MIN_HISTORY_DAYS = 28;

export type Component = {
  /** 0-100 */
  score: number;
  weight: number;
  /** false when there was not enough data and the neutral score was used */
  available: boolean;
  /** The measured quantity: savings rate, over-budget count, months of buffer, income CV. */
  raw: number | null;
  /** Buffer only: whether the monthly figure is an average of complete months or this month so far. */
  basis?: "months" | "month_so_far";
};

export type ActionId =
  "save_more" | "set_budgets" | "fix_budget" | "build_buffer" | "smooth_income";

/** Improvement tip as data; the UI turns `id` + `params` into a sentence in the user's language. */
export type HealthAction = {
  id: ActionId;
  component: ComponentKey;
  params: Record<string, number>;
};

export type HealthResult = {
  score: number;
  /** "low" when there is too little history for the score to mean much. */
  confidence: "low" | "ok";
  components: Record<ComponentKey, Component>;
  actions: HealthAction[];
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

const unavailable = (key: ComponentKey): Component => ({
  score: NEUTRAL_SCORE,
  weight: HEALTH_WEIGHTS[key],
  available: false,
  raw: null,
});

function savingsComponent(i: HealthInputs): Component {
  if (i.income <= 0) return unavailable("savings");
  const rate = (i.income - i.spend) / i.income;
  return {
    score: clamp01(rate / SAVINGS_TARGET_RATE) * 100,
    weight: HEALTH_WEIGHTS.savings,
    available: true,
    raw: rate,
  };
}

/** Budget adherence component; also the 'budget' measure of the readiness scorecard. */
export function budgetComponent(i: Pick<HealthInputs, "budgets">): Component {
  if (i.budgets.length === 0) return unavailable("budget");
  const scores = i.budgets.map((b) => {
    const ratio = b.spent / b.limit;
    return ratio <= 1 ? 100 : clamp01(1 - (ratio - 1) / BUDGET_OVERSHOOT_ZERO) * 100;
  });
  const over = i.budgets.filter((b) => b.spent > b.limit).length;
  return {
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    weight: HEALTH_WEIGHTS.budget,
    available: true,
    raw: over,
  };
}

/**
 * What the person spends on essentials in a month, from what they logged, with no scaling: the
 * average of the complete calendar months we have (up to three), or, until one has completed,
 * this month's essentials so far (clearly marked as such, because early in a month it undercounts).
 * Rent paid once a month counts once; a bill paid three times counts three times.
 */
export function monthlyEssential(
  i: Pick<HealthInputs, "essentialMonths" | "essentialThisMonth">,
): { amount: number; basis: "months" | "month_so_far" } | null {
  if (i.essentialMonths.length > 0) {
    const amount = i.essentialMonths.reduce((a, c) => a + c, 0) / i.essentialMonths.length;
    // complete months with nothing logged say nothing about spending: fall through to this month
    if (amount > 0) return { amount, basis: "months" };
  }
  return i.essentialThisMonth > 0 ? { amount: i.essentialThisMonth, basis: "month_so_far" } : null;
}

function bufferComponent(i: HealthInputs): Component {
  const monthly = monthlyEssential(i);
  if (!monthly) return unavailable("buffer");
  const months = Math.max(0, i.balance) / monthly.amount;
  return {
    score: clamp01(months / BUFFER_TARGET_MONTHS) * 100,
    weight: HEALTH_WEIGHTS.buffer,
    available: true,
    raw: months,
    basis: monthly.basis,
  };
}

/** Income stability component; also the 'income consistency' measure of the readiness scorecard. */
export function stabilityComponent(i: Pick<HealthInputs, "incomeBuckets">): Component {
  const b = i.incomeBuckets;
  if (b.length < 2) return unavailable("stability");
  const mean = b.reduce((a, c) => a + c, 0) / b.length;
  if (!(mean > 0)) return unavailable("stability");
  const variance = b.reduce((a, c) => a + (c - mean) ** 2, 0) / b.length;
  const cv = Math.sqrt(variance) / mean;
  return {
    score: clamp01(1 - cv / STABILITY_ZERO_CV) * 100,
    weight: HEALTH_WEIGHTS.stability,
    available: true,
    raw: cv,
  };
}

const monthlyEssentialAmount = (i: HealthInputs) => monthlyEssential(i)?.amount ?? 0;

function buildActions(i: HealthInputs, c: Record<ComponentKey, Component>): HealthAction[] {
  // what was logged is the month's figure; a history shorter than a month is not scaled up
  const months = Math.max(1, i.historyDays / 30);
  // Rank by how many points of the total are still on the table.
  const candidates: { shortfall: number; action: HealthAction }[] = [];
  const shortfall = (k: ComponentKey) => c[k].weight * (100 - c[k].score);

  if (c.savings.available && c.savings.score < 100) {
    const extraMonthly =
      Math.max(0, SAVINGS_TARGET_RATE * i.income - (i.income - i.spend)) / months;
    candidates.push({
      shortfall: shortfall("savings"),
      action: {
        id: "save_more",
        component: "savings",
        params: {
          ratePct: Math.round((c.savings.raw ?? 0) * 100),
          targetPct: SAVINGS_TARGET_RATE * 100,
          extraMonthly: ceilTo(extraMonthly, 10),
        },
      },
    });
  }

  if (!c.budget.available) {
    candidates.push({
      shortfall: shortfall("budget"),
      action: { id: "set_budgets", component: "budget", params: {} },
    });
  } else if (c.budget.score < 100) {
    const worst = [...i.budgets].sort((a, b) => b.spent - b.limit - (a.spent - a.limit))[0]!;
    candidates.push({
      shortfall: shortfall("budget"),
      action: {
        id: "fix_budget",
        component: "budget",
        params: {
          overCount: c.budget.raw ?? 0,
          categoryId: worst.categoryId,
          overBy: Math.max(0, Math.ceil(worst.spent - worst.limit)),
        },
      },
    });
  }

  if (c.buffer.available && c.buffer.score < 100) {
    const monthlyEssential = monthlyEssentialAmount(i);
    candidates.push({
      shortfall: shortfall("buffer"),
      action: {
        id: "build_buffer",
        component: "buffer",
        params: {
          months: round1(c.buffer.raw ?? 0),
          targetMonths: BUFFER_TARGET_MONTHS,
          missing: ceilTo(Math.max(0, BUFFER_TARGET_MONTHS * monthlyEssential - i.balance), 100),
        },
      },
    });
  }

  if (c.stability.available && c.stability.score < 100) {
    candidates.push({
      shortfall: shortfall("stability"),
      action: {
        id: "smooth_income",
        component: "stability",
        params: { variationPct: Math.round((c.stability.raw ?? 0) * 100) },
      },
    });
  }

  return candidates
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 3)
    .map((x) => x.action);
}

export function computeHealthScore(inputs: HealthInputs): HealthResult {
  const components: Record<ComponentKey, Component> = {
    savings: savingsComponent(inputs),
    budget: budgetComponent(inputs),
    buffer: bufferComponent(inputs),
    stability: stabilityComponent(inputs),
  };

  const score = Math.round(
    COMPONENT_KEYS.reduce((sum, k) => sum + components[k].weight * components[k].score, 0),
  );

  return {
    score,
    confidence:
      inputs.txCount < MIN_TRANSACTIONS || inputs.historyDays < MIN_HISTORY_DAYS ? "low" : "ok",
    components,
    actions: buildActions(inputs, components),
  };
}

/** Raw database aggregates (snake_case jsonb from `health_inputs()`) to typed inputs. */
export function parseHealthInputs(raw: unknown): HealthInputs {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0);
  const budgets = Array.isArray(r.budgets) ? r.budgets : [];
  const buckets = Array.isArray(r.income_buckets) ? r.income_buckets : [];
  return {
    txCount: n(r.tx_count),
    historyDays: Math.max(1, n(r.history_days)),
    income: n(r.income),
    spend: n(r.spend),
    essentialSpend: n(r.essential_spend),
    essentialMonths: (Array.isArray(r.essential_months) ? r.essential_months : []).map(n),
    essentialThisMonth: n(r.essential_this_month),
    incomeBuckets: buckets.map(n),
    balance: n(r.balance),
    budgets: budgets.map((b: Record<string, unknown>) => ({
      categoryId: n(b.category_id),
      limit: n(b.limit),
      spent: n(b.spent),
    })),
  };
}

export type ComponentChange = {
  component: ComponentKey;
  from: number;
  to: number;
  /** Change in points of the total score (score change times weight). */
  points: number;
};

/** "What moved your score": per-component change between two snapshots, biggest movers first. */
export function diffHealth(prev: HealthResult, next: HealthResult): ComponentChange[] {
  return COMPONENT_KEYS.map((k) => ({
    component: k,
    from: Math.round(prev.components[k].score),
    to: Math.round(next.components[k].score),
    points: round1(
      next.components[k].weight * (next.components[k].score - prev.components[k].score),
    ),
  }))
    .filter((c) => c.from !== c.to)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}
