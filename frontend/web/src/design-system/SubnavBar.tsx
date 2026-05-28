import { type ReactNode } from "react";
import { cn } from "./utils";

type SubnavBarProps = {
  children: ReactNode;
  "aria-label": string;
  className?: string;
  innerClassName?: string;
};

/**
 * Route-level subnavigation that sits in normal page flow on mobile. Keep this
 * non-sticky unless a page explicitly opts into desktop-only sticky chrome.
 */
export function SubnavBar({
  children,
  "aria-label": ariaLabel,
  className,
  innerClassName,
}: SubnavBarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("border-b border-line bg-surface/85 backdrop-blur", className)}
    >
      <div className={cn("flex w-full items-stretch gap-1 px-3 sm:px-4 lg:px-6", innerClassName)}>
        {children}
      </div>
    </nav>
  );
}
