import { z } from "zod";
import { TRY_IT_HEADING, countWords, readingMinutes, type LearnLanguage } from "./learn-style.ts";
import { LEARN_ROUTES, type LearnRouteId } from "./learn-topics.ts";

/**
 * The shape of a generated "Made for you" module: what the model must return, and what is stored
 * once the validator has accepted it. The model returns plain-text fields; code assembles the
 * Markdown (headings, bullets, the "Try it" section) and computes the reading time.
 */

const ROUTE_IDS = Object.keys(LEARN_ROUTES) as [LearnRouteId, ...LearnRouteId[]];

/** Hard caps in characters, a backstop behind the word limits in learn-style.ts. */
const text = (max: number) => z.string().trim().min(1).max(max);

export const MAX_QUICK_OPTION_WORDS = 8;

export const quickCheckSchema = z
  .object({
    question: text(200),
    options: z.array(text(80)).min(2).max(4),
    /** Index of the correct option. */
    answer: z.number().int().min(0),
    explanation: text(200),
  })
  .refine((q) => q.answer < q.options.length, { message: "answer out of range", path: ["answer"] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, {
    message: "options repeat",
    path: ["options"],
  });

export const generatedModuleSchema = z
  .object({
    title: text(60),
    summary: text(160),
    sections: z
      .array(
        z
          .object({
            heading: text(50),
            paragraph: text(400),
            /** Empty, or 2 to 4 items. */
            bullets: z.array(text(150)).max(4),
          })
          .strict()
          .refine((s) => s.bullets.length !== 1, {
            message: "a list needs at least two bullets",
            path: ["bullets"],
          }),
      )
      .min(2)
      .max(4),
    try_this: z.object({ text: text(220), route: z.enum(ROUTE_IDS) }).strict(),
    quick_check: z.array(quickCheckSchema).min(2).max(3),
  })
  .strict();

export type GeneratedModule = z.infer<typeof generatedModuleSchema>;

/** The same shape as a JSON schema for OpenAI structured output (strict: every field required). */
export const GENERATED_MODULE_JSON_SCHEMA = {
  name: "learn_module",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "sections", "try_this", "quick_check"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "paragraph", "bullets"],
          properties: {
            heading: { type: "string" },
            paragraph: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
        },
      },
      try_this: {
        type: "object",
        additionalProperties: false,
        required: ["text", "route"],
        properties: { text: { type: "string" }, route: { type: "string", enum: ROUTE_IDS } },
      },
      quick_check: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "options", "answer", "explanation"],
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "integer" },
            explanation: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/**
 * The module body in the learn Markdown subset, assembled by code: each section as "## heading",
 * its paragraph and its bullets, then the "Try it" section, as in the hand-written modules.
 */
export function renderModuleMarkdown(m: GeneratedModule, language: LearnLanguage): string {
  const parts: string[] = [];
  for (const s of m.sections) {
    parts.push(`## ${s.heading}`, s.paragraph);
    if (s.bullets.length) parts.push(s.bullets.map((b) => `- ${b}`).join("\n"));
  }
  parts.push(`## ${TRY_IT_HEADING[language]}`, m.try_this.text);
  return parts.join("\n\n");
}

/** Reading time for the label, from the rendered body (never from the model). */
export function moduleMinutes(m: GeneratedModule, language: LearnLanguage): number {
  return readingMinutes(countWords(renderModuleMarkdown(m, language)), language);
}

/** What is stored in personalized_modules.content: the accepted output plus computed fields. */
export type StoredModuleContent = GeneratedModule & { minutes: number; v: 1 };

export function toStoredContent(m: GeneratedModule, language: LearnLanguage): StoredModuleContent {
  return { ...m, minutes: moduleMinutes(m, language), v: 1 };
}
