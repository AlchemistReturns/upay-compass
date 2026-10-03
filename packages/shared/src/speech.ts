/**
 * Helpers for the coach's voice features. The browser does the speaking and the listening (Web
 * Speech API, no server involved); these pure functions decide which voice to use, turn an answer
 * into text that reads well aloud, and name recognition errors. Kept here so they can be tested
 * without a browser.
 */
export type SpeechLang = "bn" | "en";

/** The locale each app language asks the browser for. */
export const SPEECH_LOCALE: Record<SpeechLang, string> = { bn: "bn-BD", en: "en-US" };

/** The part of a browser voice we look at. */
export type VoiceLike = { lang: string; localService?: boolean };

const norm = (lang: string) => lang.replace("_", "-").toLowerCase();

/**
 * The best installed voice for a language, or null when there is none (then the listen button is
 * hidden instead of speaking in the wrong language). An exact locale beats another locale of the
 * same language (bn-IN for bn-BD, en-GB for en-US); on a tie a voice that runs on the device beats
 * an online one, and earlier voices beat later ones.
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: SpeechLang): T | null {
  const wanted = norm(SPEECH_LOCALE[lang]);
  const prefix = `${lang}-`;
  let best: { voice: T; rank: number } | null = null;
  for (const voice of voices) {
    const l = norm(voice.lang);
    let rank = l === wanted ? 0 : l === lang || l.startsWith(prefix) ? 2 : -1;
    if (rank < 0) continue;
    if (!voice.localService) rank += 1;
    if (!best || rank < best.rank) best = { voice, rank };
  }
  return best?.voice ?? null;
}

const MAX_CHUNK = 180;

/** Amounts are written with the taka sign, which most voices skip; say the word instead. */
function sayTaka(text: string, lang: SpeechLang): string {
  return text.replace(/৳\s?([\d০-৯](?:[\d০-৯,.]*[\d০-৯])?)/g, (_, n: string) =>
    lang === "bn" ? `${n} টাকা` : `${n} taka`,
  );
}

/**
 * An answer as short pieces of plain text for the voice: markdown marks removed, amounts spoken
 * as words, split at sentence ends and then at word boundaries, because some browsers stop
 * speaking a long passage part-way through.
 */
export function prepareSpeech(text: string, lang: SpeechLang): string[] {
  const plain = sayTaka(text, lang)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|[-*•]\s+)/gm, "")
    .replace(/`/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!plain) return [];

  const chunks: string[] = [];
  for (const sentence of plain.split(/(?<=[.!?।])\s+/)) {
    let rest = sentence.trim();
    while (rest.length > MAX_CHUNK) {
      const cut = rest.lastIndexOf(" ", MAX_CHUNK);
      const at = cut > 40 ? cut : MAX_CHUNK;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks;
}

export type RecognitionProblem =
  "denied" | "no_mic" | "no_speech" | "unsupported_language" | "network" | "other";

/** What the user should be told for a SpeechRecognition error code; null means say nothing. */
export function recognitionProblem(error: string): RecognitionProblem | null {
  switch (error) {
    case "aborted":
      return null; // we stopped it ourselves
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no_mic";
    case "no-speech":
      return "no_speech";
    case "language-not-supported":
      return "unsupported_language";
    case "network":
      return "network";
    default:
      return "other";
  }
}
