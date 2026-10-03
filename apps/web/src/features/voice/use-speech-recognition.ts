"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  SPEECH_LOCALE,
  recognitionProblem,
  type RecognitionProblem,
  type SpeechLang,
} from "@compass/shared";

/**
 * Speak a question instead of typing it (browser speech recognition). Where it exists, Chrome and
 * Edge send the audio to the browser maker's speech service to turn it into text, so the screen
 * says so. English recognition is the reliable path; Bangla quality varies by browser and device.
 * The words land in the text box for the person to read and send; nothing is sent automatically.
 */
type RecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscription = () => () => {};

export function useSpeechRecognition({
  lang,
  onTranscript,
  onProblem,
}: {
  lang: SpeechLang;
  /** Called as the words come in (final is true for the settled result). */
  onTranscript: (text: string, final: boolean) => void;
  onProblem: (problem: RecognitionProblem) => void;
}) {
  const supported = useSyncExternalStore(
    noSubscription,
    () => ctor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const active = useRef<Recognition | null>(null);
  const handlers = useRef({ onTranscript, onProblem });
  useEffect(() => {
    handlers.current = { onTranscript, onProblem };
  });

  const stop = useCallback(() => {
    active.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = ctor();
    if (!Ctor || active.current) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LOCALE[lang];
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]!;
        text += r[0]?.transcript ?? "";
        if (r.isFinal) final = true;
      }
      handlers.current.onTranscript(text.trim(), final);
    };
    rec.onerror = (e) => {
      const problem = recognitionProblem(e.error);
      if (problem) handlers.current.onProblem(problem);
    };
    rec.onend = () => {
      active.current = null;
      setListening(false);
    };
    active.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      active.current = null;
      setListening(false);
      handlers.current.onProblem("other");
    }
  }, [lang]);

  useEffect(() => () => active.current?.abort(), []);

  return { supported, listening, start, stop };
}
