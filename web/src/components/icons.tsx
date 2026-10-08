"use client";

import type { SVGProps } from "react";

const PATHS: Record<string, string> = {
  ask: "M4 6h16v9H9l-5 4V6Z M9.5 10.5h5 M9.5 13h3",
  corpus: "M12 3 3 8l9 5 9-5-9-5Z M3 13l9 5 9-5",
  measurements: "M4 20V10 M10 20V4 M16 20v-8 M21 20H3",
  file: "M6 3h8l4 4v14H6V3Z M14 3v4h4",
  search: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z M16 16l5 5",
  searchMinus: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z M16 16l5 5 M8.5 11h5",
  check: "M5 12.5 10 17.5 19 7",
  checkCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M8.5 12.5 11 15l4.5-5.5",
  xCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M9.5 9.5l5 5 M14.5 9.5l-5 5",
  alertTriangle: "M12 4 2.5 20h19L12 4Z M12 10v4 M12 17.5v.5",
  alertCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 8v5 M12 16.5v.5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 11v5 M12 7.5V8",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  copy: "M9 9h11v11H9V9Z M5 15V4h11",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6 M20 3v4h-4",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5",
  quote: "M6 15c-1 0-2-1-2-2.5C4 9 6.5 6.5 10 5.5 M18 15c-1 0-2-1-2-2.5 0-3.5 2.5-6 6-7",
  layers: "M12 3 3 8l9 5 9-5-9-5Z M3 13l9 5 9-5 M3 18l9 5 9-5",
  settings: "M4 8h10 M18 8h2 M4 16h4 M12 16h8 M15 5v6 M9 13v6",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M9.5 9.5A2.5 2.5 0 0 1 12 8c1.4 0 2.5 1 2.5 2.2 0 1.7-2.2 2-2.5 3.3 M12 17v.5",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3.5 2",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z M12 9v4 M12 16.5v.5",
  dot: "M12 8v.5",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
  stop: "M7 7h10v10H7V7Z",
  history: "M4 5v4h4 M4.5 9A8 8 0 1 1 4 14 M12 8v4l3 2",
  download: "M12 4v12 M7 11l5 5 5-5 M4 20h16",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14",
  plus: "M12 5v14 M5 12h14",
  x: "M6 6l12 12 M18 6 6 18",
  arrowRight: "M4 12h15 M13 6l6 6-6 6",
  database: "M12 8c4.4 0 8-1.1 8-2.5S16.4 3 12 3 4 4.1 4 5.5 7.6 8 12 8Z M4 5.5V18.5C4 19.9 7.6 21 12 21s8-1.1 8-2.5V5.5 M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5",
  command: "M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9 M15 15v2.5a2.5 2.5 0 1 0 2.5-2.5H15 M6.5 9H9v6H6.5 M17.5 15H15V9h2.5",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: IconName;
  size?: 14 | 16 | 20 | 32;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
