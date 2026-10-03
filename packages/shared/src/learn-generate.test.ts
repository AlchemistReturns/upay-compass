import { describe, expect, it } from "vitest";
import {
  BAD_FIXTURES,
  BUFFER_FACTS,
  GOOD_BUFFER_BN,
  GOOD_BUFFER_EN,
  GOOD_INVESTING_EN,
  INVESTING_FACTS,
  asReply,
} from "./learn-fixtures";
import {
  FACT_DESCRIPTIONS,
  generateLearnModule,
  learnMaxCompletionTokens,
  learnSystemPrompt,
  learnUserPrompt,
  type LearnChatMessage,
  type LearnModelClient,
} from "./learn-generate";
import { LEARN_TOPICS, topicById } from "./learn-topics";

const buffer = topicById("buffer_in_days")!;
const investing = topicById("beyond_basics")!;

/** A fake model: answers from a script, and records what it was asked. */
function fakeClient(replies: (string | null)[]) {
  const calls: LearnChatMessage[][] = [];
  const client: LearnModelClient = async ({ messages }) => {
    calls.push(messages.map((m) => ({ ...m })));
    return replies.length ? replies.shift()! : null;
  };
  return { client, calls };
}

describe("generateLearnModule with a fake model", () => {
  it("accepts a good first answer and stores it with a computed reading time", async () => {
    const { client, calls } = fakeClient([asReply(GOOD_BUFFER_EN)]);
    const r = await generateLearnModule(buffer, BUFFER_FACTS, "en", client);
    expect(r).toMatchObject({ ok: true, attempts: 1 });
    expect(r.ok && r.content).toMatchObject({ title: GOOD_BUFFER_EN.title, minutes: 3, v: 1 });
    expect(calls).toHaveLength(1);
  });

  it("retries once with the reasons, and accepts a fixed second answer", async () => {
    const bad = BAD_FIXTURES.find((f) => f.expect === "ungrounded_number" && f.language === "en")!;
    const { client, calls } = fakeClient([bad.reply, asReply(GOOD_BUFFER_EN)]);
    const r = await generateLearnModule(buffer, BUFFER_FACTS, "en", client);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const retry = calls[1]!;
    expect(retry.at(-2)).toEqual({ role: "assistant", content: bad.reply });
    expect(retry.at(-1)!.content).toContain("uses the number 72, which is not in the facts");
  });

  it("gives up after two rejected answers and returns the reasons, never the text", async () => {
    const product = BAD_FIXTURES.find((f) => f.expect === "product_name")!;
    const { client, calls } = fakeClient([
      product.reply,
      product.reply,
      asReply(GOOD_INVESTING_EN),
    ]);
    const r = await generateLearnModule(investing, INVESTING_FACTS, "en", client);
    expect(r).toMatchObject({ ok: false, unavailable: false, attempts: 2 });
    expect(!r.ok && r.reasons.map((x) => x.code)).toContain("product_name");
    expect(calls).toHaveLength(2); // exactly one retry
  });

  it("treats text that is not JSON as a rejection and retries", async () => {
    const { client } = fakeClient(["Sure! Here is a lesson.", asReply(GOOD_BUFFER_BN)]);
    const r = await generateLearnModule(buffer, BUFFER_FACTS, "bn", client);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
  });

  it("reports the model as unavailable without retrying", async () => {
    const { client, calls } = fakeClient([null]);
    const r = await generateLearnModule(buffer, BUFFER_FACTS, "en", client);
    expect(r).toMatchObject({ ok: false, unavailable: true, attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("every recorded bad answer is rejected twice over, so nothing bad is ever returned", async () => {
    for (const f of BAD_FIXTURES) {
      const topic = topicById(f.topic)!;
      const facts = f.topic === "buffer_in_days" ? BUFFER_FACTS : INVESTING_FACTS;
      const { client } = fakeClient([f.reply, f.reply]);
      const r = await generateLearnModule(topic, facts, f.language, client);
      expect(r.ok, f.name).toBe(false);
    }
  });
});

describe("prompt", () => {
  it("sends only the topic, the language and the facts: no names, merchants or transactions", () => {
    const user = learnUserPrompt(buffer, BUFFER_FACTS, "en");
    expect(user).toContain("buffer_days = 18");
    expect(user).toContain("Route for try_this: goals");
    expect(user).not.toMatch(/phone|merchant|counterparty|\+880|01\d{9}/i);
    expect(learnUserPrompt(topicById("scam_safety")!, {}, "bn")).toContain(
      "(none: write without any numbers)",
    );
  });

  it("carries one style excerpt per language and the measured limits", () => {
    const en = learnSystemPrompt("en");
    expect(en).toContain("## Pay yourself first");
    expect(en).toContain("Each sentence at most 19 words");
    expect(en).toContain("at most 131 words");
    const bn = learnSystemPrompt("bn");
    expect(bn).toContain("## নিজেকে বেতন দিন");
    expect(bn).toContain("at most 120 words");
  });

  it("explains every fact key any topic can send", () => {
    for (const t of LEARN_TOPICS) {
      for (const k of t.factKeys) expect(FACT_DESCRIPTIONS[k], `${t.id}.${k}`).toBeTruthy();
    }
  });

  it("caps output tokens from the word limits, with room for a reasoning model to think", () => {
    expect(learnMaxCompletionTokens("en", false)).toBe(759);
    expect(learnMaxCompletionTokens("bn", false)).toBe(1386);
    expect(learnMaxCompletionTokens("en", true)).toBe(759 + 1024);
  });
});

describe("fixtures stay valid examples", () => {
  it("the good Bangla fixture is the Bangla counterpart of the English one", () => {
    expect(GOOD_BUFFER_BN.sections).toHaveLength(GOOD_BUFFER_EN.sections.length);
  });
});
