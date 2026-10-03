"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechLang } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useOnline } from "@/features/pwa/use-online";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { useVoiceConsent } from "./use-voice-consent";

export type SpeakFailure = "consent_required" | "rate_limited" | "unavailable" | "failed";

/** Fetches reading-aloud audio for a stored coach answer from the server (OpenAI text-to-speech). */
async function fetchSpeech(messageId: string, lang: SpeechLang): Promise<Blob> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/voice-speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message_id: messageId, language: lang }),
  });
  if (res.status === 403) throw Object.assign(new Error("consent"), { kind: "consent_required" });
  if (res.status === 404) throw Object.assign(new Error("gone"), { kind: "failed" });
  if (res.status === 429) throw Object.assign(new Error("rate"), { kind: "rate_limited" });
  if (res.status === 503) throw Object.assign(new Error("off"), { kind: "unavailable" });
  if (!res.ok) throw Object.assign(new Error("failed"), { kind: "failed" });
  return res.blob();
}

/**
 * Read an answer aloud, anywhere. The free on-device voice is used when the browser has one for
 * the language; otherwise, with the person's agreement, the server voice is used. Replays reuse
 * the audio already fetched, so one answer costs one request.
 */
export function useSpeak(onProblem: (problem: SpeakFailure) => void) {
  const device = useSpeechSynthesis();
  const consent = useVoiceConsent();
  const online = useOnline();
  const [serverId, setServerId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const problem = useRef(onProblem);
  useEffect(() => {
    problem.current = onProblem;
  });

  const stopServer = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setServerId(null);
  }, []);

  const stop = useCallback(() => {
    device.stop();
    stopServer();
  }, [device, stopServer]);

  /** Whether Listen can be offered for this language: a device voice, or the server voice when online. */
  const canSpeak = useCallback(
    (lang: SpeechLang) => device.canSpeak(lang) || online,
    [device, online],
  );

  const speak = useCallback(
    async (text: string, id: string, lang: SpeechLang) => {
      stop();
      if (device.speak(text, id, lang)) return;
      // no on-device voice: the server voice, after the person has agreed to that
      if (!(await consent.ensure())) return;
      setLoadingId(id);
      try {
        // `id` is the stored message's id, which is what the server reads aloud
        let url = cache.current.get(`${lang}:${id}`);
        if (!url) {
          url = URL.createObjectURL(await fetchSpeech(id, lang));
          cache.current.set(`${lang}:${id}`, url);
        }
        const el = new Audio(url);
        el.onended = () => setServerId((cur) => (cur === id ? null : cur));
        el.onerror = () => setServerId((cur) => (cur === id ? null : cur));
        audio.current = el;
        setServerId(id);
        await el.play();
      } catch (e) {
        setServerId((cur) => (cur === id ? null : cur));
        problem.current(((e as { kind?: SpeakFailure }).kind ?? "failed") as SpeakFailure);
      } finally {
        setLoadingId((cur) => (cur === id ? null : cur));
      }
    },
    [device, consent, stop],
  );

  useEffect(
    () => () => {
      audio.current?.pause();
      cache.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  return {
    canSpeak,
    speak,
    stop,
    speakingId: device.speakingId ?? serverId,
    loadingId,
  };
}
