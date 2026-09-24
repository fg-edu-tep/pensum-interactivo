// Inline SVG icon set per design doc §1.8: 16x16 viewBox, stroke-based, no fill.
type IconProps = { size?: number };

const base = {
  viewBox: "0 0 16 16",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function BackIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  );
}
export function ChevronDownIcon({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 5.5 8 10l5-4.5" />
    </svg>
  );
}
export function ChevronRightIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5.5 3 10 8l-4.5 5" />
    </svg>
  );
}
export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m13 13-2.5-2.5" />
    </svg>
  );
}
export function ShareIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12.5" cy="3.5" r="1.75" />
      <circle cx="3.5" cy="8" r="1.75" />
      <circle cx="12.5" cy="12.5" r="1.75" />
      <path d="M5.1 7.1 10.9 4.4M5.1 8.9l5.8 2.7" />
    </svg>
  );
}
export function HelpIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.1 6.2a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.4" />
      <circle cx="8" cy="11.4" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
export function PlusIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
export function MinusIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 8h10" />
    </svg>
  );
}
export function FitIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" />
    </svg>
  );
}
export function CheckIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}
export function LockIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.3" />
      <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
    </svg>
  );
}
export function ArrowRightIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
export function ExternalIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M6.5 3H3v10h10V9.5" />
      <path d="M9 3h4v4M13 3 7.5 8.5" />
    </svg>
  );
}
export function PointerIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5 2.5 12 9l-3 .6.9 3.1-1.7.5-.9-3.1L5 12.5z" />
    </svg>
  );
}
