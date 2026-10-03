import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLearnContentSql } from "./learn-content";
import {
  BAD_FIXTURES,
  BUFFER_FACTS,
  GOOD_BUFFER_BN,
  GOOD_BUFFER_EN,
  GOOD_INVESTING_EN,
  INVESTING_FACTS,
  withParagraph,
} from "./learn-fixtures";
import { moduleMinutes, renderModuleMarkdown, type GeneratedModule } from "./learn-module";
import { measureMarkdown } from "./learn-style";
import { topicById } from "./learn-topics";
import {
  bannedMatch,
  extractNumbers,
  groundedNumbers,
  textProblems,
  validateGeneratedModule,
  type LearnRejection,
} from "./learn-validate";

const buffer = topicById("buffer_in_days")!;
const investing = topicById("beyond_basics")!;
const codes = (r: { ok: boolean; reasons?: LearnRejection[] }) =>
  r.ok ? [] : [...new Set(r.reasons!.map((x) => x.code))];

describe("good answers pass", () => {
  it("English and Bangla modules for the buffer topic, and the concept-level investing module", () => {
    expect(validateGeneratedModule(GOOD_BUFFER_EN, BUFFER_FACTS, buffer, "en")).toMatchObject({
      ok: true,
    });
    expect(validateGeneratedModule(GOOD_BUFFER_BN, BUFFER_FACTS, buffer, "bn")).toMatchObject({
      ok: true,
    });
    expect(
      validateGeneratedModule(GOOD_INVESTING_EN, INVESTING_FACTS, investing, "en"),
    ).toMatchObject({ ok: true });
  });

  it("renders to the learn Markdown subset with the Try it section last, and computes the reading time", () => {
    const md = renderModuleMarkdown(GOOD_BUFFER_EN, "en");
    expect(md.startsWith("## What a buffer is for\n\n")).toBe(true);
    expect(md).toContain(
      "\n\n- Move a small amount when income arrives.\n- Keep it in a separate goal.",
    );
    expect(
      md.endsWith(
        "## Try it\n\nCreate a goal called Emergency buffer and add a small amount today.",
      ),
    ).toBe(true);
    expect(renderModuleMarkdown(GOOD_BUFFER_BN, "bn")).toContain("## নিজে করে দেখুন");
    // 88 words at 42 a minute
    expect(measureMarkdown(md).words).toBe(88);
    expect(moduleMinutes(GOOD_BUFFER_EN, "en")).toBe(3);
  });
});

describe("recorded bad answers are rejected for the right reason", () => {
  for (const f of BAD_FIXTURES) {
    if (f.expect === "invalid_json") continue; // the generator handles unparsable text
    it(f.name, () => {
      const topic = topicById(f.topic)!;
      const facts = f.topic === "buffer_in_days" ? BUFFER_FACTS : INVESTING_FACTS;
      const r = validateGeneratedModule(JSON.parse(f.reply), facts, topic, f.language);
      expect(r.ok).toBe(false);
      expect(codes(r)).toContain(f.expect);
    });
  }
});

describe("schema", () => {
  const bad = (m: unknown) => validateGeneratedModule(m, BUFFER_FACTS, buffer, "en");
  it("rejects one section or five, a single bullet, an extra field and a missing one", () => {
    const one = { ...GOOD_BUFFER_EN, sections: GOOD_BUFFER_EN.sections.slice(0, 1) };
    const five = {
      ...GOOD_BUFFER_EN,
      sections: [...GOOD_BUFFER_EN.sections, ...GOOD_BUFFER_EN.sections.slice(0, 2)],
    };
    const lone = {
      ...GOOD_BUFFER_EN,
      sections: GOOD_BUFFER_EN.sections.map((s, i) =>
        i === 0 ? { ...s, bullets: ["Only one."] } : s,
      ),
    };
    const { quick_check: _q, ...missing } = GOOD_BUFFER_EN;
    for (const m of [one, five, lone, { ...GOOD_BUFFER_EN, minutes: 2 }, missing]) {
      expect(codes(bad(m))).toEqual(["schema"]);
    }
  });

  it("rejects a quick-check answer out of range, repeated options, and one question", () => {
    const q = GOOD_BUFFER_EN.quick_check[0]!;
    expect(codes(bad({ ...GOOD_BUFFER_EN, quick_check: [q, { ...q, answer: 3 }] }))).toEqual([
      "schema",
    ]);
    expect(
      codes(
        bad({ ...GOOD_BUFFER_EN, quick_check: [q, { ...q, options: ["Same", "same", "Other"] }] }),
      ),
    ).toEqual(["schema"]);
    expect(codes(bad({ ...GOOD_BUFFER_EN, quick_check: [q] }))).toEqual(["schema"]);
  });

  it("rejects a route that is not one of the app's screens, and a route of another topic", () => {
    expect(
      codes(bad({ ...GOOD_BUFFER_EN, try_this: { text: "Go.", route: "https://x.io" } })),
    ).toEqual(["schema"]);
    expect(
      codes(bad({ ...GOOD_BUFFER_EN, try_this: { text: "Open budgets.", route: "budgets" } })),
    ).toEqual(["wrong_route"]);
  });
});

describe("length and shape (limits from the hand-written modules)", () => {
  it("rejects a long sentence, a long title, and too-long quick-check parts, and does not truncate", () => {
    const longSentence = withParagraph(
      GOOD_BUFFER_EN,
      0,
      "A buffer is money that you keep aside for all the surprises that life brings, like a doctor's bill or a broken phone.",
    );
    const r = validateGeneratedModule(longSentence, BUFFER_FACTS, buffer, "en");
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.reasons).toContainEqual({
      code: "style",
      issue: { code: "sentence_too_long", words: 23, max: 19 },
    });

    const longTitle = { ...GOOD_BUFFER_EN, title: "Your emergency buffer, counted in days" };
    expect(validateGeneratedModule(longTitle, BUFFER_FACTS, buffer, "en")).toMatchObject({
      ok: false,
      reasons: [{ code: "style", issue: { code: "too_long", what: "title" } }],
    });

    const q = GOOD_BUFFER_EN.quick_check[0]!;
    const chatty = {
      ...GOOD_BUFFER_EN,
      quick_check: [
        { ...q, options: ["Costs you did not plan for at all this month", "B", "C"] },
        { ...q, explanation: "It is for surprises. It is not for shopping." },
      ],
    };
    const rc = validateGeneratedModule(chatty, BUFFER_FACTS, buffer, "en");
    expect(codes(rc)).toEqual(["quick_check_length", "explanation_sentences"]);
  });
});

describe("numbers must come from the facts", () => {
  it("reads numbers in Latin or Bangla digits, with commas, decimals or the taka sign", () => {
    expect(extractNumbers("৳1,500 and ১,৫০০ টাকা, 18 days, 2.5%, end 5, then")).toEqual([
      { raw: "1,500", value: 1500 },
      { raw: "১,৫০০", value: 1500 },
      { raw: "18", value: 18 },
      { raw: "2.5", value: 2.5 },
      { raw: "5", value: 5 },
    ]);
    expect(extractNumbers("১,০০০, রোজ")).toEqual([{ raw: "১,০০০", value: 1000 }]);
  });

  it("accepts a fact in any of its spellings", () => {
    const facts = { cash_out_total_30d: 6200, cash_outs_30d: 4 };
    const allowed = groundedNumbers(facts, "en");
    for (const t of ["৳6,200", "6200", "৬,২০০ টাকা", "4"]) {
      expect(
        extractNumbers(t).every((n) => allowed.has(n.value)),
        t,
      ).toBe(true);
    }
  });

  it("rejects a number the model worked out (a difference, a total, a rounding) or made up", () => {
    for (const paragraph of [
      "You need 72 more days to reach 90.", // 90 - 18
      "Together that is 25 days.", // 18 + 7
      "That is about 20 days.", // rounded
      "In 2026 many people saved.", // a year
    ]) {
      const r = validateGeneratedModule(
        withParagraph(GOOD_BUFFER_EN, 0, paragraph),
        BUFFER_FACTS,
        buffer,
        "en",
      );
      expect(codes(r), paragraph).toEqual(["ungrounded_number"]);
    }
  });
});

describe("each text rule, with examples that must and must not trip it", () => {
  const cases: {
    code: Parameters<typeof bannedMatch>[0];
    bad: string[];
    good: string[];
  }[] = [
    {
      code: "url",
      bad: ["See www.example.com for more.", "Go to https://x.io now.", "বিস্তারিত: help.gov.bd"],
      good: ["Open the forecast in Compass.", "পূর্বাভাস দেখুন।"],
    },
    {
      code: "phone_number",
      bad: ["Call 01712345678.", "Call +880 1712 345678.", "ফোন করুন ০১৭১২৩৪৫৬৭৮"],
      good: ["You cashed out 4 times.", "Your PIN is not 1234.", "১৮,০০০ টাকা জমেছে।"],
    },
    {
      code: "product_name",
      bad: [
        "Send it with bKash.",
        "Keep it in Prime Bank.",
        "Some buy Bitcoin.",
        "A DPS can help.",
        "বিকাশে টাকা রাখুন।",
        "অনেকে সঞ্চয়পত্র কেনেন।",
        "বিটকয়েনের দাম ওঠানামা করে।",
      ],
      good: [
        "Keep it in a separate goal.",
        "Ask the bank about the total cost.",
        "Invest time in learning, not money.",
        "নগদ টাকা তোলার খরচ আছে।",
        "ব্যাংকে টাকা রাখার আগে প্রশ্ন করুন।",
      ],
    },
    {
      code: "guarantee",
      bad: [
        "These funds are guaranteed.",
        "It is risk-free.",
        "You will earn more each month.",
        "It pays 12% a year.",
        "A return of 10% is common.",
        "এতে নিশ্চিত লাভ।",
        "এটা ঝুঁকিমুক্ত।",
        "মাসে ৫% মুনাফা পাবেন।",
      ],
      good: [
        "An offer that says you cannot lose is a warning sign.",
        "Higher possible gain comes with higher risk.",
        "Your savings rate is 12%.",
        "কোনো বিনিয়োগই ঝুঁকি ছাড়া নয়।",
      ],
    },
    {
      code: "advice",
      bad: [
        "You should invest your buffer.",
        "Buy gold before Eid.",
        "Take a loan to cover rent.",
        "We recommend this plan.",
        "Consider borrowing a little.",
        "শেয়ারে বিনিয়োগ করুন।",
        "দরকার হলে ঋণ নিন।",
        "সোনা কিনুন।",
      ],
      good: [
        "Before you take a loan, ask what it costs in total.",
        "Investing means money may grow or shrink.",
        "Borrowing always costs something.",
        "ঋণ নেওয়ার আগে মোট খরচ জেনে নিন।",
      ],
    },
    {
      code: "shaming",
      bad: [
        "That was careless.",
        "Lazy saving costs you.",
        "You wasted it.",
        "এটা বোকামি।",
        "আপনি বেহিসাবি।",
      ],
      good: ["Falling behind is normal.", "পিছিয়ে পড়া স্বাভাবিক।"],
    },
    {
      code: "internals",
      bad: [
        "The JSON says 18.",
        "Per the instructions, here is a lesson.",
        "Your buffer_days is low.",
        "Your bufferDays is low.",
        "Hello {{name}}.",
        "এই প্রম্পট অনুযায়ী লিখছি।",
      ],
      good: ["Your buffer covers 18 days.", "Compass shows your score.", "আপনার স্কোর দেখুন।"],
    },
  ];
  for (const c of cases) {
    it(`${c.code}: positives in English and Bangla trip it, negatives do not`, () => {
      for (const t of c.bad) expect(bannedMatch(c.code, t), t).not.toBeNull();
      for (const t of c.good) expect(bannedMatch(c.code, t), t).toBeNull();
    });
  }

  it("language: Bangla text needs Bangla letters and digits; English text has neither", () => {
    const lang = (t: string, l: "en" | "bn") =>
      textProblems("f", t, l, true).some((r) => r.code === "wrong_language");
    expect(lang("Your buffer covers 18 days.", "en")).toBe(false);
    expect(lang("It costs ৳50.", "en")).toBe(false); // the taka sign is fine in English
    expect(lang("Your buffer is ১৮ days.", "en")).toBe(true);
    expect(lang("আপনার তহবিল ভালো।", "en")).toBe(true);
    expect(lang("আপনার তহবিলে ১৮ দিন চলবে। Compass দেখুন।", "bn")).toBe(false);
    expect(lang("আপনার তহবিলে 18 দিন চলবে।", "bn")).toBe(true); // Latin digits
    expect(lang("Your buffer covers about eighteen days of costs.", "bn")).toBe(true);
    expect(lang("আপনার budget plan ঠিক করুন and check weekly.", "bn")).toBe(true);
    expect(lang("৭", "bn")).toBe(false); // a number alone is fine
  });

  it("format: only the subset the renderer supports", () => {
    const marks = (t: string, bold = true) =>
      textProblems("f", t, "en", bold)
        .filter((r) => r.code === "format")
        .map((r) => (r as { mark: string }).mark);
    expect(marks("Keep **one** habit.")).toEqual([]);
    expect(marks("Keep **one** habit.", false)).toEqual(["bold"]); // titles and headings: no bold
    expect(marks("## Heading")).toEqual(["heading"]);
    expect(marks("- a bullet")).toEqual(["list"]);
    expect(marks("1. first")).toEqual(["list"]);
    expect(marks("a | b")).toEqual(["table"]);
    expect(marks("see [this](x)")).toEqual(["link"]);
    expect(marks("<b>hi</b>")).toEqual(["html"]);
    expect(marks("use `code`")).toEqual(["code"]);
    expect(marks("good job 🎉")).toEqual(["emoji"]);
    expect(marks("*italic*")).toEqual(["asterisk"]);
    expect(marks("**open bold")).toEqual(["asterisk"]);
    expect(marks("two\nlines")).toEqual(["newline"]);
  });
});

describe("the eight hand-written modules pass every text rule", () => {
  const modules = parseLearnContentSql(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../../supabase/migrations/20261003090100_phase5_learn_content.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  );
  for (const lang of ["en", "bn"] as const) {
    it(`${lang}: format, language and banned patterns (so the rules do not misfire on house content)`, () => {
      for (const m of modules) {
        const lines = m.body[lang].split("\n").filter((l) => l.trim());
        const problems = [
          ...textProblems("title", m.title[lang], lang, false),
          ...textProblems("summary", m.summary[lang], lang, false),
          ...lines.flatMap((l) =>
            textProblems(l.slice(0, 30), l.trim().replace(/^(## |- )/, ""), lang, true),
          ),
        ];
        expect(problems, m.slug).toEqual([]);
      }
    });
  }
});

describe("golden: the investing topic never passes with a product name or a return promise", () => {
  const products = [
    "Bitcoin",
    "bKash savings",
    "a DPS",
    "Sanchayapatra",
    "Prime Bank deposits",
    "the Dhaka Stock Exchange",
  ];
  const promises = [
    "guaranteed growth",
    "a risk-free plan",
    "a fixed return",
    "an offer of 15% a year",
    "a plan that will double your money",
  ];
  const advice = [
    "you should invest your buffer",
    "it is a good time to invest",
    "we recommend shares",
  ];
  it.each([...products, ...promises, ...advice])("rejects a module mentioning %s", (phrase) => {
    const m: GeneratedModule = withParagraph(
      GOOD_INVESTING_EN,
      0,
      `Saving keeps money ready to use, and some people choose ${phrase}.`,
    );
    const r = validateGeneratedModule(m, INVESTING_FACTS, investing, "en");
    expect(r.ok).toBe(false);
    expect(
      codes(r).some((c) =>
        ["product_name", "guarantee", "advice", "ungrounded_number"].includes(c),
      ),
    ).toBe(true);
  });

  it("Bangla: rejects a product or a promised return in the investing topic", () => {
    for (const phrase of [
      "বিটকয়েন কিনে",
      "সঞ্চয়পত্রে রেখে",
      "নিশ্চিত লাভের জন্য",
      "শেয়ার কিনুন",
    ]) {
      const bn: GeneratedModule = {
        ...GOOD_BUFFER_BN,
        try_this: { ...GOOD_BUFFER_BN.try_this, route: "score" },
      };
      const m = withParagraph(bn, 0, `কেউ কেউ ${phrase} টাকা বাড়াতে চান।`);
      const r = validateGeneratedModule(
        m,
        { ...INVESTING_FACTS, buffer_days: 18, buffer_target_days: 90, safety_buffer_days: 7 },
        investing,
        "bn",
      );
      expect(r.ok, phrase).toBe(false);
    }
  });
});
