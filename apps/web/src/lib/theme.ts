"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

/**
 * Light / dark / follow the system. The choice lives on this device only; the `.dark` class on
 * <html> is what the styles key off; THEME_SCRIPT (theme-script.ts) applies it before first paint.
 */
export type ThemePreference = "system" | "light" | "dark";

const THEME_COLOR = { light: "#f1f6ee", dark: "#060d0e" } as const;

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
}

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePreference): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function apply(pref: ThemePreference) {
  const mode = resolve(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  // the browser chrome (status bar, address bar) follows the chosen theme, not just the OS
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = THEME_COLOR[mode]));
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") apply("system");
    onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    apply(readPreference());
    onChange();
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Switch theme. With an origin point (the control that was tapped) the new theme washes over the
 * old one in a circle growing from that point; without motion support it just swaps.
 */
export function setTheme(pref: ThemePreference, origin?: { x: number; y: number }) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage unavailable: the choice lasts for this visit
  }
  const changes =
    resolve(pref) !== (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const notify = () => listeners.forEach((l) => l());

  if (!changes || reduced || !origin || typeof document.startViewTransition !== "function") {
    apply(pref);
    notify();
    return;
  }

  const root = document.documentElement;
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);
  // the whole page moves as one picture, so floating bars change with everything else
  root.dataset.themeSwitching = "";
  const transition = document.startViewTransition(() => {
    apply(pref);
    notify();
  });
  void transition.finished.finally(() => delete root.dataset.themeSwitching);
}

/** The saved preference and what it resolves to right now. */
export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "light" as const);
  const resolved = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light" as const,
  );
  return { preference, resolved };
}
