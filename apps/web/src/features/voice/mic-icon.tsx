import type { SVGProps } from "react";

/**
 * The one microphone used everywhere (button, floating button, sheet, coach): a solid capsule, a
 * rounded cradle and a short stand. It follows the text colour, so it works on yellow, blue and
 * the soft tint alike.
 */
export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="currentColor" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}
