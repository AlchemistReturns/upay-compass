import { RAW_COMMAND_JSON_SCHEMA, voiceParsePrompt, type GoalRef } from "@compass/shared";
import { reasonFromError, type CallMeter } from "./monitor.ts";
import { openaiUrl } from "./openai.ts";

const DEFAULT_MODEL = "gpt-4.1-mini";
const TIMEOUT_MS = 20_000;
/** Asks the model for the command JSON. Returns the parsed object, or null on any failure. */
export async function parseVoiceCommand(
  text: string,
  today: string,
  goals: GoalRef[],
  meter?: CallMeter,
): Promise<unknown | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("OPENAI_VOICE_MODEL") || DEFAULT_MODEL;
  // reasoning models take no temperature and a different token field
  const reasoning = /^(gpt-5|o\d)/.test(model);
  meter?.model(model);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(openaiUrl("chat/completions"), {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...(reasoning ? { reasoning_effort: "minimal" } : { temperature: 0 }),
        response_format: { type: "json_schema", json_schema: RAW_COMMAND_JSON_SCHEMA },
        messages: [
          { role: "system", content: voiceParsePrompt(today, goals) },
          { role: "user", content: text },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      meter?.reason(`http_${res.status}`);
      return null;
    }
    const payload = await res.json();
    meter?.usage(payload?.usage);
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === "string" ? JSON.parse(content) : null;
  } catch (e) {
    meter?.reason(reasonFromError(e));
    return null;
  }
}
