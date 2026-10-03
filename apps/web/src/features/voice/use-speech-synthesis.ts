"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SPEECH_LOCALE, pickVoice, prepareSpeech, type SpeechLang } from "@compass/shared";

/**
 * Read an answer aloud with the browser's own voices (Web Speech API; nothing is sent to our
 * servers). Voices load late and differ a lot between browsers and devices: a Windows desktop may
 * have English voices only, an Android phone usually has Bangla through Google's engine. So the
 * listen control is offered only for a language that has an installed voice.
 */
const supportedNow = () =>
  typeof window !== "undefined" &&
  Boolean(window.speechSynthesis) &&
  typeof window.SpeechSynthesisUtterance === "function";

const EMPTY: SpeechSynthesisVoice[] = [];
let voices: SpeechSynthesisVoice[] = EMPTY;
const listeners = new Set<() => void>();

function refresh() {
  voices = window.speechSynthesis.getVoices();
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  if (!supportedNow()) return () => {};
  if (listeners.size === 0) {
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    }
  };
}

export function useSpeechSynthesis() {
  const installed = useSyncExternalStore(
    subscribe,
    () => voices,
    () => EMPTY,
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const canSpeak = useCallback(
    (lang: SpeechLang) => supportedNow() && pickVoice(installed, lang) !== null,
    [installed],
  );

  const stop = useCallback(() => {
    if (supportedNow()) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (text: string, id: string, lang: SpeechLang) => {
      if (!supportedNow()) return false;
      const voice = pickVoice(installed, lang);
      const chunks = prepareSpeech(text, lang);
      if (!voice || chunks.length === 0) return false;

      window.speechSynthesis.cancel(); // one voice at a time; also clears a stuck queue
      setSpeakingId(id);
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.voice = voice;
        u.lang = voice.lang || SPEECH_LOCALE[lang];
        u.rate = 0.95;
        if (i === chunks.length - 1) {
          u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
        }
        u.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
        window.speechSynthesis.speak(u);
      });
      return true;
    },
    [installed],
  );

  // Never talk on after the person leaves the screen or hides the app.
  useEffect(() => {
    const onHide = () => {
      if (supportedNow()) window.speechSynthesis.cancel();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, []);

  return { canSpeak, speak, stop, speakingId };
}
