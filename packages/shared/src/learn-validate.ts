import { LEARN_FACT_SHEET } from "./learn-facts.ts";
import {
  MAX_QUICK_OPTION_WORDS,
  generatedModuleSchema,
  renderModuleMarkdown,
  type GeneratedModule,
} from "./learn-module.ts";
import {
  LEARN_STYLE_LIMITS,
  checkStyle,
  countWords,
  splitSentences,
  type LearnLanguage,
  type StyleIssue,
} from "./learn-style.ts";
import type { LearnTopic, ModuleFacts } from "./learn-topics.ts";

/**
 * Checks a generated learn module before anyone sees it. Nothing the model writes is shown unless
 * every rule passes; the reasons come back as data so the generator can retry once with them.
 *
 * The rules, in both English and Bangla:
 *   - the JSON matches the schema, and "Try this" opens the topic's own screen;
 *   - length and shape within the limits measured from the hand-written modules;
 *   - only the Markdown subset the app renders (no emoji, links, tables, HTML, extra marks);
 *   - every number is one of the facts code supplied (Latin or Bangla digits, with or without
 *     commas or the taka sign); a number worked out from them (a sum, a difference) is rejected too;
 *   - the text is in the requested language;
 *   - no URL, no phone-like run of digits, no bank, wallet, fund, share or coin name;
 *   - no promise of returns ("guaranteed", "risk-free", "will earn", a percentage of profit);
 *   - no telling the reader to invest, borrow or buy;
 *   - no shaming words;
 *   - nothing about fields, prompts or instructions.
 */

export type LearnRejection =
  | { code: "schema"; path: string; message: string }
  | { code: "invalid_json" }
  | { code: "wrong_route"; route: string }
  | { code: "style"; issue: StyleIssue }
  | { code: "quick_check_length"; field: string; words: number; max: number }
  | { code: "explanation_sentences"; field: string; count: number }
  | { code: "format"; field: string; mark: string }
  | { code: "ungrounded_number"; field: string; value: string }
  | { code: "wrong_language"; field: string }
  | { code: "url"; field: string }
  | { code: "phone_number"; field: string }
  | { code: "product_name"; field: string; match: string }
  | { code: "guarantee"; field: string; match: string }
  | { code: "advice"; field: string; match: string }
  | { code: "shaming"; field: string; match: string }
  | { code: "internals"; field: string; match: string };

export type Validation =
  { ok: true; module: GeneratedModule } | { ok: false; reasons: LearnRejection[] };

/* --------------------------------------------------------------------------- text helpers */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toLatinDigits = (s: string) =>
  s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Every text field of a module with a readable path, in reading order. */
export function moduleTexts(m: GeneratedModule): { field: string; text: string }[] {
  const out = [
    { field: "title", text: m.title },
    { field: "summary", text: m.summary },
  ];
  m.sections.forEach((s, i) => {
    out.push({ field: `sections.${i}.heading`, text: s.heading });
    out.push({ field: `sections.${i}.paragraph`, text: s.paragraph });
    s.bullets.forEach((b, j) => out.push({ field: `sections.${i}.bullets.${j}`, text: b }));
  });
  out.push({ field: "try_this.text", text: m.try_this.text });
  m.quick_check.forEach((q, i) => {
    out.push({ field: `quick_check.${i}.question`, text: q.question });
    q.options.forEach((o, j) => out.push({ field: `quick_check.${i}.options.${j}`, text: o }));
    out.push({ field: `quick_check.${i}.explanation`, text: q.explanation });
  });
  return out;
}

/**
 * The numbers written in a text, as plain numbers: "৳1,500", "১,৫০০", "1500" and "1,500.50" are
 * read the same way. A comma or point only counts inside a number (not "5," at the end of a clause).
 */
export function extractNumbers(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  for (const m of text.matchAll(/[0-9০-৯](?:[0-9০-৯]|[,.](?=[0-9০-৯]))*/g)) {
    const latin = toLatinDigits(m[0]).replace(/,/g, "");
    const value = Number(latin);
    if (Number.isFinite(value)) out.push({ raw: m[0], value });
  }
  return out;
}

/** The numbers a module may use: every number in the facts, and in the topic's vetted facts. */
export function groundedNumbers(facts: ModuleFacts, language: LearnLanguage): Set<number> {
  const allowed = new Set<number>();
  for (const v of Object.values(facts)) {
    if (typeof v === "number") allowed.add(v);
  }
  const vetted = facts.vetted_facts;
  if (Array.isArray(vetted)) {
    for (const f of LEARN_FACT_SHEET.filter((x) => vetted.includes(x.id))) {
      for (const n of extractNumbers(f[language])) allowed.add(n.value);
    }
  }
  return allowed;
}

/* --------------------------------------------------------------------------- banned patterns */

/**
 * A pattern for words in either script: Latin terms need word boundaries; Bangla terms need only a
 * start boundary, because Bangla attaches case endings ("বিটকয়েনে", "বিটকয়েনের").
 */
const B = "(?<![\\p{L}\\p{M}\\p{N}])";
const E = "(?![\\p{L}\\p{M}\\p{N}])";
const words = (latin: string[], bangla: string[] = []) =>
  new RegExp(
    [...latin.map((w) => `${B}(?:${w})${E}`), ...bangla.map((w) => `${B}(?:${w})`)].join("|"),
    "iu",
  );

type BannedCode =
  "url" | "phone_number" | "product_name" | "guarantee" | "advice" | "shaming" | "internals";

/** Each rule is one or more patterns; any match rejects the field. */
export const LEARN_BANNED: Record<BannedCode, RegExp[]> = {
  url: [/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|gov|bd|io|app|info|xyz)\b/i],
  /** Eight or more digits in a row, allowing spaces, dots or dashes between them. */
  phone_number: [/(?:\+|(?<![0-9০-৯]))(?:[0-9০-৯][\s.-]?){8,}/u],
  product_name: [
    // a capitalised name before a firm word ("Prime Bank"); case-sensitive, so "the bank" passes
    /\b[A-Z][\w&-]*(?: [A-Z][\w&-]*)* (?:Bank|Insurance|Securities|Microfinance|Exchange)\b/u,
    words(
      [
        "bkash",
        "nagad",
        "rocket",
        "surecash",
        "mcash",
        "ok wallet",
        "brac",
        "idlc",
        "lankabangla",
        "dutch[- ]bangla",
        "grameen\\w*",
        "sonali",
        "janata",
        "agrani",
        "rupali",
        "pubali",
        "islami",
        "bitcoin",
        "ethereum",
        "usdt",
        "tether",
        "dogecoin",
        "binance",
        "dse",
        "cse",
        "dhaka stock exchange",
        "chittagong stock exchange",
        "sanchayapatra",
        "sanchaypatra",
        "savings certificates?",
        "dps",
        "fdr",
      ],
      [
        "বিকাশ",
        "রকেট",
        "ব্র্যাক",
        "ডাচ-বাংলা",
        "ডাচ বাংলা",
        "গ্রামীণ",
        "সোনালী ব্যাংক",
        "জনতা ব্যাংক",
        "অগ্রণী ব্যাংক",
        "রূপালী ব্যাংক",
        "পূবালী",
        "ইসলামী ব্যাংক",
        "বিটকয়েন",
        "ইথেরিয়াম",
        "বাইন্যান্স",
        "সঞ্চয়পত্র",
        "ডিপিএস",
        "এফডিআর",
        "স্টক এক্সচেঞ্জ",
      ],
    ),
  ],
  guarantee: [
    words(
      [
        "guarantee[ds]?",
        "risk[- ]free",
        "no risk",
        "(?:sure|assured|fixed|certain) (?:profits?|returns?|income|gains?)",
        "will (?:earn|make you|grow your money|double|multiply)",
        "double your money",
      ],
      [
        "গ্যারান্টি",
        "নিশ্চিত (?:লাভ|মুনাফা|আয়|রিটার্ন)",
        "ঝুঁকিমুক্ত",
        "কোনো ঝুঁকি নেই",
        "লাভ হবেই",
        "দ্বিগুণ হবে",
        "টাকা দ্বিগুণ",
        "আয় করবেন",
      ],
    ),
    // a percentage of return: "12% profit", "১২% লাভ", "interest of 10%"
    /[0-9০-৯][0-9০-৯,.]*\s*(?:%|শতাংশ|percent)\s*(?:returns?|profits?|interest|yield|gains?|a year|per year|annually|a month|per month|লাভ|মুনাফা|রিটার্ন|সুদ)/iu,
    /(?:returns?|profits?|interest|yield|লাভ|মুনাফা|রিটার্ন|সুদ)\s*(?:of|is|হার)?\s*[0-9০-৯][0-9০-৯,.]*\s*(?:%|শতাংশ|percent)/iu,
  ],
  advice: [
    words(
      [
        "you should (?:invest|borrow|buy|take (?:out )?a loan|get a loan|put (?:your )?money)",
        "(?:i|we) (?:recommend|suggest|advise)",
        "consider (?:investing|borrowing|buying|taking (?:out )?a loan)",
        "start investing",
        "(?:good|right|best) time to (?:invest|buy|borrow)",
        "best (?:investments?|funds?|stocks?|shares?|loans?|schemes?)",
      ],
      [
        "বিনিয়োগ করুন",
        "বিনিয়োগ করা উচিত",
        "ঋণ নিন",
        "ধার নিন",
        "লোন নিন",
        "ঋণ নেওয়া উচিত",
        "কেনা উচিত",
        "কিনে ফেলুন",
        "(?:শেয়ার|সোনা|জমি|বন্ড|কয়েন|ক্রিপ্টো|পলিসি|বিমা) কিনুন",
        "আমরা পরামর্শ দিই",
        "আমি সুপারিশ করি",
      ],
    ),
    // an order at the start of a sentence: "Invest now.", "Buy gold.", "Take a loan today."
    /(?:^|[.!?।]\s+)(?:invest|borrow|buy|take (?:out )?a loan)\b/iu,
  ],
  shaming: [
    words(
      [
        "irresponsible",
        "lazy",
        "foolish",
        "stupid",
        "careless",
        "reckless",
        "wasteful",
        "shameful",
        "ashamed",
        "pathetic",
        "bad with money",
        "you (?:failed|wasted)",
      ],
      [
        "দায়িত্বজ্ঞানহীন",
        "অলস",
        "বোকা",
        "লজ্জা",
        "বেহিসাবি",
        "অপচয়ী",
        "উড়নচণ্ডী",
        "আপনি ব্যর্থ",
      ],
    ),
  ],
  internals: [
    words(
      [
        "json",
        "prompt",
        "instructions?",
        "facts? object",
        "fields?",
        "schema",
        "system message",
        "as an ai",
        "language model",
        "placeholder",
      ],
      ["প্রম্পট", "জেসন", "ফিল্ড", "এআই", "ভাষা মডেল"],
    ),
    // a fact key leaking into the text (snake_case or camelCase), or a template marker
    /\b[a-z]+_[a-z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z]*\b|\{\{|\}\}/u,
  ],
};

/** The first text a rule's patterns match, or null. */
export function bannedMatch(code: BannedCode, text: string): string | null {
  for (const re of LEARN_BANNED[code]) {
    const hit = text.match(re);
    if (hit) return hit[0].trim();
  }
  return null;
}

/** Words that may appear in Latin letters inside Bangla text (the app's own names). */
const LATIN_ALLOWED_IN_BN = /\b(?:Compass|upay|PIN|OTP)\b/g;

/** Marks outside the Markdown subset, or that would break the renderer. */
const FORMAT_MARKS: [string, RegExp][] = [
  ["newline", /\n/],
  ["heading", /#/],
  ["table", /\|/],
  ["code", /`/],
  ["html", /[<>]/],
  ["link", /\[|\]/],
  ["strikethrough", /~~/],
  ["underscore", /__|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u],
  ["list", /^\s*(?:[-*+]|\d+[.)])\s/],
  ["emoji", /\p{Extended_Pictographic}/u],
];

/** Markdown problems in one field: unknown marks, or bold that is not a balanced **pair**. */
function formatProblems(text: string, allowBold: boolean): string[] {
  const found = FORMAT_MARKS.filter(([, re]) => re.test(text)).map(([name]) => name);
  const pairs = (text.match(/\*\*/g) ?? []).length;
  const stray = text.replace(/\*\*/g, "").includes("*");
  if (stray || pairs % 2 !== 0) found.push("asterisk");
  else if (pairs > 0 && !allowBold) found.push("bold");
  return found;
}

/**
 * Bangla letters and vowel signs: U+0985-U+09B9, U+09BC-U+09D7, U+09DC-U+09E3, U+09F0-U+09F1.
 * Not the taka sign (U+09F3) or the digits (U+09E6-U+09EF), which are in the Bangla block but are
 * not script. The English check below uses U+0985-U+09E3, U+09E6-U+09EF and U+09F0-U+09F1.
 */
const BN_LETTER = /[অ-হ়-ৗড়-ৣৰৱ]/gu;
const LATIN_LETTER = /[A-Za-z]/g;

function languageProblem(text: string, language: LearnLanguage): boolean {
  if (language === "en") {
    // no Bangla letters or Bangla digits in English text (the taka sign is fine)
    return /[অ-ৣ০-৯ৰৱ]/u.test(text);
  }
  const rest = text.replace(LATIN_ALLOWED_IN_BN, "");
  const bn = (rest.match(BN_LETTER) ?? []).length;
  const latin = (rest.match(LATIN_LETTER) ?? []).length;
  // Bangla digits in Bangla text, and mostly Bangla letters (a field of digits alone is fine)
  if (/[0-9]/.test(text)) return true;
  if (bn === 0 && latin === 0) return false;
  return bn === 0 || latin > bn * 0.1;
}

/**
 * Every rule that looks at one piece of text on its own: format, language and the banned
 * patterns. (Numbers need the facts and are checked by the validator.)
 */
export function textProblems(
  field: string,
  text: string,
  language: LearnLanguage,
  allowBold: boolean,
): LearnRejection[] {
  const out: LearnRejection[] = [];
  for (const mark of formatProblems(text, allowBold)) out.push({ code: "format", field, mark });
  if (languageProblem(text, language)) out.push({ code: "wrong_language", field });
  if (bannedMatch("url", text) !== null) out.push({ code: "url", field });
  if (bannedMatch("phone_number", text) !== null) out.push({ code: "phone_number", field });
  for (const code of ["product_name", "guarantee", "advice", "shaming", "internals"] as const) {
    const match = bannedMatch(code, text);
    if (match !== null) out.push({ code, field, match });
  }
  return out;
}

/* ----------------------------------------------------------------------------- the validator */

export function validateGeneratedModule(
  output: unknown,
  facts: ModuleFacts,
  topic: Pick<LearnTopic, "route">,
  language: LearnLanguage,
): Validation {
  const parsed = generatedModuleSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map((i) => ({
        code: "schema" as const,
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  const m = parsed.data;
  const reasons: LearnRejection[] = [];

  if (m.try_this.route !== topic.route)
    reasons.push({ code: "wrong_route", route: m.try_this.route });

  for (const issue of checkStyle(renderModuleMarkdown(m, language), m.title, m.summary, language)) {
    reasons.push({ code: "style", issue });
  }
  const maxSentence = LEARN_STYLE_LIMITS[language].sentenceWords;
  m.quick_check.forEach((q, i) => {
    const check = (field: string, words: number, max: number) => {
      if (words > max) reasons.push({ code: "quick_check_length", field, words, max });
    };
    check(`quick_check.${i}.question`, countWords(q.question), maxSentence);
    check(`quick_check.${i}.explanation`, countWords(q.explanation), maxSentence);
    q.options.forEach((o, j) =>
      check(`quick_check.${i}.options.${j}`, countWords(o), MAX_QUICK_OPTION_WORDS),
    );
    const sentences = splitSentences(q.explanation).length;
    if (sentences !== 1) {
      reasons.push({
        code: "explanation_sentences",
        field: `quick_check.${i}.explanation`,
        count: sentences,
      });
    }
  });

  const allowed = groundedNumbers(facts, language);
  for (const { field, text } of moduleTexts(m)) {
    reasons.push(...textProblems(field, text, language, /paragraph|bullets/.test(field)));
    for (const n of extractNumbers(text)) {
      if (!allowed.has(n.value)) reasons.push({ code: "ungrounded_number", field, value: n.raw });
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true, module: m };
}

/** One line per reason, for the retry message and for logs (no model text beyond the match). */
export function describeRejection(r: LearnRejection): string {
  switch (r.code) {
    case "schema":
      return `The JSON does not match the schema at "${r.path}": ${r.message}.`;
    case "invalid_json":
      return "The reply was not valid JSON.";
    case "wrong_route":
      return `try_this.route must be the route given, not "${r.route}".`;
    case "style": {
      const i = r.issue;
      if (i.code === "too_long")
        return `The ${i.what} is ${i.words} long; the limit is ${i.max}. Shorten it.`;
      if (i.code === "sentence_too_long")
        return `A sentence has ${i.words} words; the limit is ${i.max}. Split it.`;
      if (i.code === "bullet_too_long")
        return `A bullet has ${i.words} words; the limit is ${i.max}.`;
      if (i.code === "section_count") return `There are ${i.count} sections; write 2 to 4.`;
      if (i.code === "list_size") return `A bullet list has ${i.count} items; use 2 to 4, or none.`;
      return `A section has ${i.count} lists; use at most one.`;
    }
    case "quick_check_length":
      return `${r.field} has ${r.words} words; the limit is ${r.max}.`;
    case "explanation_sentences":
      return `${r.field} has ${r.count} sentences; write exactly one.`;
    case "format":
      return `${r.field} contains formatting that is not allowed (${r.mark}). Plain text only; **bold** only in paragraphs and bullets.`;
    case "ungrounded_number":
      return `${r.field} uses the number ${r.value}, which is not in the facts. Use only the facts' numbers, exactly as given, and no sums or differences.`;
    case "wrong_language":
      return `${r.field} is not written in the requested language (use its own digits too).`;
    case "url":
      return `${r.field} contains a web address. Remove it.`;
    case "phone_number":
      return `${r.field} contains a phone-like number. Remove it.`;
    case "product_name":
      return `${r.field} names a product, firm or coin ("${r.match}"). Name none.`;
    case "guarantee":
      return `${r.field} promises a return or safety ("${r.match}"). Promise nothing.`;
    case "advice":
      return `${r.field} tells the reader to invest, borrow or buy ("${r.match}"). Do not.`;
    case "shaming":
      return `${r.field} uses a judging word ("${r.match}"). Keep the tone kind.`;
    case "internals":
      return `${r.field} mentions data fields or instructions ("${r.match}"). Write for the reader only.`;
  }
}
