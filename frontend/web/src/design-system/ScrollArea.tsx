import { type ElementType, type MutableRefObject, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./utils";

const AREA_THRESHOLD = 24;

type ScrollAreaProps = {
  children: ReactNode;
  as?: "div" | "aside" | "section";
  className?: string;
  viewportClassName?: string;
  viewportRef?: MutableRefObject<HTMLDivElement | null>;
  hint?: string;
};

function hasMoreContent(node: HTMLElement | null): boolean {
  if (!node) return false;
  return node.scrollHeight - (node.scrollTop + node.clientHeight) > AREA_THRESHOLD;
}

/**
 * Scrollable region with a local affordance. The browser scrollbar is hidden
 * globally, so panels that scroll internally need their own subtle cue. The
 * fade/arrow are pointer-events:none and live inside the region, which means
 * they never block buttons, selects or drag handles.
 */
export function ScrollArea({
  children,
  as = "div",
  className,
  viewportClassName,
  viewportRef: externalViewportRef,
  hint = "Ещё ниже",
}: ScrollAreaProps) {
  const internalViewportRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = externalViewportRef ?? internalViewportRef;
  const [canScrollDown, setCanScrollDown] = useState(false);
  const Component = as as ElementType;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function update() {
      setCanScrollDown(hasMoreContent(viewport));
    }

    update();
    viewport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(viewport);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(viewport, { childList: true, subtree: true, attributes: true });

    return () => {
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <Component className={cn("min-h-0", className)}>
      <div ref={viewportRef} className={cn("min-h-0 overflow-auto", viewportClassName)}>
        {children}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none sticky inset-x-0 bottom-0 z-20 -mt-20 flex justify-center px-3 pb-2 pt-14",
            "bg-gradient-to-t from-canvas from-40% via-canvas/95 to-transparent",
            "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            canScrollDown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
          )}
        >
          <div className="flex items-center gap-2 rounded-full border border-blue/25 bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-pop backdrop-blur">
            <span className="scroll-hint-bob flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue/15 text-sm text-blue" aria-hidden="true">
              ↓
            </span>
            <span>{hint}</span>
          </div>
        </div>
      </div>
    </Component>
  );
}
