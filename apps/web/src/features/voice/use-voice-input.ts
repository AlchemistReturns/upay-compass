"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecognitionProblem, SpeechLang } from "@compass/shared";
import { useSpeechRecognition } from "./use-speech-recognition";
import { useRecorder } from "./use-recorder";
import { TranscribeError, transcribeBlob, type TranscribeFailure } from "./transcribe";
import { useVoiceConsent } from "./use-voice-consent";
import { useVoiceHints } from "./use-voice-hints";

export type VoiceProblem = RecognitionProblem | TranscribeFailure;
export type VoiceState = "idle" | "listening" | "processing";

const ENGINE_KEY = "compass.voice.engine";

function readServerPreferred(): boolean {
  try {
    return sessionStorage.getItem(ENGINE_KEY) === "server";
  } catch {
    return false;
  }
}
function rememberServerPreferred() {
  try {
    sessionStorage.setItem(ENGINE_KEY, "server");
  } catch {
    // ignore
  }
}

/**
 * Speech in, text out, in any browser. The browser's own recognition is tried first (free, quick,
 * nothing leaves for our server); if it is missing, blocked (Brave) or fails, the app records the
 * clip itself and has the server transcribe it with OpenAI, after the person has agreed to that.
 * Once the browser engine has failed in a session, the server engine is used straight away.
 */
export function useVoiceInput({
  lang,
  onTranscript,
  onProblem,
}: {
  lang: SpeechLang;
  /** Words as they arrive; `final` is true for the settled text. */
  onTranscript: (text: string, final: boolean) => void;
  onProblem: (problem: VoiceProblem) => void;
}) {
  const [serverState, setServerState] = useState<"idle" | "listening" | "processing">("idle");
  const consent = useVoiceConsent();
  const hints = useVoiceHints();
  const handlers = useRef({ onTranscript, onProblem });
  useEffect(() => {
    handlers.current = { onTranscript, onProblem };
  });

  const recorder = useRecorder({ onProblem: (p) => handlers.current.onProblem(p) });
  const serverCanRun = recorder.supported;

  const startServer = useCallback(async () => {
    if (!serverCanRun) return;
    if (!(await consent.ensure())) return;
    if (await recorder.start()) setServerState("listening");
  }, [serverCanRun, consent, recorder]);

  const browser = useSpeechRecognition({
    lang,
    onTranscript: (text, final) => handlers.current.onTranscript(text, final),
    onProblem: (problem) => {
      // Blocked or failing browser engine: switch to recording, unless the problem is the
      // microphone itself (the same permission the recorder needs).
      const switchable =
        problem === "network" || problem === "unsupported_language" || problem === "other";
      if (switchable && serverCanRun) {
        rememberServerPreferred();
        void startServer();
      } else {
        handlers.current.onProblem(problem);
      }
    },
  });

  const supported = browser.supported || serverCanRun;
  const listening = browser.listening || serverState === "listening";
  const state: VoiceState =
    serverState === "processing" ? "processing" : listening ? "listening" : "idle";

  const start = useCallback(() => {
    if (state !== "idle") return;
    if (browser.supported && !readServerPreferred()) browser.start();
    else void startServer();
  }, [state, browser, startServer]);

  const stop = useCallback(async () => {
    if (browser.listening) {
      browser.stop();
      return;
    }
    if (serverState !== "listening") return;
    const clip = await recorder.stop();
    if (!clip) {
      setServerState("idle");
      return;
    }
    setServerState("processing");
    try {
      const text = await transcribeBlob(clip, lang, hints.data ?? []);
      if (text) handlers.current.onTranscript(text, true);
      else handlers.current.onProblem("no_speech");
    } catch (e) {
      handlers.current.onProblem(e instanceof TranscribeError ? e.kind : "failed");
    } finally {
      setServerState("idle");
    }
  }, [browser, serverState, recorder, lang, hints.data]);

  return { supported, state, listening, elapsed: recorder.elapsed, start, stop };
}
