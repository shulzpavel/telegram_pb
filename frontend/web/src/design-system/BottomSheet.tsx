import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { findPreferredFocusTarget, useMobileKeyboardInset } from "./mobileKeyboard";
import { ScrollArea } from "./ScrollArea";
import { cn } from "./utils";

/**
 * Responsive modal primitive: bottom sheet on mobile, centered dialog on desktop.
 *
 * Renders a card pinned to the bottom of the mobile viewport with a grab
 * handle, safe-area-aware padding, focus trap, ESC-to-close, click
 * outside to close and body scroll lock. On `md+` it becomes a centered
 * dialog because desktop users expect modal focus, not a bottom dock.
 *
 * Use for non-confirmation overflow menus (settings, info panels,
 * action lists). For destructive confirms keep using `ConfirmDialog`.
 */
export function BottomSheet({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const keyboardInset = useMobileKeyboardInset(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const focusFirst = () => {
      const preferred = findPreferredFocusTarget(sheetRef.current);
      preferred?.focus();
      if (preferred) return;
      const focusables = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      (focusables[0] ?? sheetRef.current)?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusables.length === 0) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Lock background scroll while the sheet is open (matches
    // ConfirmDialog behavior).
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const handleBackdrop = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (event.target === event.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm motion-safe:animate-fade-up md:items-center md:p-6"
      style={{ "--keyboard-bottom-inset": `${keyboardInset}px` } as CSSProperties}
      role="presentation"
      onMouseDown={handleBackdrop}
      onTouchEnd={handleBackdrop}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          // Edge-to-edge below md (looks broken otherwise — see the
          // narrow centered "rectangle in the middle of the screen"
          // bug). On md+ this becomes a normal centered dialog.
          "relative w-full outline-none md:max-w-md",
          "rounded-t-2xl border border-line border-b-0 bg-surface shadow-card md:rounded-2xl md:border-b",
          "motion-safe:animate-scale-in",
          // Keep the sheet above the on-screen keyboard on mobile.
          "max-h-[calc(100dvh-var(--safe-top)-var(--keyboard-bottom-inset)-0.75rem)] overflow-hidden md:max-h-[min(760px,calc(100dvh-3rem))]",
          className,
        )}
      >
        {/* Drag handle — purely decorative, the sheet is dismissed by
            tap-outside / Escape. We don't ship full drag-to-dismiss
            because it would conflict with internal scroll on long
            menus. */}
        <div className="flex justify-center pt-2.5 md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>

        {(title || description) ? (
          <div className="px-5 pb-2 pt-3">
            {title ? <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2> : null}
            {description ? <p id={descriptionId} className="mt-1 text-base text-ink3 sm:text-sm">{description}</p> : null}
          </div>
        ) : null}

        <ScrollArea
          className="max-h-[calc(100dvh-var(--keyboard-bottom-inset)-11rem)] md:max-h-[min(520px,calc(100dvh-15rem))]"
          viewportClassName="max-h-[calc(100dvh-var(--keyboard-bottom-inset)-11rem)] px-2 pb-2 pt-1 md:max-h-[min(520px,calc(100dvh-15rem))]"
          hint="Ещё пункты"
        >
          {children}
        </ScrollArea>

        {footer ? (
          <div className="border-t border-line bg-surface px-5 pb-safe-4 pt-3 md:pb-5">
            {footer}
          </div>
        ) : (
          <div className="pb-safe-4 md:pb-5" />
        )}
      </div>
    </div>
  );
}

/**
 * Row item for use inside `<BottomSheet>`. Renders as a 44px-tall
 * touch target with optional leading icon and trailing meta.
 */
export function SheetItem({
  icon,
  label,
  description,
  trailing,
  onClick,
  disabled,
  tone = "default",
  type = "button",
}: {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full min-h-[3.25rem] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base sm:min-h-12 sm:py-2 sm:text-sm",
        "transition-colors duration-150 hover:bg-line2 focus-visible:bg-line2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
        "active:scale-[0.99] motion-reduce:active:scale-100",
        "disabled:pointer-events-none disabled:opacity-50",
        tone === "danger" ? "text-red" : "text-ink",
      )}
    >
      {icon ? <span className="shrink-0 text-ink3">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block whitespace-normal break-words font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block whitespace-normal break-words text-sm font-normal text-ink3 sm:text-xs">{description}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-ink3">{trailing}</span> : null}
    </button>
  );
}
