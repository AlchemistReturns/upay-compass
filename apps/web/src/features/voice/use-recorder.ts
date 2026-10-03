"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VOICE_MAX_SECONDS, microphoneProblem, type RecognitionProblem } from "@compass/shared";

/**
 * Records a short clip from the microphone. Unlike the browser's speech recognition, recording
 * works in every current browser (Chrome, Edge, Brave, Firefox, Safari), which is why the server
 * speech-to-text fallback is built on it. The clip is held in memory, handed to the caller and
 * forgotten; nothing is saved. Recording stops by itself at the length limit.
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

const noSubscription = () => () => {};
const supportedNow = () =>
  typeof window !== "undefined" &&
  typeof MediaRecorder !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

export type RecorderState = "idle" | "recording";

export function useRecorder({ onProblem }: { onProblem: (problem: RecognitionProblem) => void }) {
  const supported = useSyncExternalStore(noSubscription, supportedNow, () => false);
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finish = useRef<((blob: Blob | null) => void) | null>(null);
  const timers = useRef<{ tick?: number; cap?: number }>({});
  const onProblemRef = useRef(onProblem);
  useEffect(() => {
    onProblemRef.current = onProblem;
  });

  const release = useCallback(() => {
    window.clearInterval(timers.current.tick);
    window.clearTimeout(timers.current.cap);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setState("idle");
    setElapsed(0);
  }, []);

  /** Starts recording. Resolves true once the microphone is open, false if it could not be. */
  const start = useCallback(async (): Promise<boolean> => {
    if (!supportedNow() || recorder.current) return false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = media;
      const mimeType = pickMime();
      const rec = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 24_000,
      });
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = chunks.current.length
          ? new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" })
          : null;
        chunks.current = [];
        release();
        finish.current?.(blob);
        finish.current = null;
      };
      recorder.current = rec;
      rec.start(250);
      setState("recording");
      const began = Date.now();
      timers.current.tick = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - began) / 1000)),
        250,
      );
      timers.current.cap = window.setTimeout(
        () => rec.state !== "inactive" && rec.stop(),
        VOICE_MAX_SECONDS * 1000,
      );
      return true;
    } catch (e) {
      release();
      onProblemRef.current(microphoneProblem(e instanceof Error ? e.name : ""));
      return false;
    }
  }, [release]);

  /** Stops and returns the clip (null if nothing was recorded). Also resolves when the length cap stops it. */
  const stop = useCallback((): Promise<Blob | null> => {
    const rec = recorder.current;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      finish.current = resolve;
      if (rec.state !== "inactive") rec.stop();
    });
  }, []);

  /** Throws the recording away. */
  const cancel = useCallback(() => {
    const rec = recorder.current;
    finish.current = null;
    chunks.current = [];
    if (rec && rec.state !== "inactive") {
      rec.onstop = () => release();
      rec.stop();
    } else {
      release();
    }
  }, [release]);

  useEffect(() => () => cancel(), [cancel]);

  return { supported, state, elapsed, start, stop, cancel };
}
