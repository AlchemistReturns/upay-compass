import { CATEGORY_KEYS, isCategoryKey, type CategoryKey } from "@compass/shared";
import { reasonFromError, type CallMeter } from "./monitor.ts";
import { openaiUrl } from "./openai.ts";

export type AiItem = {
  /** Caller's key for this item; echoed back in the result map. */
  id: string;
  counterparty: string;
  note: string;
  channel: string;
  direction: string;
};

const BATCH_SIZE = 40;
const TIMEOUT_MS = 15_000;
const DEFAULT_MODEL = "gpt-4o-mini";

/** Phone numbers and other long digit runs never leave the server. */
export function redact(text: string): string {
  return text.replace(/\+?\d[\d\s-]{6,}\d/g, "[number]");
}

/**
 * Asks OpenAI to label merchants the keyword rules could not. The model only ever returns a category
 * key from the allowed list (validated here), and never computes any numbers. Returns only the items
 * it labelled; anything missing or invalid is left for the caller to mark as "other / needs review".
 * With no API key, or on any failure, it returns an empty map instead of throwing.
 */
export async function aiCategorize(
  items: AiItem[],
  meter?: CallMeter,
): Promise<Map<string, CategoryKey>> {
  const result = new Map<string, CategoryKey>();
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey || items.length === 0) return result;
  const model = Deno.env.get("OPENAI_CATEGORIZE_MODEL") || DEFAULT_MODEL;
  meter?.model(model);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const ids = new Set(batch.map((b) => b.id));
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(openaiUrl("chat/completions"), {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You label Bangladeshi mobile-wallet transactions with a spending category. " +
                `Allowed categories: ${CATEGORY_KEYS.join(", ")}. ` +
                "Reply with JSON only, in the form " +
                '{"results":[{"id":"<id>","category":"<category>"}]}. ' +
                'Use exactly the ids you were given. If you are not sure, use "other".',
            },
            {
              role: "user",
              content: JSON.stringify(
                batch.map((b) => ({
                  id: b.id,
                  counterparty: redact(b.counterparty),
                  note: redact(b.note),
                  channel: b.channel,
                  direction: b.direction,
                })),
              ),
            },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        meter?.reason(`http_${res.status}`);
        continue;
      }

      const payload = await res.json();
      meter?.usage(payload?.usage);
      const parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? "{}");
      for (const row of Array.isArray(parsed?.results) ? parsed.results : []) {
        if (ids.has(row?.id) && isCategoryKey(row?.category)) result.set(row.id, row.category);
        // the allow-list check refused this answer
        else if (ids.has(row?.id)) meter?.reason("check_invalid_category");
      }
    } catch (e) {
      meter?.reason(reasonFromError(e));
      // network error, timeout or malformed JSON: leave this batch unlabelled
    }
  }
  return result;
}
