import type { SVGProps } from "react";

/**
 * The one microphone used everywhere (button, floating button, sheet, coach). A duotone capsule
 * with a soft fill, a rounded cradle and two small sound ticks; it follows the text colour, so it
 * works on lime, dark green and the soft tint alike.
 */
export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" fillOpacity={0.22} />
      <path d="M11 6.5h2M11 9.5h2" strokeWidth={1.5} />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3M9 21h6" />
      <path d="M2.5 9v3M21.5 9v3" strokeWidth={1.4} opacity={0.55} />
    </svg>
  );
}
