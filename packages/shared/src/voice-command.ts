import { z } from "zod";
import { CATEGORY_KEYS, type CategoryKey } from "./categories.ts";
import { categorize, normalizeKeyword } from "./categorize.ts";
import { addDays, dayDiff, formatDay, parseDay, weekdayOf } from "./dates.ts";
import { candidateAmounts } from "./spoken-number.ts";

/**
 * Voice commands. The model only turns what a person said into ONE typed command; this file is the
 * code that decides whether that command is acceptable. Nothing here trusts the model's numbers:
 * the amount must be one the person actually said (read from the transcript by code), dates are
 * resolved by code from a fixed set of tokens, categories must be in the allowed list, and goals
 * are matched by code against the person's own goal names. The result is a command the app shows
 * on a confirmation card; nothing runs from a transcript alone.
 */
export const VOICE_INTENTS = [
  "add_transaction",
  "delete_transaction",
  "create_budget",
  "create_goal",
  "add_to_goal",
  "ask_coach",
  "unclear",
] as const;
export type VoiceIntent = (typeof VOICE_INTENTS)[number];

/** Largest amount a voice command may carry (one crore); anything bigger is almost surely a mishearing. */
export const MAX_VOICE_AMOUNT = 10_000_000;
const MAX_NAME = 80;

/** What the model returns: one flat object, every field present, unused ones null. */
export const rawCommandSchema = z.object({
  intent: z.enum(VOICE_INTENTS),
  amount: z.number().nullable(),
  direction: z.enum(["in", "out"]).nullable(),
  merchant: z.string().nullable(),
  category: z.string().nullable(),
  /** a date token: today, yesterday, day_before_yesterday, N_days_ago, last_<weekday>, or YYYY-MM-DD */
  date: z.string().nullable(),
  note: z.string().nullable(),
  /** the goal an amount is added to, as the person named it */
  goal: z.string().nullable(),
  /** the name of a new goal */
  title: z.string().nullable(),
  /** "last" for the most recent payment, "match" to find by the other fields */
  which: z.enum(["last", "match"]).nullable(),
  reason: z.string().nullable(),
});
export type RawCommand = z.infer<typeof rawCommandSchema>;

/** The same shape as a JSON schema for OpenAI structured output (strict: every field required). */
export const RAW_COMMAND_JSON_SCHEMA = {
  name: "voice_command",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: Object.keys(rawCommandSchema.shape),
    properties: {
      intent: { type: "string", enum: [...VOICE_INTENTS] },
      amount: { type: ["number", "null"] },
      direction: { type: ["string", "null"], enum: ["in", "out", null] },
      merchant: { type: ["string", "null"] },
      category: { type: ["string", "null"], enum: [...CATEGORY_KEYS, null] },
      date: { type: ["string", "null"] },
      note: { type: ["string", "null"] },
      goal: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      which: { type: ["string", "null"], enum: ["last", "match", null] },
      reason: { type: ["string", "null"] },
    },
  },
} as const;

export type GoalRef = { id: string; title: string };

export type VoiceContext = {
  /** What the person said (the transcript, or the text they typed). */
  transcript: string;
  /** Today's date in Bangladesh, "YYYY-MM-DD". */
  today: string;
  goals: GoalRef[];
};

export type Command =
  | {
      intent: "add_transaction";
      amount: number;
      direction: "in" | "out";
      merchant: string;
      category: CategoryKey;
      date: string;
      note: string;
    }
  | {
      intent: "delete_transaction";
      which: "last" | "match";
      amount: number | null;
      merchant: string | null;
      date: string | null;
      direction: "in" | "out" | null;
    }
  | { intent: "create_budget"; category: CategoryKey; limit: number }
  | { intent: "create_goal"; title: string; target: number; targetDate: string | null }
  | {
      intent: "add_to_goal";
      amount: number;
      goalTitle: string;
      /** The goal when exactly one matches; null when the person must choose. */
      goalId: string | null;
      /** Every goal that could be meant (one, several, or all when none matched the words). */
      goalCandidates: GoalRef[];
    }
  | { intent: "ask_coach"; question: string };

export type Rejection =
  | "invalid_output"
  | "unclear"
  | "amount_missing"
  | "amount_unverified"
  | "amount_mismatch"
  | "amount_unreasonable"
  | "category_invalid"
  | "date_invalid"
  | "name_missing"
  | "no_goals"
  | "nothing_to_match";

export type Validated = { ok: true; command: Command } | { ok: false; reason: Rejection };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * A date token to a calendar day. Tokens: today, yesterday, day_before_yesterday, N_days_ago
 * (1 to 60), last_<weekday> (the most recent one before today), or an ISO date. A payment cannot be
 * in the future or more than a year back; a goal's target date must be in the future (up to 10
 * years). Returns null for anything else.
 */
export function resolveVoiceDate(
  token: string | null,
  today: string,
  kind: "past" | "future" = "past",
): string | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  let day: string | null = null;

  if (t === "today") day = today;
  else if (t === "yesterday") day = addDays(today, -1);
  else if (t === "day_before_yesterday") day = addDays(today, -2);
  else {
    const ago = /^(\d{1,2})_days_ago$/.exec(t);
    const last = /^last_([a-z]+)$/.exec(t);
    if (ago) {
      const n = Number(ago[1]);
      if (n >= 1 && n <= 60) day = addDays(today, -n);
    } else if (last) {
      const w = WEEKDAYS.indexOf(last[1]!);
      if (w >= 0) {
        const back = (weekdayOf(today) - w + 7) % 7 || 7; // today's weekday means a week ago
        day = addDays(today, -back);
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const parsed = parseDay(t);
      if (!Number.isNaN(parsed.getTime()) && formatDay(parsed) === t) day = t;
    }
  }
  if (!day) return null;

  const diff = dayDiff(today, day); // positive when the day is after today
  if (kind === "past") return diff <= 0 && diff >= -366 ? day : null;
  return diff >= 1 && diff <= 3660 ? day : null;
}

const clean = (s: string | null, max = MAX_NAME): string =>
  (s ?? "")
    // control characters and long digit runs (phone-like numbers) never go into a stored name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\+?\d[\d\s-]{6,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** The amount must be one the person said. Returns the amount or the reason it was refused. */
function checkAmount(amount: number | null, transcript: string): number | Rejection {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return "amount_missing";
  if (amount > MAX_VOICE_AMOUNT) return "amount_unreasonable";
  const said = candidateAmounts(transcript);
  if (said.length === 0) return "amount_unverified";
  return said.some((s) => Math.abs(s - amount) < 0.005) ? amount : "amount_mismatch";
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) =>
  norm(s)
    .split(/[\s,.;:!?()"'।-]+/)
    .filter((w) => w.length > 1);

/** Goals that could be what the person named: exact, then containing, then sharing a word. */
export function matchGoals(spoken: string, goals: GoalRef[]): GoalRef[] {
  const q = norm(spoken);
  if (!q) return [];
  const exact = goals.filter((g) => norm(g.title) === q);
  if (exact.length > 0) return exact;
  const containing = goals.filter((g) => norm(g.title).includes(q) || q.includes(norm(g.title)));
  if (containing.length > 0) return containing;
  const qWords = new Set(words(spoken));
  return goals.filter((g) => words(g.title).some((w) => qWords.has(w)));
}

export function validateCommand(raw: unknown, ctx: VoiceContext): Validated {
  const parsed = rawCommandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_output" };
  const r = parsed.data;
  const fail = (reason: Rejection): Validated => ({ ok: false, reason });

  switch (r.intent) {
    case "unclear":
      return fail("unclear");

    case "ask_coach": {
      // The question is what the person said, not the model's rewrite of it.
      const question = ctx.transcript.trim().slice(0, 1000);
      return question ? { ok: true, command: { intent: "ask_coach", question } } : fail("unclear");
    }

    case "add_transaction": {
      const amount = checkAmount(r.amount, ctx.transcript);
      if (typeof amount !== "number") return fail(amount);
      const direction = r.direction ?? "out";
      const date = r.date ? resolveVoiceDate(r.date, ctx.today) : ctx.today;
      if (!date) return fail("date_invalid");
      const merchant = clean(r.merchant);
      const note = clean(r.note, 200);
      let category: CategoryKey;
      if (direction === "in") category = "income";
      else if (
        r.category &&
        (CATEGORY_KEYS as readonly string[]).includes(r.category) &&
        r.category !== "income"
      ) {
        category = r.category as CategoryKey;
      } else {
        // the model gave none (or an invalid one): the same rules the rest of the app uses
        category =
          categorize({ direction, channel: "merchant", counterparty: merchant, note })?.category ??
          "other";
      }
      return {
        ok: true,
        command: { intent: "add_transaction", amount, direction, merchant, category, date, note },
      };
    }

    case "delete_transaction": {
      const which = r.which ?? "match";
      let amount: number | null = null;
      if (r.amount !== null) {
        const checked = checkAmount(r.amount, ctx.transcript);
        if (typeof checked !== "number") return fail(checked);
        amount = checked;
      }
      const date = r.date ? resolveVoiceDate(r.date, ctx.today) : null;
      if (r.date && !date) return fail("date_invalid");
      const merchant = clean(r.merchant) || null;
      if (which === "match" && amount === null && !merchant && !date)
        return fail("nothing_to_match");
      return {
        ok: true,
        command: {
          intent: "delete_transaction",
          which,
          amount,
          merchant,
          date,
          direction: r.direction,
        },
      };
    }

    case "create_budget": {
      const limit = checkAmount(r.amount, ctx.transcript);
      if (typeof limit !== "number") return fail(limit);
      const known = (CATEGORY_KEYS as readonly string[]).includes(r.category ?? "");
      if (!known || r.category === "income" || r.category === "savings")
        return fail("category_invalid");
      return {
        ok: true,
        command: { intent: "create_budget", category: r.category as CategoryKey, limit },
      };
    }

    case "create_goal": {
      const target = checkAmount(r.amount, ctx.transcript);
      if (typeof target !== "number") return fail(target);
      const title = clean(r.title);
      if (!title) return fail("name_missing");
      const targetDate = r.date ? resolveVoiceDate(r.date, ctx.today, "future") : null;
      if (r.date && !targetDate) return fail("date_invalid");
      return { ok: true, command: { intent: "create_goal", title, target, targetDate } };
    }

    case "add_to_goal": {
      const amount = checkAmount(r.amount, ctx.transcript);
      if (typeof amount !== "number") return fail(amount);
      if (ctx.goals.length === 0) return fail("no_goals");
      const spoken = clean(r.goal);
      const matches = matchGoals(spoken, ctx.goals);
      const candidates = matches.length > 0 ? matches : ctx.goals;
      return {
        ok: true,
        command: {
          intent: "add_to_goal",
          amount,
          goalTitle: spoken,
          goalId: matches.length === 1 ? matches[0]!.id : null,
          goalCandidates: candidates,
        },
      };
    }
  }
}

/** A payment's merchant in the form the app stores for matching ("tea stall"). */
export const voiceMerchantKey = (merchant: string) => normalizeKeyword(merchant);
