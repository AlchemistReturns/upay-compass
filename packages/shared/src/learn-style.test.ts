import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEARN_SLUGS } from "./learn";
import { parseLearnContentSql } from "./learn-content";
import {
  LEARN_STYLE_LIMITS,
  checkStyle,
  countWords,
  measureMarkdown,
  readingMinutes,
  splitSentences,
} from "./learn-style";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261003090100_phase5_learn_content.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const modules = parseLearnContentSql(sql);
const LANGS = ["en", "bn"] as const;

describe("measuring text", () => {
  it("counts words in both scripts, ignoring Markdown marks and lone punctuation", () => {
    expect(countWords("## Three steps")).toBe(2);
    expect(countWords("- **Know what comes in.** Add up your income — monthly.")).toBe(9);
    expect(countWords("সপ্তাহে ৫০ টাকাও অভ্যাস তৈরি করে।")).toBe(6);
    expect(countWords("Even ৳50 a week")).toBe(4);
  });

  it("splits sentences at . ! ? and the Bangla danda, not at a decimal point", () => {
    expect(splitSentences("One. Two? Three!")).toEqual(["One.", "Two?", "Three!"]);
    expect(splitSentences("প্রথম বাক্য। দ্বিতীয় বাক্য।")).toEqual([
      "প্রথম বাক্য।",
      "দ্বিতীয় বাক্য।",
    ]);
    expect(splitSentences("It is 1.5 times more. Done.")).toHaveLength(2);
  });

  it("measures sections, lists and bullets", () => {
    const m = measureMarkdown(
      "Intro line.\n\n## Steps\n\n- one two\n- three\n\n## Try it\n\nDo it.",
    );
    expect(m.introWords).toBe(2);
    expect(m.sections.map((s) => s.heading)).toEqual(["Steps", "Try it"]);
    expect(m.sections[0]).toMatchObject({ words: 4, lists: [2], bulletWords: [2, 1] });
    expect(m.words).toBe(10);
  });
});

describe("the hand-written modules set the limits", () => {
  it("finds all eight modules in the migration", () => {
    expect(modules.map((m) => m.slug)).toEqual([...LEARN_SLUGS]);
  });

  for (const lang of LANGS) {
    it(`every ${lang} module passes the style limits (they are not stricter than the course)`, () => {
      for (const m of modules) {
        // the opening paragraph is part of the body, as it would be for any module
        expect(checkStyle(m.body[lang], m.title[lang], m.summary[lang], lang), m.slug).toEqual([]);
      }
    });

    it(`each ${lang} limit is reached by at least one module (they are not looser either)`, () => {
      const L = LEARN_STYLE_LIMITS[lang];
      const ms = modules.map((m) => measureMarkdown(m.body[lang]));
      const tryHeading = lang === "en" ? "Try it" : "নিজে করে দেখুন";
      const content = ms.flatMap((m) => m.sections.filter((s) => s.heading !== tryHeading));
      const tries = ms.flatMap((m) => m.sections.filter((s) => s.heading === tryHeading));
      const max = (xs: number[]) => Math.max(...xs);
      expect(max(ms.map((m) => m.words))).toBe(L.moduleWords);
      expect(max(content.map((s) => s.words))).toBe(L.sectionWords);
      expect(max(tries.map((s) => s.words))).toBe(L.tryWords);
      expect(max(ms.flatMap((m) => m.sentenceWords))).toBe(L.sentenceWords);
      expect(max(ms.flatMap((m) => m.sections.flatMap((s) => s.bulletWords)))).toBe(L.bulletWords);
      expect(max(ms.flatMap((m) => m.headingWords))).toBe(L.headingWords);
      expect(max(modules.map((m) => [...m.title[lang]].length))).toBe(L.titleChars);
      expect(max(modules.map((m) => countWords(m.summary[lang])))).toBe(L.summaryWords);
    });
  }

  it("the reading-time rates match 6 of 8 English and 7 of 8 Bangla hand-set labels", () => {
    const matches = (lang: "en" | "bn") =>
      modules.filter((m) => readingMinutes(measureMarkdown(m.body[lang]).words, lang) === m.minutes)
        .length;
    expect(matches("en")).toBe(6);
    expect(matches("bn")).toBe(7);
  });

  it("rejects a module over a limit and says which one", () => {
    const long = Array.from({ length: 25 }, () => "word").join(" ") + ".";
    const body = `## One\n\n${long}\n\n## Two\n\nShort.\n\n## Try it\n\nDo it.`;
    expect(checkStyle(body, "Title", "Summary.", "en")).toContainEqual({
      code: "sentence_too_long",
      words: 25,
      max: 19,
    });
    expect(checkStyle("## Only\n\nOne.\n\n## Try it\n\nGo.", "T", "S.", "en")).toContainEqual({
      code: "section_count",
      count: 1,
    });
    const fiveBullets = "## A\n\n- a\n- b\n- c\n- d\n- e\n\n## B\n\nx.\n\n## Try it\n\ny.";
    expect(checkStyle(fiveBullets, "T", "S.", "en")).toContainEqual({
      code: "list_size",
      count: 5,
    });
  });
});
