import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

/**
 * Apple-Intelligence-styled card surface used for AI-generated content.
 *
 * Visual contract:
 *   - Replaces the plain `<Surface>` border with a slow-rotating
 *     conic-gradient ring (purple → blue → purple).
 *   - Anchors a small sparkle glyph at the top-right, sitting on the
 *     ring itself — the visual signal that "this block is AI output".
 *   - Slot-based: takes arbitrary children, so the existing AI summary
 *     layouts in ManagerPage / VotePage don't have to change.
 *
 * The heavy lifting (gradient mask, rotation animation, reduced-motion
 * fallback) lives in `src/index.css` under `.ai-intelligence-surface`.
 * Keeping CSS there means the keyframes participate in the global
 * `prefers-reduced-motion` reset and don't need a React-side guard.
 */
export function AiIntelligenceSurface({
  children,
  className,
  showSparkle = true,
  sparkleLabel = "AI",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Hide the corner glyph if the consumer renders its own AI badge. */
  showSparkle?: boolean;
  /** Accessible label for the sparkle glyph (announced by screen readers). */
  sparkleLabel?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div className={cn("ai-intelligence-surface", className)} {...rest}>
      {showSparkle ? (
        <AiSparkleBadge label={sparkleLabel} />
      ) : null}
      {children}
    </div>
  );
}

/**
 * Tiny gradient sparkle anchored at the top-right corner. Positioned so
 * it overlaps the animated border ring — same metaphor Apple uses for
 * Intelligence surfaces. Pointer-events disabled so it never steals
 * clicks from underlying content.
 */
function AiSparkleBadge({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "ai-sparkle",
        "absolute -right-1.5 -top-1.5 z-[2] inline-flex h-5 w-5 items-center justify-center",
        "rounded-full bg-surface shadow-card",
        "pointer-events-none select-none",
      )}
    >
      <AiSparkleIcon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Four-point sparkle glyph (Apple Intelligence aesthetic). Filled with a
 * linear gradient tied to the same purple→blue palette as the border.
 * The gradient id is component-local but stable, so multiple instances
 * on one page can share it without conflict.
 */
export function AiSparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ai-sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(var(--c-purple))" />
          <stop offset="55%" stopColor="rgb(var(--c-blue2))" />
          <stop offset="100%" stopColor="rgb(var(--c-blue))" />
        </linearGradient>
      </defs>
      {/* Big four-point sparkle. */}
      <path
        fill="url(#ai-sparkle-gradient)"
        d="M12 2.5c.35 2.55 1.2 4.5 2.5 5.8 1.3 1.3 3.25 2.15 5.8 2.5-2.55.35-4.5 1.2-5.8 2.5-1.3 1.3-2.15 3.25-2.5 5.8-.35-2.55-1.2-4.5-2.5-5.8-1.3-1.3-3.25-2.15-5.8-2.5 2.55-.35 4.5-1.2 5.8-2.5C10.8 7 11.65 5.05 12 2.5z"
      />
      {/* Smaller accent sparkle in the top-right; adds a sense of motion. */}
      <path
        fill="url(#ai-sparkle-gradient)"
        opacity="0.85"
        d="M19 16.5c.13.95.42 1.65.92 2.15.5.5 1.2.79 2.15.92-.95.13-1.65.42-2.15.92-.5.5-.79 1.2-.92 2.15-.13-.95-.42-1.65-.92-2.15-.5-.5-1.2-.79-2.15-.92.95-.13 1.65-.42 2.15-.92.5-.5.79-1.2.92-2.15z"
      />
    </svg>
  );
}
