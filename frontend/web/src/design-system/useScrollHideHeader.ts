import { useEffect, useRef, useState } from "react";
import {
  resolveHeaderVisible,
  resolveScrollDirection,
  type ScrollDirection,
} from "./scrollHideHeader";

type Options = {
  enabled: boolean;
};

/**
 * Tracks window scroll direction for auto-hiding the primary app header on mobile.
 * Disabled on desktop (`enabled=false`) or when the user prefers reduced motion.
 */
export function useScrollHideHeader({ enabled }: Options) {
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);
  const visibleRef = useRef(true);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      visibleRef.current = true;
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setVisible(true);
      visibleRef.current = true;
      return;
    }

    lastYRef.current = window.scrollY;

    function onScroll() {
      const currentY = window.scrollY;
      const direction: ScrollDirection = resolveScrollDirection(lastYRef.current, currentY);
      lastYRef.current = currentY;

      const nextVisible = resolveHeaderVisible(direction, visibleRef.current, currentY);
      if (nextVisible === visibleRef.current) return;
      visibleRef.current = nextVisible;
      setVisible(nextVisible);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return visible;
}
