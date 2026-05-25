import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./utils";

/**
 * Lightweight toast notification system.
 *
 * Why custom and not a library:
 * - Toasts piggy-back on the design-system tokens (`bg-surface`, tone
 *   colours, motion durations) so visual style stays consistent.
 * - Footprint is tiny — three files, zero dependencies — and the API is
 *   small enough that consumers don't need to learn another mental model.
 * - We need explicit safe-area + sticky-CTA layering rules (toasts sit
 *   *above* `MobileStickyFormFooter` but *below* `ConfirmDialog`).
 *
 * Layering / z-index:
 *   - `MobileStickyFormFooter`: z-10
 *   - Toast viewport: z-40
 *   - `ConfirmDialog`: z-50  ← stays on top so destructive confirms are
 *     never covered by a transient toast.
 */

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  /** Optional bold title shown above the message. */
  title?: ReactNode;
  /** Required body text — what the user just did / what went wrong. */
  message: ReactNode;
  /** Visual tone; defaults to `info`. */
  tone?: ToastTone;
  /** Auto-dismiss timeout in ms. `0` = persistent (user closes manually). */
  duration?: number;
  /** Optional inline action — e.g. "Undo" or "Open report". */
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastInput {
  id: string;
}

interface ToastContextValue {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  /** Convenience helpers — same as `push({ tone, ... })`. */
  success: (message: ReactNode, extra?: Omit<ToastInput, "message" | "tone">) => string;
  error: (message: ReactNode, extra?: Omit<ToastInput, "message" | "tone">) => string;
  info: (message: ReactNode, extra?: Omit<ToastInput, "message" | "tone">) => string;
  warning: (message: ReactNode, extra?: Omit<ToastInput, "message" | "tone">) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  info: 4000,
  success: 3500,
  warning: 6000,
  danger: 7000,
};

let counter = 0;
const nextId = (): string => `t${++counter}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback((input: ToastInput): string => {
    const id = nextId();
    const tone = input.tone ?? "info";
    const duration = input.duration ?? DEFAULT_DURATIONS[tone];
    setToasts((prev) => {
      // Cap the visible stack at 4 entries so a misbehaving caller can't
      // bury the screen in notifications.
      const next = [...prev, { ...input, id, tone }];
      return next.length > 4 ? next.slice(next.length - 4) : next;
    });
    if (duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  // Clean up any pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    push,
    dismiss,
    success: (message, extra) => push({ tone: "success", message, ...extra }),
    error: (message, extra) => push({ tone: "danger", message, ...extra }),
    info: (message, extra) => push({ tone: "info", message, ...extra }),
    warning: (message, extra) => push({ tone: "warning", message, ...extra }),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used inside <ToastProvider>");
  }
  return ctx;
}

const toneStyles: Record<ToastTone, { container: string; icon: ReactNode }> = {
  info: {
    container: "border-blue/30 bg-surface text-ink",
    icon: <ToastIcon tone="info" />,
  },
  success: {
    container: "border-green/30 bg-surface text-ink",
    icon: <ToastIcon tone="success" />,
  },
  warning: {
    container: "border-amber/35 bg-surface text-ink",
    icon: <ToastIcon tone="warning" />,
  },
  danger: {
    container: "border-red/35 bg-surface text-ink",
    icon: <ToastIcon tone="danger" />,
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      // Bottom-center on mobile (above sticky form footer but below
      // ConfirmDialog), bottom-right on sm+. `pointer-events-none` on
      // the viewport so dead space doesn't intercept taps; each toast
      // re-enables pointer events for itself.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-safe-4 pt-2 sm:bottom-4 sm:left-auto sm:right-4 sm:items-end sm:pb-0"
      // Polite region so toasts don't interrupt active screen-reader
      // speech but are still announced when the user pauses.
      role="region"
      aria-label="Уведомления"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  const style = toneStyles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 shadow-card",
        "motion-safe:animate-fade-up",
        style.container,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          {toast.title ? <p className="text-base font-bold text-ink sm:text-sm">{toast.title}</p> : null}
          <p className="text-base leading-snug text-ink2 sm:text-sm">{toast.message}</p>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
              className="mt-2 inline-flex min-h-11 items-center rounded-md px-2.5 text-base font-semibold text-blue transition-colors hover:bg-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 active:scale-[0.98] sm:min-h-9 sm:px-2 sm:text-sm"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть уведомление"
          className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink3 transition-colors hover:bg-line2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 active:scale-95"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const colorClass =
    tone === "danger" ? "text-red"
      : tone === "warning" ? "text-amber"
      : tone === "success" ? "text-green"
      : "text-blue";
  if (tone === "success") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-5 w-5", colorClass)} aria-hidden="true">
        <path d="M10 1.667A8.333 8.333 0 1 0 18.333 10 8.343 8.343 0 0 0 10 1.667zm4.107 6.59-4.792 4.792a.833.833 0 0 1-1.178 0L5.893 10.804a.833.833 0 1 1 1.179-1.179l2.064 2.065 4.203-4.204a.833.833 0 1 1 1.178 1.179z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-5 w-5", colorClass)} aria-hidden="true">
      <path d="M10 1.667c-4.602 0-8.333 3.731-8.333 8.333S5.398 18.333 10 18.333 18.333 14.602 18.333 10 14.602 1.667 10 1.667zm0 5a.833.833 0 0 1 .833.833v3.333a.833.833 0 0 1-1.666 0V7.5A.833.833 0 0 1 10 6.667zm0 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
    </svg>
  );
}
