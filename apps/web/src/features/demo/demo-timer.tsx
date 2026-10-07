"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Circle, Minus, RotateCcw, Timer, X } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";

/** The five moments of the demo flow, in order. */
const STAGES = ["spoke", "understood", "explained", "recommended", "confirmed"] as const;
export type DemoStage = (typeof STAGES)[number];
const LABEL: Record<DemoStage, string> = {
  spoke: "Speak in Bangla",
  understood: "Compass understands",
  explained: "Explains",
  recommended: "Recommends",
  confirmed: "User confirms",
};

type State = { at: Partial<Record<DemoStage, number>> };
let state: State = { at: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Record a moment of the flow (once per run). Cheap, client-side, and a no-op until the timer is on. */
export function demoMark(stage: DemoStage) {
  // saying something starts a fresh run; later stages only count inside a run
  if (stage === "spoke") state = { at: {} };
  else if (state.at.spoke === undefined) return;
  if (state.at[stage] !== undefined) return;
  state = { at: { ...state.at, [stage]: Date.now() } };
  emit();
}

function demoReset() {
  state = { at: {} };
  emit();
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => state;

/* On/off switch, remembered on this device. Only an admin can turn it on. */
const KEY = "compass.demo.timer";
let enabled = false;
let loaded = false;
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    enabled = localStorage.getItem(KEY) === "1";
  } catch {
    // stays off
  }
}
export function setDemoEnabled(on: boolean) {
  load();
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // not remembered
  }
  emit();
}
const getEnabled = () => (load(), enabled);
export function useDemoEnabled() {
  return useSyncExternalStore(subscribe, getEnabled, () => false);
}

/**
 * The presenter's step timer. Admin only, and off until switched on (the "Demo timer" switch in the
 * account menu, or ?demo=1 in the address). It can be minimised or closed from the overlay itself.
 */
export function DemoTimer() {
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const isAdmin = profile.data?.role === "admin";
  const on = useDemoEnabled();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [now, setNow] = useState(() => Date.now());
  const [small, setSmall] = useState(false);

  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get("demo") === "1") {
      setDemoEnabled(true);
    }
  }, [isAdmin]);

  const start = s.at.spoke;
  const end = s.at.confirmed;
  const show = isAdmin && on;
  useEffect(() => {
    if (!show || start === undefined || end !== undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [show, start, end]);

  if (!show) return null;
  const done = STAGES.filter((k) => s.at[k] !== undefined).length;
  const elapsed = start === undefined ? 0 : ((end ?? now) - start) / 1000;
  const finished = end !== undefined;

  if (small) {
    return (
      <button
        type="button"
        onClick={() => setSmall(false)}
        aria-label="Open demo timer"
        className="bg-brand-deep text-lime fixed top-2 right-2 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg"
      >
        <Timer className="size-3.5" aria-hidden />
        <span className="num">
          {done}/{STAGES.length} · {elapsed.toFixed(1)}s
        </span>
      </button>
    );
  }

  const icon = "grid size-7 place-items-center rounded-full hover:bg-white/15";
  return (
    <aside
      aria-label="Demo timer"
      className="bg-brand-deep text-on-dark fixed top-2 right-2 z-50 w-56 rounded-2xl p-3 text-xs shadow-xl"
    >
      <div className="flex items-center gap-1">
        <Timer className="text-lime size-3.5" aria-hidden />
        <span className="text-lime flex-1 font-bold">Demo timer</span>
        <button type="button" onClick={demoReset} aria-label="Reset" title="Reset" className={icon}>
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setSmall(true)}
          aria-label="Minimise"
          title="Minimise"
          className={icon}
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setDemoEnabled(false)}
          aria-label="Turn off"
          title="Turn off"
          className={icon}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="num text-3xl leading-none font-extrabold">{elapsed.toFixed(1)}s</span>
        <span className="text-on-dark-muted font-semibold">
          Step {done}/{STAGES.length}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {STAGES.map((k) => (
          <span
            key={k}
            className={`h-1.5 flex-1 rounded-full ${s.at[k] !== undefined ? "bg-lime" : "bg-white/20"}`}
          />
        ))}
      </div>

      <ol className="mt-3 space-y-1.5">
        {STAGES.map((k) => {
          const hit = s.at[k] !== undefined;
          return (
            <li
              key={k}
              className={`flex items-center gap-2 ${hit ? "font-semibold" : "opacity-55"}`}
            >
              {hit ? (
                <CheckCircle2 className="text-lime size-4 shrink-0" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0" aria-hidden />
              )}
              <span className="flex-1">{LABEL[k]}</span>
              {hit && start !== undefined && (
                <span className="num text-on-dark-muted">
                  {((s.at[k]! - start) / 1000).toFixed(1)}s
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-on-dark-muted mt-3" role="status">
        {finished
          ? `Done in ${elapsed.toFixed(1)}s`
          : start === undefined
            ? "Tap the mic and speak to start."
            : "Running…"}
      </p>
    </aside>
  );
}
