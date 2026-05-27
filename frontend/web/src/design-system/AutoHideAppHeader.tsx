import { type ReactNode, useEffect, useState } from "react";
import { cn } from "./utils";
import { useScrollHideHeader } from "./useScrollHideHeader";

type AutoHideAppHeaderProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps the primary app menu row (brand, back, theme). On viewports below `md`
 * it hides when the user scrolls down and reappears on scroll up. Subnav/tab
 * bars should sit outside this wrapper so they stay visible.
 */
export function AutoHideAppHeader({ children, className }: AutoHideAppHeaderProps) {
  const [mobileEnabled, setMobileEnabled] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    function sync() {
      setMobileEnabled(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const visible = useScrollHideHeader({ enabled: mobileEnabled });

  return (
    <div
      className={cn(
        "z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80",
        "max-md:sticky max-md:top-0",
        "max-md:transition-transform max-md:duration-200 max-md:ease-out",
        "motion-reduce:max-md:transition-none",
        !visible && "max-md:-translate-y-full max-md:pointer-events-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
