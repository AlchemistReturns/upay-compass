"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Animates route changes with the View Transitions API (a no-op where unsupported).
 * Links say what kind of move they are with `transitionTypes`:
 *   nav-tab     – switching tabs: a quick crossfade, nothing moves sideways
 *   nav-forward – drilling deeper: content slides in from the right
 *   nav-back    – the back button: content slides in from the left
 * Anything untyped (redirects after saving, browser back) gets the crossfade.
 */
const CLASSES = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-tab": "nav-tab",
  default: "nav-tab",
};

export const NAV_FORWARD = ["nav-forward"];
export const NAV_BACK = ["nav-back"];
export const NAV_TAB = ["nav-tab"];

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter={CLASSES} exit={CLASSES} default="none">
      {/* one element, so the whole page moves as a single snapshot */}
      <div>{children}</div>
    </ViewTransition>
  );
}
