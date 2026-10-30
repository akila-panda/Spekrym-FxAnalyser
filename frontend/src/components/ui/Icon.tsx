import type { ReactNode } from "react";
import "@/styles/chrome.css";

const P = {
  "chevron-left": <path d="M10 3 5 8l5 5" />,
  "chevron-right": <path d="m6 3 5 5-5 5" />,
  "chevrons-left": <path d="M9 3 4 8l5 5M13 3 8 8l5 5" />,
  "chevrons-right": <path d="m7 3 5 5-5 5M3 3l5 5-5 5" />,
  "caret-down": <path d="m4 6 4 4 4-4" />,
  "caret-right": <path d="m6 4 4 4-4 4" />,
  popout: <path d="M9 2h5v5M14 2 8 8M12 9v4H3V4h4" />,
  dock: <path d="M8 2v7M5 6l3 3 3-3M3 13h10" />,
  fullscreen: <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />,
  maximize: <path d="M9 2h5v5M7 14H2V9M14 2 9 7M2 14l5-5" />,
  restore: <path d="M14 7h-5V2M2 9h5v5M9 7l5-5M7 9l-5 5" />,
  close: <path d="m3 3 10 10M13 3 3 13" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7v4M8 5v.01" />
    </>
  ),
  reset: <path d="M3 8a5 5 0 1 0 1.8-3.8M3 2v3h3" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
    </>
  ),
  check: <path d="m3 8.5 3.5 3.5L13 4.5" />,
  layers: <path d="m8 2 6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" />,
  "layers-off": <path d="m8 2 6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3M2 14 14 2" />,
  screens: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M6 14h4M8 11v3" />
    </>
  ),
  star: <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13l.7-4L2.2 6.3l4-.6z" />,
  dot: <circle cx="8" cy="8" r="3.5" fill="currentColor" />,
  ring: <circle cx="8" cy="8" r="3.5" />,
  "arrow-left": <path d="M13 8H3M7 4 3 8l4 4" />,
  align: <path d="M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

/** One 14px, 1.5px-stroke line set. Decorative: always pair with a text label or an aria-label on the button. */
export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}