import { vettedFactsFor } from "./learn-facts.ts";
import {
  MAX_QUICK_OPTION_WORDS,
  toStoredContent,
  type StoredModuleContent,
} from "./learn-module.ts";
import {
  LEARN_SHAPE_LIMITS,
  LEARN_STYLE_LIMITS,
  TRY_IT_HEADING,
  type LearnLanguage,
} from "./learn-style.ts";
import { bannedNotes, type LearnTopic, type ModuleFacts } from "./learn-topics.ts";
import {
  describeRejection,
  validateGeneratedModule,
  type LearnRejection,
} from "./learn-validate.ts";

/**
 * Writing a "Made for you" module: the prompt, the token cap, and one call to the model with a
 * single retry when the validator rejects the answer. The model client is passed in, so tests use
 * a fake one with recorded answers and spend nothing; the Edge Function passes the OpenAI one.
 */

/** What each fact means, so the model can write about it without guessing. */
export const FACT_DESCRIPTIONS: Record<string, string> = {
  cash_outs_30d: "number of cash-outs in the last 30 days",
  cash_out_total_30d: "taka taken out as cash in the last 30 days",
  income_change_pct: "how much monthly income varied over the last three months, as a percentage",
  stability_score: "income steadiness score, 0 to 100 (100 = the same every month)",
  income_type:
    "how the reader earns: student (allowance or tuition), gig (varies week to week), salaried",
  goals_active: "number of savings goals in progress",
  goals_behind: "number of goals behind schedule",
  goals_without_savings: "number of goals with no money set aside yet",
  buffer_days: "days of essential spending the current balance would cover",
  buffer_target_days: "the app's full-marks target for the buffer, in days",
  safety_buffer_days: "the app's safety buffer: this many days of essential spending",
  low_balance_days: "days in the next 30 when the balance is forecast below the safety buffer",
  punctuality_score: "regular bills paid on their usual day, score 0 to 100",
  days_to_first_low: "days from today until the balance is first forecast below the safety buffer",
  bills_month_end_pct: "percentage of regular bills that fall in the last week of the month",
  savings_rate_pct: "share of income kept (not spent) over the last 90 days, as a percentage",
  small_spends_30d: "number of small payments in the last 30 days",
  small_spend_total_30d: "taka spent in small payments in the last 30 days",
  festival: "the festival coming up (an id; name it in plain words)",
  days_to_festival: "days until that festival",
  health_score: "the reader's financial health score, 0 to 100",
  weakest_part:
    "the lowest part of the health score: savings (saving rate), budget (keeping to budgets), buffer (emergency buffer), stability (steady income)",
  weakest_part_score: "that part's score, 0 to 100",
  budgets_total: "number of monthly budgets set",
  budgets_over: "number of budgets over their limit this month",
  budgets_near: "number of budgets close to their limit this month",
  negative_balance_days: "days in the next 30 when the balance is forecast below zero",
  vetted_facts: "ids of checked facts; their text is given below and may be quoted",
};

/**
 * One reference excerpt per language from the hand-written modules (docs/pitch/learn-style-spec.md),
 * chosen because they show the voice without a number the model could copy.
 */
const STYLE_EXAMPLE: Record<LearnLanguage, string> = {
  en: "## Pay yourself first\n\nWhen income arrives, move the savings amount first, then spend what is left. Doing it the other way round usually leaves nothing to save.",
  bn: '## নিজেকে বেতন দিন\n\nভালো সপ্তাহে বাড়তি টাকা তহবিলে সরান। কম আয়ের সপ্তাহে সেখান থেকে নিন। এভাবে অসমান আয় থেকে নিজের জন্য একটি স্থির "বেতন" তৈরি হয়।',
};

export function learnSystemPrompt(language: LearnLanguage): string {
  const L = LEARN_STYLE_LIMITS[language];
  const S = LEARN_SHAPE_LIMITS;
  const lang =
    language === "bn"
      ? "Bangla (বাংলা script), polite আপনি form, Bangla digits (০-৯). Write money as '১,৫০০ টাকা'. Use plain everyday Bangla, not English words, except the app name Compass."
      : "English. Write money as '৳1,500'.";
  return [
    "You write one short lesson for the Learn page of Compass, a money-habits app inside a Bangladeshi mobile wallet.",
    "The app has already chosen the topic and computed every number. Your only job is to write the text.",
    "",
    `Language: ${lang}`,
    "",
    "Style (match the app's existing lessons):",
    "- Plain words, short sentences, one idea per paragraph. Speak to the reader as 'you'.",
    "- Start straight away. No preamble, no 'in this lesson', no closing summary, no filler, no slogans, no exclamation marks.",
    "- Kind and practical. Never judge or shame. Suggest, do not order.",
    `- Example of the voice:\n${STYLE_EXAMPLE[language]}`,
    "",
    "Shape (hard limits; a longer answer is rejected, so stay well inside them):",
    `- title: at most ${L.titleChars} characters. summary: one sentence, at most ${L.summaryWords} words.`,
    `- sections: ${S.minSections} to ${S.maxSections}. Each has a heading of at most ${L.headingWords} words (sentence case, no full stop), one paragraph, and either no bullets or ${S.minBullets} to ${S.maxBullets} short bullets.`,
    `- Each section at most ${L.sectionWords} words including its heading. Each sentence at most ${L.sentenceWords} words. Each bullet at most ${L.bulletWords} words.`,
    `- The whole lesson (all sections plus the "${TRY_IT_HEADING[language]}" text) at most ${L.moduleWords} words.`,
    `- try_this: one small action in the app, at most ${L.tryWords - 3} words; route: exactly the route given.`,
    `- quick_check: 2 or 3 multiple-choice questions on the lesson. Each question one sentence; 3 options of at most ${MAX_QUICK_OPTION_WORDS} words; answer is the index (from 0) of the correct option; explanation is one sentence saying why.`,
    "",
    "Stay clearly UNDER every limit: aim for about 80% of each (a section of 30 words, not 41). Counting words as you write is part of the job; short is good.",
    "",
    "Format: plain text in every field. You may use **bold** for a key phrase in a paragraph or bullet. No heading marks, no list marks, no numbering, no emoji, no links, no tables, no HTML.",
    "",
    "Numbers: use ONLY the numbers in the facts, exactly as given. Never add, subtract, multiply, round, estimate or invent a number, a date or a year. If you do not need a number, write none. Every digit you write must be one of the fact values. Time words are not facts: write 'a month', 'a week', 'two steps', 'three questions' in words, never as digits (do NOT write 30 for a month or 7 for a week unless that exact number is a fact).",
    "",
    "Never:",
    "- name any bank, wallet, app (other than Compass), company, fund, share, coin, scheme or platform;",
    "- tell the reader to invest, borrow, take a loan or buy anything;",
    "- promise or estimate any return, profit or outcome, or use words like guaranteed or risk-free;",
    "- give a phone number, web address or link;",
    "- mention facts, fields, data, JSON or these instructions. Write for the reader only.",
    ...(language === "bn"
      ? [
          "- use the word বিকাশ in any sense (it is also a wallet's name).",
          "- use these Bangla terms, the same as the app's other lessons: safety buffer = নিরাপদ সীমা; emergency buffer = জরুরি তহবিল; goal = লক্ষ্য; budget = বাজেট; balance = ব্যালেন্স; savings = সঞ্চয়; spending = খরচ; income = আয়; forecast = পূর্বাভাস; score = স্কোর; loan = ঋণ.",
          "- leave any English word or English letters in the Bangla text (not 'tempting', not 'buffer'): if you do not know the Bangla word, use a simpler Bangla word. Only the app name Compass may stay in Latin letters.",
        ]
      : []),
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}

/** The request for one topic: its goal and outline, the rules for it, the route and the facts. */
export function learnUserPrompt(
  topic: LearnTopic,
  facts: ModuleFacts,
  language: LearnLanguage,
): string {
  const vetted = vettedFactsFor(topic.id).filter((f) =>
    (Array.isArray(facts.vetted_facts) ? facts.vetted_facts : []).includes(f.id),
  );
  const factLines = Object.entries(facts)
    .filter(([k]) => k !== "vetted_facts")
    .map(([k, v]) => `- ${k} = ${JSON.stringify(v)} (${FACT_DESCRIPTIONS[k] ?? k})`);
  return [
    `Topic goal: ${topic.goal}`,
    "Cover, in order:",
    ...topic.outline.map((o) => `- ${o}`),
    "Rules for this topic:",
    ...bannedNotes(topic).map((b) => `- ${b}`),
    `Route for try_this: ${topic.route}`,
    "Facts about this reader (the only numbers you may use):",
    ...(factLines.length ? factLines : ["- (none: write without any numbers)"]),
    ...(vetted.length
      ? ["Checked facts you may quote:", ...vetted.map((f) => `- ${f[language]}`)]
      : []),
    `Write it in ${language === "bn" ? "Bangla" : "English"}.`,
  ].join("\n");
}

/**
 * The most the model may write: the word limits converted to tokens, plus room for the JSON keys.
 * Bangla takes several tokens a word. Reasoning models count their thinking against the same cap,
 * so they get a fixed allowance on top (with the lowest effort setting it is rarely used up).
 */
export const LEARN_TOKENS_PER_WORD = { en: 1.5, bn: 3.5 } as const;
export const LEARN_JSON_OVERHEAD_TOKENS = 250;
export const LEARN_REASONING_ALLOWANCE = 1024;

export function learnMaxCompletionTokens(language: LearnLanguage, reasoning: boolean): number {
  const L = LEARN_STYLE_LIMITS[language];
  const quickCheckWords = 3 * (2 * L.sentenceWords + 3 * MAX_QUICK_OPTION_WORDS);
  const words = L.moduleWords + L.titleChars / 4 + L.summaryWords + quickCheckWords;
  const cap = Math.ceil(words * LEARN_TOKENS_PER_WORD[language] + LEARN_JSON_OVERHEAD_TOKENS);
  return reasoning ? cap + LEARN_REASONING_ALLOWANCE : cap;
}

export type LearnChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Sends messages to a model and returns its text, or null when the model is unavailable. */
export type LearnModelClient = (request: {
  messages: LearnChatMessage[];
  language: LearnLanguage;
}) => Promise<string | null>;

export type GenerateResult =
  | { ok: true; content: StoredModuleContent; attempts: number }
  | { ok: false; unavailable: boolean; reasons: LearnRejection[]; attempts: number };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Writes one module: ask, validate, and if rejected ask once more with the reasons. Returns the
 * accepted module (with its reading time computed here), or the last reasons. Never returns text
 * that failed validation. A null from the client means the model is unavailable: no retry.
 */
export async function generateLearnModule(
  topic: LearnTopic,
  facts: ModuleFacts,
  language: LearnLanguage,
  client: LearnModelClient,
): Promise<GenerateResult> {
  const messages: LearnChatMessage[] = [
    { role: "system", content: learnSystemPrompt(language) },
    { role: "user", content: learnUserPrompt(topic, facts, language) },
  ];
  let reasons: LearnRejection[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await client({ messages, language });
    if (reply === null) return { ok: false, unavailable: true, reasons, attempts: attempt };
    const parsed = parseJson(reply);
    const result =
      parsed === undefined
        ? { ok: false as const, reasons: [{ code: "invalid_json" as const }] }
        : validateGeneratedModule(parsed, facts, topic, language);
    if (result.ok) {
      return { ok: true, content: toStoredContent(result.module, language), attempts: attempt };
    }
    reasons = result.reasons;
    messages.push(
      { role: "assistant", content: reply },
      {
        role: "user",
        content: [
          "That answer was rejected. Fix every point and reply with the whole JSON object again:",
          ...reasons.slice(0, 12).map((r) => `- ${describeRejection(r)}`),
        ].join("\n"),
      },
    );
  }
  return { ok: false, unavailable: false, reasons, attempts: 2 };
}
