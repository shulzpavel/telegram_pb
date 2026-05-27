import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "./utils";

type CollapsibleSectionProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Initial open state on desktop (md+). */
  defaultOpen?: boolean;
  /** Initial open state below md when content is tall enough to collapse. */
  defaultOpenMobile?: boolean;
  collapsedMaxHeightPx?: number;
  collapseTriggerPx?: number;
};

/**
 * Section that can collapse long content. On mobile, tall bodies start collapsed
 * unless `defaultOpenMobile` is true. Uses measured height — no inner scroll.
 */
export function CollapsibleSection({
  title,
  children,
  className,
  bodyClassName,
  defaultOpen = true,
  defaultOpenMobile = false,
  collapsedMaxHeightPx = 192,
  collapseTriggerPx = 240,
}: CollapsibleSectionProps) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    function sync() {
      setIsMobile(media.matches);
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!contentRef.current) return;
    const tall = contentRef.current.scrollHeight > collapseTriggerPx;
    setNeedsCollapse(tall);
    if (!tall) setExpanded(true);
  }, [children, collapseTriggerPx]);

  useEffect(() => {
    setExpanded(isMobile ? defaultOpenMobile : defaultOpen);
  }, [defaultOpen, defaultOpenMobile, isMobile]);

  const showCollapsed = needsCollapse && !expanded;

  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{title}</div>
        {needsCollapse ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            className="shrink-0 min-h-9 rounded px-2 text-xs font-semibold text-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
          >
            {expanded ? "Свернуть" : "Развернуть"}
          </button>
        ) : null}
      </div>
      <div className="relative mt-2">
        <div
          id={contentId}
          ref={contentRef}
          className={cn(bodyClassName)}
          style={
            showCollapsed
              ? { maxHeight: `${collapsedMaxHeightPx}px`, overflow: "hidden" }
              : undefined
          }
        >
          {children}
        </div>
        {showCollapsed ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent"
          />
        ) : null}
      </div>
    </section>
  );
}
