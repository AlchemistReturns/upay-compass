import { z } from "zod";
import { VOICE_SPEAK_MAX_CHARS, prepareSpeech } from "@compass/shared";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { auditVoice, guardVoice } from "../_shared/voice.ts";
import { reasonFromError, startCall } from "../_shared/monitor.ts";
import { openaiUrl } from "../_shared/openai.ts";

const DEFAULT_MODEL = "tts-1";
const TIMEOUT_MS = 30_000;

const bodySchema = z.object({
  /** The coach answer to read. The text itself is never taken from the client. */
  message_id: z.string().uuid(),
  language: z.enum(["bn", "en"]),
});

/**
 * Reads a coach answer aloud with OpenAI text-to-speech, for devices that have no on-device voice
 * for the language (typically Bangla on a desktop). The app uses the free on-device voice first
 * and only calls this when there is none. The caller must have agreed to send their voice data.
 * The request names a stored coach answer, which is read as the caller (so only their own
 * assistant messages qualify); arbitrary text is never accepted, so this cannot be used as a
 * general text-to-speech service. Nothing is stored except an audit entry with length and language.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  // only an assistant message of the caller's own (row level security) can be read aloud
  const { data: message } = await client
    .from("coach_messages")
    .select("content,role")
    .eq("id", body.data.message_id)
    .maybeSingle();
  if (!message || message.role !== "assistant") return json({ error: "not_found" }, 404);

  const blocked = await guardVoice(client, user.id, "voice_speak");
  if (blocked) return blocked;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "unavailable" }, 503);

  // The taka sign and markdown marks are turned into words first, as for the on-device voice.
  const input = prepareSpeech(
    String(message.content).slice(0, VOICE_SPEAK_MAX_CHARS),
    body.data.language,
  ).join(" ");
  if (!input) return json({ error: "not_found" }, 404);

  const call = startCall("voice-speak", body.data.language);
  call.model(Deno.env.get("OPENAI_TTS_MODEL") || DEFAULT_MODEL);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(openaiUrl("audio/speech"), {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_TTS_MODEL") || DEFAULT_MODEL,
        voice: "nova",
        input,
        response_format: "mp3",
      }),
    });
    clearTimeout(timer);
    await auditVoice(client, user.id, "voice_speak", {
      chars: input.length,
      language: body.data.language,
      ok: res.ok,
    });
    if (!res.ok) call.reason(`http_${res.status}`);
    call.end(res.ok ? "ok" : "error");
    if (!res.ok) return json({ error: "speech_failed" }, 502);
    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    call.reason(reasonFromError(e));
    call.end("error");
    await auditVoice(client, user.id, "voice_speak", {
      chars: input.length,
      language: body.data.language,
      ok: false,
    });
    return json({ error: "speech_failed" }, 502);
  }
});
