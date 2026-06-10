import { type ReactNode, useEffect, useState } from "react";
import { cn } from "./utils";
import { useScrollHideHeader } from "./useScrollHideHeader";

type AutoHideAppHeaderProps = {
  children: ReactNode;
  className?: string;
  hideOnMobileScroll?: boolean;
};

/**
 * Wraps the primary app menu row (brand, back, theme). On viewports below `md`
 * it hides when the user scrolls down and reappears on scroll up. Hidden state
 * is fully translated out and visually transparent so no blurred plate remains
 * on top of the content.
 */
export function AutoHideAppHeader({ children, className, hideOnMobileScroll = true }: AutoHideAppHeaderProps) {
  const [mobileEnabled, setMobileEnabled] = useState(false);

  useEffect(() => {
    if (!hideOnMobileScroll) {
      setMobileEnabled(false);
      return;
    }
    const media = window.matchMedia("(max-width: 767px)");
    function sync() {
      setMobileEnabled(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [hideOnMobileScroll]);

  const visible = useScrollHideHeader({ enabled: mobileEnabled });

  return (
    <div
      className={cn(
        "z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80",
        "max-md:sticky max-md:top-0",
        "max-md:transition-[transform,opacity,background-color,border-color,backdrop-filter] max-md:duration-200 max-md:ease-out",
        "motion-reduce:max-md:transition-none",
        !visible && "max-md:pointer-events-none max-md:-translate-y-full max-md:border-transparent max-md:bg-transparent max-md:opacity-0 max-md:backdrop-blur-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
