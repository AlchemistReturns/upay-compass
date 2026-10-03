/**
 * Measuring a learn module's text: words, sections, bullets, sentences. The same measurements were
 * taken of the eight hand-written modules (docs/pitch/learn-style-spec.md) and turned into the
 * limits below, so a generated module can never be longer or wordier than the course it sits in.
 * Pure: no model, no I/O.
 */

/** A word is a whitespace-separated token with at least one letter or digit (Latin or Bangla). */
const WORDISH = /[\p{L}\p{N}]/u;

/** Plain text of a Markdown-subset line: bold marks, "## " and "- " removed. */
export function plainText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^\s*##\s+/gm, "")
    .replace(/^\s*-\s+/gm, "");
}

export function countWords(text: string): number {
  return plainText(text)
    .split(/\s+/)
    .filter((w) => WORDISH.test(w)).length;
}

/**
 * Sentences in a run of text. Ends at ".", "!", "?" or the Bangla danda "।" followed by a space or
 * the end. A decimal point ("1.5") does not end a sentence because no space follows it.
 */
export function splitSentences(text: string): string[] {
  return plainText(text)
    .split(/(?<=[.!?।])\s+/u)
    .map((s) => s.trim())
    .filter((s) => WORDISH.test(s));
}

export type SectionMeasure = {
  heading: string;
  /** Words in the heading and everything under it. */
  words: number;
  /** One entry per bullet list: how many bullets it has. */
  lists: number[];
  /** Words in each bullet. */
  bulletWords: number[];
};

export type ModuleMeasure = {
  words: number;
  /** Words before the first heading (the hand-written modules open with one short paragraph). */
  introWords: number;
  sections: SectionMeasure[];
  /** Word count of every sentence in paragraphs and bullets (headings excluded). */
  sentenceWords: number[];
  headingWords: number[];
};

/** Measures a module body written in the learn Markdown subset. */
export function measureMarkdown(md: string): ModuleMeasure {
  const sections: SectionMeasure[] = [];
  const sentenceWords: number[] = [];
  let introWords = 0;
  let current: SectionMeasure | null = null;
  let inList = false;

  for (const raw of md.trim().split("\n")) {
    const line = raw.trim();
    if (!line) {
      inList = false;
      continue;
    }
    if (line.startsWith("## ")) {
      current = { heading: line.slice(3), words: countWords(line), lists: [], bulletWords: [] };
      sections.push(current);
      inList = false;
      continue;
    }
    const words = countWords(line);
    for (const s of splitSentences(line)) sentenceWords.push(countWords(s));
    if (!current) {
      introWords += words;
      continue;
    }
    current.words += words;
    if (line.startsWith("- ")) {
      if (!inList) current.lists.push(0);
      current.lists[current.lists.length - 1]! += 1;
      current.bulletWords.push(words);
      inList = true;
    } else {
      inList = false;
    }
  }

  return {
    words: introWords + sections.reduce((n, s) => n + s.words, 0),
    introWords,
    sections,
    sentenceWords,
    headingWords: sections.map((s) => countWords(s.heading)),
  };
}

/** The headings the hand-written modules use for their closing "try it" section. */
export const TRY_IT_HEADING = { en: "Try it", bn: "নিজে করে দেখুন" } as const;

export type LearnLanguage = "bn" | "en";

/**
 * Hard limits for a module, each the largest value found in the eight hand-written modules (the
 * measurements are in docs/pitch/learn-style-spec.md). A generated module over any of them is
 * rejected and retried once, never cut short.
 *
 * Counted on the module body as rendered: the sections plus the closing "Try it" section, the same
 * way the hand-written bodies are counted. `sectionWords` is a heading and everything under it;
 * `sentenceWords` one sentence in a paragraph or bullet; `bulletWords` one bullet. Bangla uses
 * fewer, longer words than English, so each language has its own figures.
 */
export const LEARN_STYLE_LIMITS = {
  en: {
    moduleWords: 131,
    sectionWords: 41,
    tryWords: 24,
    sentenceWords: 19,
    bulletWords: 15,
    headingWords: 5,
    titleChars: 31,
    summaryWords: 14,
  },
  bn: {
    moduleWords: 120,
    sectionWords: 36,
    tryWords: 22,
    sentenceWords: 19,
    bulletWords: 13,
    headingWords: 5,
    titleChars: 26,
    summaryWords: 12,
  },
} as const satisfies Record<LearnLanguage, Record<string, number>>;

/** Counts that are the same in both languages (the hand-written modules are translations). */
export const LEARN_SHAPE_LIMITS = {
  /** Sections before "Try it": the hand-written modules have 2 to 4. */
  minSections: 2,
  maxSections: 4,
  /** A bullet list has 2 to 4 items, and a section has at most one list. */
  minBullets: 2,
  maxBullets: 4,
  maxListsPerSection: 1,
} as const;

/**
 * Words per minute behind the "N min read" label, so the label comes from code and not the model.
 * The hand-written labels (3 and 4 minutes) were set by hand and no single rate reproduces all
 * eight: 42 words a minute matches 6 of the 8 English labels and 36 matches 7 of the 8 Bangla ones,
 * the best any rate does (learn-style-spec.md lists the misses).
 */
export const READ_WORDS_PER_MINUTE = { en: 42, bn: 36 } as const;

export function readingMinutes(words: number, language: LearnLanguage): number {
  return Math.max(1, Math.ceil(words / READ_WORDS_PER_MINUTE[language]));
}

export type StyleIssue =
  | {
      code: "too_long";
      what: "module" | "section" | "try" | "heading" | "title" | "summary";
      words: number;
      max: number;
    }
  | { code: "sentence_too_long"; words: number; max: number }
  | { code: "bullet_too_long"; words: number; max: number }
  | { code: "section_count"; count: number }
  | { code: "list_size"; count: number }
  | { code: "too_many_lists"; count: number };

/**
 * Checks a module body (Markdown subset) and its title and summary against the limits above.
 * The body's last section must be the "Try it" section, as in every hand-written module.
 */
export function checkStyle(
  body: string,
  title: string,
  summary: string,
  language: LearnLanguage,
): StyleIssue[] {
  const L = LEARN_STYLE_LIMITS[language];
  const S = LEARN_SHAPE_LIMITS;
  const m = measureMarkdown(body);
  const issues: StyleIssue[] = [];
  const over = (
    what: Extract<StyleIssue, { code: "too_long" }>["what"],
    words: number,
    max: number,
  ) => {
    if (words > max) issues.push({ code: "too_long", what, words, max });
  };

  over("module", m.words, L.moduleWords);
  over("title", [...title].length, L.titleChars);
  over("summary", countWords(summary), L.summaryWords);

  const tryHeading = TRY_IT_HEADING[language];
  const content = m.sections.filter((s) => s.heading !== tryHeading);
  const tryIt = m.sections.find((s) => s.heading === tryHeading);
  if (content.length < S.minSections || content.length > S.maxSections) {
    issues.push({ code: "section_count", count: content.length });
  }
  for (const s of content) over("section", s.words, L.sectionWords);
  if (tryIt) over("try", tryIt.words, L.tryWords);
  for (const w of m.headingWords) over("heading", w, L.headingWords);

  for (const s of m.sections) {
    if (s.lists.length > S.maxListsPerSection) {
      issues.push({ code: "too_many_lists", count: s.lists.length });
    }
    for (const n of s.lists) {
      if (n < S.minBullets || n > S.maxBullets) issues.push({ code: "list_size", count: n });
    }
    for (const w of s.bulletWords) {
      if (w > L.bulletWords) issues.push({ code: "bullet_too_long", words: w, max: L.bulletWords });
    }
  }
  for (const w of m.sentenceWords) {
    if (w > L.sentenceWords)
      issues.push({ code: "sentence_too_long", words: w, max: L.sentenceWords });
  }
  return issues;
}
