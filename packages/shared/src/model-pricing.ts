/**
 * Price list for the cost ESTIMATE on the System health page. It is an estimate, not a bill:
 * cached-input discounts, retries inside OpenAI and per-character text-to-speech (`tts-1`, which
 * reports no tokens) are not included, so the real invoice is the authority.
 *
 * Source: OpenAI model pages, https://developers.openai.com/api/docs/models/<model> (standard
 * tier, text), and https://developers.openai.com/api/docs/pricing for gpt-4o-transcribe.
 * Retrieved: 2026-10-04. Update the prices and the date together when OpenAI changes them.
 */
export const PRICING_RETRIEVED = "2026-10-04";

/** US dollars per one million tokens. */
export const PRICE_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o-transcribe": { input: 2.5, output: 10.0 },
};

export type ModelUsage = { model: string; tokens_in: number; tokens_out: number };

/** Exact name first, then the longest listed name it starts with ("gpt-5-mini-2025-08-07"). */
export function priceFor(model: string): { input: number; output: number } | null {
  const exact = PRICE_USD_PER_MILLION[model];
  if (exact) return exact;
  const match = Object.keys(PRICE_USD_PER_MILLION)
    .filter((name) => model.startsWith(`${name}-`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? (PRICE_USD_PER_MILLION[match] ?? null) : null;
}

/** Estimated dollars for the token counts given. Models with no listed price are named, not guessed. */
export function estimateCostUsd(usage: readonly ModelUsage[]): { usd: number; unpriced: string[] } {
  let usd = 0;
  const unpriced: string[] = [];
  for (const u of usage) {
    const price = priceFor(u.model);
    if (!price) {
      if (u.tokens_in + u.tokens_out > 0) unpriced.push(u.model);
      continue;
    }
    usd += (u.tokens_in * price.input + u.tokens_out * price.output) / 1_000_000;
  }
  return { usd, unpriced };
}
