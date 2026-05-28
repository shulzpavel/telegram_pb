import { type ReactNode } from "react";
import { cn } from "./utils";

type StickyActionFooterProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Sticky action row for long forms. The wrapper is pointer-events:none so it
 * does not block the page; only the action capsule is interactive.
 */
export function StickyActionFooter({
  children,
  className,
  contentClassName,
}: StickyActionFooterProps) {
  return (
    <footer className={cn("sticky bottom-0 z-10 flex justify-end py-3 pointer-events-none", className)}>
      <div
        className={cn(
          "pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-surface/90 p-2 shadow-card backdrop-blur",
          contentClassName,
        )}
      >
        {children}
      </div>
    </footer>
  );
}
