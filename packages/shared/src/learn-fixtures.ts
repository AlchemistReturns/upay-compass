/**
 * Recorded model answers for tests and evaluation scripts: the exact JSON text a model returns,
 * so tests run the real parser and validator without calling OpenAI. Good answers are written to
 * the style spec; bad ones each break one rule. Not exported from the package index.
 *
 * These were written by hand to the prompt, not recorded from a live model: live output quality
 * (especially Bangla) still needs checking against the deployed function.
 */
import type { GeneratedModule } from "./learn-module.ts";
import type { ModuleFacts } from "./learn-topics.ts";

export const BUFFER_FACTS: ModuleFacts = {
  buffer_days: 18,
  buffer_target_days: 90,
  safety_buffer_days: 7,
  low_balance_days: 3,
};

export const GOOD_BUFFER_EN: GeneratedModule = {
  title: "Your buffer, counted in days",
  summary: "Counting your buffer in days shows how long it would carry you.",
  sections: [
    {
      heading: "What a buffer is for",
      paragraph:
        "A buffer is money kept for surprises: a doctor's bill, a broken phone, or a week without income.",
      bullets: [],
    },
    {
      heading: "Where you are now",
      paragraph:
        "Your balance would cover about **18 days** of essential spending. Compass gives full marks at 90 days.",
      bullets: [],
    },
    {
      heading: "Grow it slowly",
      paragraph: "A first step is the 7-day safety buffer. After that, aim for one month.",
      bullets: ["Move a small amount when income arrives.", "Keep it in a separate goal."],
    },
  ],
  try_this: {
    text: "Create a goal called Emergency buffer and add a small amount today.",
    route: "goals",
  },
  quick_check: [
    {
      question: "What is an emergency buffer for?",
      options: ["Surprise costs", "Holiday shopping", "Paying off a phone"],
      answer: 0,
      explanation: "A buffer is kept for costs you did not plan for.",
    },
    {
      question: "How many days of essentials does your balance cover now?",
      options: ["About 7 days", "About 18 days", "About 90 days"],
      answer: 1,
      explanation: "Your balance covers about 18 days of essential spending.",
    },
  ],
};

export const GOOD_BUFFER_BN: GeneratedModule = {
  title: "তহবিল কত দিনের?",
  summary: "দিন গুনে দেখলে বোঝা যায় তহবিল কত দিন চলবে।",
  sections: [
    {
      heading: "তহবিল কিসের জন্য",
      paragraph:
        "জরুরি তহবিল হলো হঠাৎ খরচের জন্য রাখা টাকা: চিকিৎসা, নষ্ট ফোন, বা আয় ছাড়া একটি সপ্তাহ।",
      bullets: [],
    },
    {
      heading: "এখন আপনি কোথায়",
      paragraph:
        "আপনার ব্যালেন্সে প্রায় **১৮ দিনের** প্রয়োজনীয় খরচ চলবে। Compass পুরো নম্বর দেয় ৯০ দিনে।",
      bullets: [],
    },
    {
      heading: "ধীরে ধীরে বাড়ান",
      paragraph: "প্রথম ধাপ হলো ৭ দিনের নিরাপদ সীমা। তারপর এক মাসের লক্ষ্য রাখুন।",
      bullets: ["আয় এলে অল্প কিছু টাকা সরিয়ে রাখুন।", "টাকাটা আলাদা একটি লক্ষ্যে রাখুন।"],
    },
  ],
  try_this: {
    text: '"জরুরি তহবিল" নামে একটি লক্ষ্য খুলে আজই অল্প টাকা যোগ করুন।',
    route: "goals",
  },
  quick_check: [
    {
      question: "জরুরি তহবিল কিসের জন্য?",
      options: ["হঠাৎ খরচের জন্য", "ছুটির কেনাকাটার জন্য", "নতুন ফোনের কিস্তির জন্য"],
      answer: 0,
      explanation: "জরুরি তহবিল রাখা হয় অপ্রত্যাশিত খরচের জন্য।",
    },
    {
      question: "আপনার ব্যালেন্সে এখন প্রায় কত দিনের খরচ চলবে?",
      options: ["প্রায় ৭ দিন", "প্রায় ১৮ দিন", "প্রায় ৯০ দিন"],
      answer: 1,
      explanation: "আপনার ব্যালেন্সে প্রায় ১৮ দিনের প্রয়োজনীয় খরচ চলবে।",
    },
  ],
};

export const INVESTING_FACTS: ModuleFacts = { health_score: 82, buffer_days: 75 };

/** Concept-level only: no product, no advice to invest, no return figures. */
export const GOOD_INVESTING_EN: GeneratedModule = {
  title: "Before you put money anywhere",
  summary: "Investing is different from saving, and every gain comes with a risk.",
  sections: [
    {
      heading: "Saving and investing differ",
      paragraph:
        "Saving keeps money safe and ready to use. Investing puts money where it may grow, or shrink.",
      bullets: [],
    },
    {
      heading: "Risk and gain go together",
      paragraph:
        "A chance of a bigger gain always comes with a bigger chance of loss. An offer that says you cannot lose is a warning sign.",
      bullets: [],
    },
    {
      heading: "Questions to ask first",
      paragraph: "Your score is 82 and your buffer covers about 75 days.",
      bullets: [
        "Who holds the money, and is it licensed?",
        "Can I get it back quickly if I need it?",
        "Do I understand how it could lose value?",
      ],
    },
  ],
  try_this: { text: "Open your score and see which part is strongest.", route: "score" },
  quick_check: [
    {
      question: "What usually comes with a chance of bigger gain?",
      options: ["A bigger chance of loss", "Less chance of loss", "Nothing extra"],
      answer: 0,
      explanation: "Higher possible gain always comes with higher risk.",
    },
    {
      question: "An offer says you cannot lose money. What is it?",
      options: ["A warning sign", "A safe choice", "A normal offer"],
      answer: 0,
      explanation: "No honest offer can promise that you will never lose.",
    },
  ],
};

/** The JSON text a model would send for a module. */
export const asReply = (m: unknown) => JSON.stringify(m);

/** A copy of a module with one paragraph replaced. */
export function withParagraph(
  m: GeneratedModule,
  index: number,
  paragraph: string,
): GeneratedModule {
  return {
    ...m,
    sections: m.sections.map((s, i) => (i === index ? { ...s, paragraph } : s)),
  };
}

/**
 * Deliberately bad answers, each with the rejection it must earn. Used by the validator tests, the
 * generator tests and the evaluation script.
 */
export const BAD_FIXTURES: {
  name: string;
  topic: "buffer_in_days" | "beyond_basics";
  language: "en" | "bn";
  reply: string;
  expect: string;
}[] = [
  {
    name: "ungrounded number (a sum of two facts)",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply(
      withParagraph(
        GOOD_BUFFER_EN,
        1,
        "Your balance covers 18 days. You need 72 more days to reach full marks.",
      ),
    ),
    expect: "ungrounded_number",
  },
  {
    name: "ungrounded Bangla-digit number",
    topic: "buffer_in_days",
    language: "bn",
    reply: asReply(
      withParagraph(GOOD_BUFFER_BN, 1, "আপনার ব্যালেন্সে প্রায় ২০ দিনের প্রয়োজনীয় খরচ চলবে।"),
    ),
    expect: "ungrounded_number",
  },
  {
    name: "product name",
    topic: "beyond_basics",
    language: "en",
    reply: asReply(
      withParagraph(GOOD_INVESTING_EN, 0, "Some people keep savings in Bitcoin to make it grow."),
    ),
    expect: "product_name",
  },
  {
    name: "guarantee language with a return percentage",
    topic: "beyond_basics",
    language: "en",
    reply: asReply(
      withParagraph(
        GOOD_INVESTING_EN,
        1,
        "Some funds offer guaranteed returns, so your money is safe there.",
      ),
    ),
    expect: "guarantee",
  },
  {
    name: "advice to invest",
    topic: "beyond_basics",
    language: "en",
    reply: asReply(
      withParagraph(
        GOOD_INVESTING_EN,
        2,
        "Your score is 82, so you should invest some of your buffer now.",
      ),
    ),
    expect: "advice",
  },
  {
    name: "Bangla advice to invest",
    topic: "buffer_in_days",
    language: "bn",
    reply: asReply(withParagraph(GOOD_BUFFER_BN, 2, "তহবিল বড় হলে শেয়ারে বিনিয়োগ করুন।")),
    expect: "advice",
  },
  {
    name: "wrong language (English text when Bangla was asked)",
    topic: "buffer_in_days",
    language: "bn",
    reply: asReply(GOOD_BUFFER_EN),
    expect: "wrong_language",
  },
  {
    name: "too long (a rambling section)",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply(
      withParagraph(
        GOOD_BUFFER_EN,
        0,
        "A buffer is money kept for surprises. It helps with a doctor's bill. It helps with a broken phone. It helps in a week without income. It helps when a bill comes early. It helps when work is slow.",
      ),
    ),
    expect: "style",
  },
  {
    name: "markdown outside the subset (a link and an emoji)",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply(
      withParagraph(GOOD_BUFFER_EN, 0, "A buffer keeps you calm 😊 [read more](/learn)."),
    ),
    expect: "format",
  },
  {
    name: "shaming",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply(
      withParagraph(GOOD_BUFFER_EN, 0, "Spending it all was careless, and a buffer fixes that."),
    ),
    expect: "shaming",
  },
  {
    name: "mentions the facts",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply(withParagraph(GOOD_BUFFER_EN, 1, "Your buffer_days value is 18 in the facts.")),
    expect: "internals",
  },
  {
    name: "wrong Try-this route",
    topic: "buffer_in_days",
    language: "en",
    reply: asReply({ ...GOOD_BUFFER_EN, try_this: { text: "Open budgets.", route: "budgets" } }),
    expect: "wrong_route",
  },
  {
    name: "not JSON",
    topic: "buffer_in_days",
    language: "en",
    reply: "Here is your lesson: Buffers matter.",
    expect: "invalid_json",
  },
];
