/**
 * Tiny haptic taps on phones that support the Vibration API (most Android browsers; iOS Safari
 * ignores it). Off when the user asks for reduced motion. Never required for meaning.
 */
const PATTERN: Record<"light" | "success" | "warning", VibratePattern> = {
  light: 8,
  success: [10, 40, 14],
  warning: [18, 60, 18],
};

export function haptic(kind: keyof typeof PATTERN = "light") {
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    navigator.vibrate(PATTERN[kind]);
  } catch {
    // unsupported; feedback is visual anyway
  }
}
