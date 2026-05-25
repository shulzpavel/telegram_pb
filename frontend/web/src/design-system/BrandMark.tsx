import { cn } from "./utils";

/**
 * Unified product logo.
 *
 * Background: VotePage/JoinPage/Manager/Landing each ship a slightly
 * different inline SVG (two cards) or 🃏 emoji, so the header looks
 * "off" depending on which screen you're on. This component is the
 * single source of truth — every entry point uses the same mark.
 *
 * The mark itself is two overlapping play cards (front/back), which
 * reads as planning-poker without needing a label. The wordmark is
 * optional so we can fit a tighter slot on mobile headers.
 */

const SIZES = {
  xs: {
    icon: "h-5 w-5",
    text: "text-xs",
  },
  sm: {
    icon: "h-6 w-6",
    text: "text-sm",
  },
  md: {
    icon: "h-7 w-7",
    text: "text-base",
  },
  lg: {
    icon: "h-9 w-9",
    text: "text-lg",
  },
} as const;

type BrandMarkSize = keyof typeof SIZES;

export function BrandMark({
  size = "sm",
  showWordmark = true,
  className,
  tone = "brand",
}: {
  size?: BrandMarkSize;
  showWordmark?: boolean;
  className?: string;
  /** `brand` = filled blue square; `muted` = subdued tinted version
   *  for use over already-vivid surfaces (rare). */
  tone?: "brand" | "muted";
}) {
  const sizing = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md",
          sizing.icon,
          tone === "brand" ? "bg-blue text-white" : "bg-blue/10 text-blue",
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 16 16" fill="none" className="h-3/5 w-3/5">
          <rect x="1.5" y="1.5" width="6" height="9" rx="1.2" fill="currentColor" fillOpacity="0.95" />
          <rect x="8.5" y="5.5" width="6" height="9" rx="1.2" fill="currentColor" fillOpacity="0.55" />
        </svg>
      </span>
      {showWordmark ? (
        <span className={cn("font-semibold tracking-tight text-ink", sizing.text)}>
          Planning Poker
        </span>
      ) : null}
    </span>
  );
}
