/**
 * Limits for voice recordings, shared by the app (which stops recording) and the Edge Function
 * (which refuses anything larger), so the two cannot drift apart.
 */
/** A spoken command or coach question is a sentence or two. */
export const VOICE_MAX_SECONDS = 30;
/** About 30 seconds of compressed speech is well under 1 MB; the cap leaves room for a poor encoder. */
export const VOICE_MAX_BYTES = 1_500_000;
/** Anything smaller than this is silence or a click. */
export const VOICE_MIN_BYTES = 1_000;
/** Recordings or speech requests per user in the window. */
export const VOICE_RATE_LIMIT = 60;
export const VOICE_RATE_WINDOW_MINUTES = 10;
/** Longest text read aloud by the server voice. */
export const VOICE_SPEAK_MAX_CHARS = 1_200;
export const VOICE_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/x-m4a",
] as const;
