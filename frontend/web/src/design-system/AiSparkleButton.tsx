import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AiSparkleIcon } from "./AiIntelligenceSurface";
import { Button } from "./components";
import { cn } from "./utils";

/**
 * Button variant for AI-driven actions (currently: Generate / Regenerate
 * AI summary). Uses the same purple→blue gradient as
 * `AiIntelligenceSurface` so the action and the artifact it produces
 * read as one product feature.
 *
 * Built on top of `Button`, not a parallel implementation — keeps focus
 * rings, disabled handling, loading state, and motion budget identical
 * to the rest of the UI; only the visual paint changes via the
 * `.ai-sparkle-button` utility class in `src/index.css`.
 *
 * The leading sparkle glyph mirrors the badge on the AI surface, and is
 * suppressed while `loading` is true so the underlying spinner is the
 * only motion (avoids a double-pulse).
 */
export function AiSparkleButton({
  children,
  className,
  size = "lg",
  loading = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Button
      // `secondary` is the most neutral variant we can pass; the gradient
      // class overrides its background/border/color via `!important` so
      // the choice here doesn't leak through.
      variant="secondary"
      size={size}
      loading={loading}
      className={cn("ai-sparkle-button", className)}
      {...rest}
    >
      {!loading ? (
        <AiSparkleIcon className="h-4 w-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </Button>
  );
}
