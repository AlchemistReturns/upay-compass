import { VOICE_MAX_BYTES, VOICE_MIN_BYTES } from "@compass/shared";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { auditVoice, guardVoice } from "../_shared/voice.ts";

const DEFAULT_MODEL = "gpt-4o-transcribe";
const TIMEOUT_MS = 30_000;
const MAX_HINTS = 12;

/** Merchant names to help the transcriber spell the person's own places; kept short and plain. */
function cleanHints(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.replace(/[^\p{L}\p{N} .'&-]/gu, "").trim())
      .filter((x) => x.length >= 2 && x.length <= 40)
      .slice(0, MAX_HINTS);
  } catch {
    return [];
  }
}

/**
 * Turns a short voice recording into text with OpenAI, so voice works in every browser (the
 * browser's own speech recognition is missing in Firefox and blocked in Brave). The caller must
 * have agreed to send their voice. The recording is forwarded and forgotten: nothing is stored
 * except an audit entry with the size and language, never the audio or the words.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const blocked = await guardVoice(client, user.id, "voice_transcribe");
  if (blocked) return blocked;

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "unavailable" }, 503);

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) return json({ error: "invalid_body" }, 400);
  if (audio.size < VOICE_MIN_BYTES) return json({ error: "too_short" }, 400);
  if (audio.size > VOICE_MAX_BYTES) return json({ error: "too_long" }, 413);
  if (audio.type && !audio.type.startsWith("audio/") && !audio.type.startsWith("video/")) {
    // browsers sometimes label a webm recording video/webm; anything else is not a recording
    return json({ error: "invalid_body" }, 400);
  }

  const language =
    form?.get("language") === "bn" ? "bn" : form?.get("language") === "en" ? "en" : null;
  const hints = cleanHints(form?.get("hints") ?? null);

  const body = new FormData();
  body.append("file", audio, audio.name || "voice.webm");
  body.append("model", Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_MODEL);
  body.append("response_format", "json");
  if (language) body.append("language", language);
  // Digits keep amounts checkable; the names help it spell the person's own shops.
  const spoken =
    language === "en"
      ? "Mobile wallet payments, in English."
      : language === "bn"
        ? "Mobile wallet payments, in Bangla (shop and app names may be in English)."
        : "Mobile wallet payments, in Bangla or English.";
  const prompt = [
    `${spoken} Write all numbers as digits.`,
    hints.length > 0 ? `Names that may be spoken: ${hints.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  body.append("prompt", prompt);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });
    clearTimeout(timer);
    await auditVoice(client, user.id, "voice_transcribe", {
      bytes: audio.size,
      language,
      ok: res.ok,
    });
    if (!res.ok) return json({ error: "transcription_failed" }, 502);

    const payload = await res.json();
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    return json({ text });
  } catch {
    await auditVoice(client, user.id, "voice_transcribe", {
      bytes: audio.size,
      language,
      ok: false,
    });
    return json({ error: "transcription_failed" }, 502);
  }
});
