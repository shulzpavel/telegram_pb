import { type ReactNode } from "react";
import { cn } from "./utils";

type MobileBottomDockProps = {
  children: ReactNode;
  "aria-label": string;
  className?: string;
  contentClassName?: string;
};

/**
 * Shared mobile bottom toolbar. It stays in normal page flow as a sticky footer,
 * so content scrolls as one document while primary actions remain thumb-ready.
 */
export function MobileBottomDock({
  children,
  "aria-label": ariaLabel,
  className,
  contentClassName,
}: MobileBottomDockProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 border-t border-line bg-surface/95 px-3 pb-safe-4 pt-2 backdrop-blur",
        "max-md:shadow-[0_-4px_24px_rgba(0,0,0,0.06)] md:hidden motion-safe:animate-fade-up",
        className,
      )}
      role="toolbar"
      aria-label={ariaLabel}
    >
      <div className={cn("mx-auto flex items-stretch gap-2", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
