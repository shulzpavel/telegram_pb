import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";
const TEXT_ENTRY_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "password",
  "tel",
  "url",
  "number",
]);

export function resolveKeyboardInset(layoutHeight: number, viewportHeight: number, viewportOffsetTop: number): number {
  const safeLayoutHeight = Number.isFinite(layoutHeight) ? layoutHeight : 0;
  const safeViewportHeight = Number.isFinite(viewportHeight) ? viewportHeight : safeLayoutHeight;
  const safeOffsetTop = Number.isFinite(viewportOffsetTop) ? viewportOffsetTop : 0;
  return Math.max(0, Math.round(safeLayoutHeight - safeViewportHeight - safeOffsetTop));
}

export function isTextEntryInputType(type: string | null | undefined): boolean {
  const normalized = (type ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return TEXT_ENTRY_INPUT_TYPES.has(normalized);
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

export function findPreferredFocusTarget(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const textInputs = Array.from(container.querySelectorAll<HTMLInputElement>("input:not([disabled]):not([readonly])"))
    .filter((node) => node.tabIndex !== -1 && node.type !== "hidden" && isTextEntryInputType(node.type));
  if (textInputs.length > 0) return textInputs[0];

  const textareas = Array.from(container.querySelectorAll<HTMLTextAreaElement>("textarea:not([disabled]):not([readonly])"))
    .filter((node) => node.tabIndex !== -1);
  if (textareas.length > 0) return textareas[0];

  const editable = Array.from(container.querySelectorAll<HTMLElement>("[contenteditable='true']:not([disabled])"))
    .filter((node) => node.tabIndex !== -1);
  if (editable.length > 0) return editable[0];

  const generic = Array.from(container.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
    .filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
  return generic[0] ?? null;
}

export function keepFocusedFieldVisible(element: HTMLElement) {
  if (typeof window === "undefined" || !isMobileViewport()) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroll = () => {
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };
  window.setTimeout(scroll, 60);
  window.setTimeout(scroll, 260);

  if (window.visualViewport) {
    const handleViewportShift = () => {
      if (document.activeElement === element) scroll();
    };
    window.visualViewport.addEventListener("resize", handleViewportShift, { passive: true });
    window.visualViewport.addEventListener("scroll", handleViewportShift, { passive: true });
    window.setTimeout(() => {
      window.visualViewport?.removeEventListener("resize", handleViewportShift);
      window.visualViewport?.removeEventListener("scroll", handleViewportShift);
    }, 900);
  }
}

export function useMobileKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !isMobileViewport()) {
      setInset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setInset(0);
      return;
    }

    const update = () => {
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
      setInset(resolveKeyboardInset(layoutHeight, viewport.height, viewport.offsetTop));
    };

    update();
    viewport.addEventListener("resize", update, { passive: true });
    viewport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("orientationchange", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [active]);

  return inset;
}
