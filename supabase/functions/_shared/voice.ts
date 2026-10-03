import type { SupabaseClient } from "@supabase/supabase-js";
import { VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MINUTES } from "@compass/shared";
import { json } from "./http.ts";
import { takeSlot } from "./limits.ts";

/**
 * What every voice function checks before it touches OpenAI: the person agreed to send their voice
 * (`voice_consent_at`), and they are not over the rate limit (a slot is taken before the call). Returns a Response to send back when
 * either check fails, or null to carry on. `client` acts as the caller, so row level security
 * applies: they can only read their own profile and audit rows.
 */
export async function guardVoice(
  client: SupabaseClient,
  userId: string,
  action: "voice_transcribe" | "voice_command" | "voice_speak",
): Promise<Response | null> {
  const { data: profile } = await client
    .from("profiles")
    .select("voice_consent_at")
    .eq("id", userId)
    .single();
  if (!profile?.voice_consent_at) return json({ error: "consent_required" }, 403);

  // one shared limit across the three voice functions, taken before the call
  if (!(await takeSlot(userId, "voice_slot", VOICE_RATE_LIMIT, VOICE_RATE_WINDOW_MINUTES))) {
    return json({ error: "rate_limited", retry_after_minutes: VOICE_RATE_WINDOW_MINUTES }, 429);
  }
  return null;
}

/** One audit entry per call: what kind, how big, which language. Never the audio or the words. */
export async function auditVoice(
  client: SupabaseClient,
  userId: string,
  action: "voice_transcribe" | "voice_command" | "voice_speak",
  detail: Record<string, unknown>,
) {
  await client.from("audit_log").insert({ user_id: userId, action, entity: "voice", detail });
}
