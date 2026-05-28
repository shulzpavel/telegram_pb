import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "./utils";

const BOTTOM_THRESHOLD = 96;
const SHOW_DELAY_MS = 450;

function canScrollFurther(): boolean {
  if (typeof window === "undefined") return false;
  const { documentElement, body } = document;
  const scrollHeight = Math.max(documentElement.scrollHeight, body.scrollHeight);
  const viewportHeight = window.innerHeight;
  const scrollTop = window.scrollY || documentElement.scrollTop || body.scrollTop || 0;
  return scrollHeight - (scrollTop + viewportHeight) > BOTTOM_THRESHOLD;
}

function pageScrollLocked(): boolean {
  if (typeof window === "undefined") return false;
  const { body, documentElement } = document;
  const bodyOverflow = window.getComputedStyle(body).overflowY;
  const htmlOverflow = window.getComputedStyle(documentElement).overflowY;
  return bodyOverflow === "hidden" || htmlOverflow === "hidden";
}

/**
 * Global scroll affordance shown only when the current page has more content
 * below the fold. Since visible scrollbars are intentionally hidden across
 * browsers, this tiny hint gives users a clear "there is more below" cue
 * without adding layout or stealing clicks.
 */
function isViewportLockedShell(pathname: string): boolean {
  return (
    pathname === "/"
    || /\/cockpit$/.test(pathname)
    || /\/report$/.test(pathname)
    || pathname === "/manage"
    || pathname.startsWith("/manage/")
  );
}

export function ScrollHint() {
  const location = useLocation();
  const viewportLocked = isViewportLockedShell(location.pathname);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewportLocked) {
      setVisible(false);
      return;
    }
    function clearTimer() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function update({ immediate = false }: { immediate?: boolean } = {}) {
      clearTimer();
      const nextVisible = canScrollFurther() && !pageScrollLocked();
      if (!nextVisible || immediate) {
        setVisible(nextVisible);
        return;
      }
      timerRef.current = window.setTimeout(() => setVisible(canScrollFurther() && !pageScrollLocked()), SHOW_DELAY_MS);
    }

    update({ immediate: true });

    const onScroll = () => update({ immediate: true });
    const onResize = () => update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const resizeObserver = new ResizeObserver(() => update());
    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(() => update());
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    return () => {
      clearTimer();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [location.pathname, location.search, viewportLocked]);

  if (viewportLocked) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+1.5rem)] z-40 flex justify-center px-4",
        "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink2 shadow-card">
        <span className="scroll-hint-bob flex h-5 w-5 items-center justify-center rounded-full bg-blue/10 text-blue">
          ↓
        </span>
        <span>Прокрутите ниже</span>
      </div>
    </div>
  );
}
