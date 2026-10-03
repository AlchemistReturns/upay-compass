import { audioExtension, type SpeechLang } from "@compass/shared";
import { supabase } from "@/lib/supabase";

export type TranscribeFailure =
  "consent_required" | "rate_limited" | "unavailable" | "too_short" | "too_long" | "failed";

export class TranscribeError extends Error {
  constructor(readonly kind: TranscribeFailure) {
    super(kind);
  }
}

/** Sends a recording to the server, which transcribes it with OpenAI, and returns the text. */
export async function transcribeBlob(
  blob: Blob,
  lang: SpeechLang,
  hints: string[] = [],
): Promise<string> {
  const form = new FormData();
  form.append("audio", new File([blob], `voice.${audioExtension(blob.type)}`, { type: blob.type }));
  form.append("language", lang);
  if (hints.length > 0) form.append("hints", JSON.stringify(hints));

  const { data, error } = await supabase.functions.invoke("voice-transcribe", { body: form });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 403) throw new TranscribeError("consent_required");
    if (status === 429) throw new TranscribeError("rate_limited");
    if (status === 503) throw new TranscribeError("unavailable");
    if (status === 413) throw new TranscribeError("too_long");
    if (status === 400) throw new TranscribeError("too_short");
    throw new TranscribeError("failed");
  }
  const text = (data as { text?: string } | null)?.text;
  return typeof text === "string" ? text.trim() : "";
}
