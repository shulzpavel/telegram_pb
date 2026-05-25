import { forwardRef, type ButtonHTMLAttributes, type FocusEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect, useId, useRef } from "react";
import { cn } from "./utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function Surface({
  children,
  className,
  as = "div",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside" | "form";
} & HTMLAttributes<HTMLElement>) {
  const Component = as;
  return (
    <Component className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props}>
      {children}
    </Component>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-blue bg-blue text-white hover:bg-blue2 active:bg-blue",
  secondary: "border-line bg-surface text-ink2 hover:border-ink4 hover:bg-line2",
  ghost: "border-transparent bg-transparent text-ink3 hover:bg-line2 hover:text-ink",
  danger: "border-red/20 bg-red/5 text-red hover:bg-red/10",
  // Confirming a positive intent (apply / accept / save) — distinct from
  // `primary` to keep the destructive/positive distinction obvious in
  // bulk forms (Jira import "Apply selected", etc.).
  success: "border-green/30 bg-green/10 text-green hover:bg-green/15",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-base sm:min-h-9 sm:px-3 sm:text-sm",
  md: "min-h-12 px-4 text-base sm:min-h-11 sm:text-sm",
  lg: "min-h-[3.25rem] px-5 text-[1.0625rem] sm:min-h-12 sm:text-base",
};

export function Button({
  children,
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-semibold leading-none",
        // Transition only the visual properties so a tab/route change
        // doesn't reset the in-flight active scale animation. Native
        // mobile tap feedback via `active:scale-[0.98]` keeps within the
        // 150ms motion budget.
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
        "active:scale-[0.98] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}
      {/* While loading, fade the label so the spinner stays the focal
          point — text still occupies the same width to keep the button
          from snapping size mid-action.
          inline-flex + items-center keeps inline SVG icons vertically
          aligned with the label instead of sitting on the text baseline,
          so callers can pass `<Icon /> <span>label</span>` directly. */}
      <span className={cn("inline-flex min-w-0 items-center gap-2", loading ? "opacity-70" : undefined)}>{children}</span>
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      className={cn("h-11 w-11 px-0 sm:h-9 sm:w-9", className)}
      size="sm"
      variant="ghost"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink3 sm:text-xs">
      {children}
    </label>
  );
}

const inputClassName =
  "min-h-11 w-full scroll-mt-24 scroll-mb-40 rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder-ink4 shadow-none outline-none transition-[border-color,box-shadow] duration-150 focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed disabled:bg-line2 disabled:text-ink4 sm:min-h-10 sm:text-sm";

function keepFocusedFieldVisible(element: HTMLElement) {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroll = () => {
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };
  window.setTimeout(scroll, 80);
  window.setTimeout(scroll, 320);
}

function handleMobileFieldFocus<T extends HTMLElement>(
  event: FocusEvent<T>,
  onFocus?: (event: FocusEvent<T>) => void,
) {
  onFocus?.(event);
  keepFocusedFieldVisible(event.currentTarget);
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** When true (default), reserve a line of vertical space for the
   *  hint/error message even when it's empty. Prevents the form CTA
   *  from jumping the moment validation surfaces. Set to `false` on
   *  one-off fields where a stable layout isn't important. */
  reserveMessageSpace?: boolean;
};

export const TextField = forwardRef(function TextField(
  { label, hint, error, className, id, reserveMessageSpace = true, onFocus, ...props }: TextFieldProps,
  ref: Ref<HTMLInputElement>,
) {
  // Inline `useId` works inside forwardRef just like in regular function
  // components — keeps the existing label/aria-describedby wiring intact.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(inputClassName, error ? "border-red focus:border-red focus:ring-red/20" : "")}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
        onFocus={(event) => handleMobileFieldFocus(event, onFocus)}
        {...props}
      />
      <FieldMessage id={descriptionId} error={error} hint={hint} reserveSpace={reserveMessageSpace} />
    </div>
  );
});

/**
 * Hint/error pair under a form field. Keeps a stable bbox so the CTA
 * below the field doesn't jump when validation first appears — the
 * message itself fades in/out within the reserved row.
 */
function FieldMessage({
  id,
  hint,
  error,
  reserveSpace,
}: {
  id: string;
  hint?: ReactNode;
  error?: string | null;
  reserveSpace: boolean;
}) {
  const hasContent = Boolean(error) || hint != null;
  if (!hasContent && !reserveSpace) return null;
  return (
    <p
      id={id}
      role={error ? "alert" : undefined}
      aria-live={error ? "polite" : undefined}
      className={cn(
        "text-sm leading-snug transition-colors duration-150 sm:text-xs",
        reserveSpace ? "min-h-[1rem]" : undefined,
        error ? "text-red" : "text-ink3",
      )}
    >
      {error ?? hint ?? (reserveSpace ? "\u00a0" : null)}
    </p>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  id,
  reserveMessageSpace = true,
  onFocus,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  reserveMessageSpace?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <textarea
        id={inputId}
        className={cn(inputClassName, "min-h-24 resize-y", error ? "border-red focus:border-red focus:ring-red/20" : "")}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
        onFocus={(event) => handleMobileFieldFocus(event, onFocus)}
        {...props}
      />
      <FieldMessage id={descriptionId} error={error} hint={hint} reserveSpace={reserveMessageSpace} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  reserveMessageSpace = true,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  reserveMessageSpace?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      {/* `appearance-none` strips the native arrow on every platform —
          we render an explicit chevron so users always know this is a
          dropdown, not a plain text input. The native `<select>` still
          opens its OS picker on iOS/Android (best mobile UX), our SVG
          just provides the visual affordance. */}
      <div className="relative">
        <select
          id={inputId}
          className={cn(
            inputClassName,
            "appearance-none pr-9",
            error ? "border-red focus:border-red focus:ring-red/20" : "",
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hint || error ? descriptionId : undefined}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
      </div>
      <FieldMessage id={descriptionId} error={error} hint={hint} reserveSpace={reserveMessageSpace} />
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.5 8L10 12.5L14.5 8" />
    </svg>
  );
}

export function CheckboxField({
  label,
  hint,
  className,
  disabled,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label
      className={cn(
        // 44px tap target (WCAG 2.5.5). Hover/focus surface highlights
        // the whole label so the user can tap anywhere on the row.
        "flex min-h-12 cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-base text-ink3 sm:min-h-11 sm:px-2 sm:py-2 sm:text-sm",
        "transition-colors duration-150 hover:bg-line2 has-[input:focus-visible]:bg-line2",
        disabled ? "cursor-not-allowed opacity-60" : undefined,
        className,
      )}
    >
      <input
        type="checkbox"
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed"
        {...props}
      />
      <span className="min-w-0">
        <span className="font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm text-ink3 sm:text-xs">{hint}</span> : null}
      </span>
    </label>
  );
}

const badgeTone: Record<Tone, string> = {
  neutral: "bg-line2 text-ink3",
  info: "bg-blue/10 text-blue",
  success: "bg-green/10 text-green",
  warning: "bg-amber/10 text-amber",
  danger: "bg-red/10 text-red",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 text-sm font-semibold sm:min-h-6 sm:px-2 sm:text-xs", badgeTone[tone], className)}>
      {children}
    </span>
  );
}

const alertTone: Record<Tone, string> = {
  neutral: "border-line bg-line2 text-ink2",
  info: "border-blue/20 bg-blue/5 text-blue",
  success: "border-green/20 bg-green/5 text-green",
  warning: "border-amber/25 bg-amber/10 text-amber",
  danger: "border-red/20 bg-red/5 text-red",
};

function AlertIcon({ tone }: { tone: Tone }) {
  const common = "h-4 w-4 shrink-0";
  if (tone === "danger" || tone === "warning") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <path d="M10 1.667c-4.602 0-8.333 3.731-8.333 8.333S5.398 18.333 10 18.333 18.333 14.602 18.333 10 14.602 1.667 10 1.667zm0 5a.833.833 0 0 1 .833.833v3.333a.833.833 0 0 1-1.666 0V7.5A.833.833 0 0 1 10 6.667zm0 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
      </svg>
    );
  }
  if (tone === "success") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
        <path d="M10 1.667A8.333 8.333 0 1 0 18.333 10 8.343 8.343 0 0 0 10 1.667zm4.107 6.59-4.792 4.792a.833.833 0 0 1-1.178 0L5.893 10.804a.833.833 0 1 1 1.179-1.179l2.064 2.065 4.203-4.204a.833.833 0 1 1 1.178 1.179z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-hidden="true">
      <path d="M10 1.667A8.333 8.333 0 1 0 18.333 10 8.343 8.343 0 0 0 10 1.667zM10 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm.833 9.167a.833.833 0 0 1-1.666 0V9.167a.833.833 0 0 1 1.666 0z" />
    </svg>
  );
}

export function Alert({
  children,
  tone = "neutral",
  className,
  title,
  onDismiss,
  icon = true,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: ReactNode;
  /** When provided, renders an X close button on the right. */
  onDismiss?: () => void;
  /** Set to `false` to hide the leading tone icon (for compact contexts). */
  icon?: boolean;
}) {
  // role="alert" / aria-live="assertive" only for actionable errors so
  // screen-readers don't shout decorative status messages. Polite
  // updates are still surfaced via aria-live="polite".
  const isAssertive = tone === "danger";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-base font-medium sm:py-2 sm:text-sm",
        alertTone[tone],
        className,
      )}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
    >
      {icon ? <span className="mt-0.5"><AlertIcon tone={tone} /></span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-0.5 font-bold">{title}</p> : null}
        <div className="leading-snug">{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть"
          className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 active:scale-95"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
      <p className="text-base font-semibold text-ink sm:text-sm">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-base text-ink3 sm:text-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={cn("rounded-lg border border-line bg-line2 animate-pulse", className)} />;
}

/**
 * Single placeholder card — used as the building block of `ListSkeleton`.
 * Renders an optional avatar circle and a stack of pulsing text lines whose
 * widths alternate to mimic the rhythm of real list items.
 */
export function RowSkeleton({
  lines = 2,
  dense = false,
  withAvatar = false,
  className,
}: {
  lines?: number;
  dense?: boolean;
  withAvatar?: boolean;
  className?: string;
}) {
  const safeLines = Math.max(1, Math.min(lines, 4));
  const lineWidths = ["w-3/4", "w-1/2", "w-2/3", "w-1/3"];
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex items-center gap-3 rounded-lg border border-line bg-surface",
        dense ? "px-3 py-2" : "px-4 py-3",
        className,
      )}
    >
      {withAvatar ? (
        <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-line2" />
      ) : null}
      <div className="flex-1 space-y-2">
        {Array.from({ length: safeLines }).map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "block h-2.5 animate-pulse rounded bg-line2",
              lineWidths[idx % lineWidths.length],
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Vertical stack of `RowSkeleton`s — primary placeholder for any list while
 * the first page is loading. Keep `rows` in proportion to the expected page
 * size so the layout doesn't jump when real data arrives.
 */
export function ListSkeleton({
  rows = 6,
  lines = 2,
  dense = false,
  withAvatar = false,
  className,
}: {
  rows?: number;
  lines?: number;
  dense?: boolean;
  withAvatar?: boolean;
  className?: string;
}) {
  const safeRows = Math.max(1, Math.min(rows, 24));
  return (
    <div className={cn("space-y-2", className)} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Загрузка списка</span>
      {Array.from({ length: safeRows }).map((_, idx) => (
        <RowSkeleton key={idx} lines={lines} dense={dense} withAvatar={withAvatar} />
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <div className="space-y-1.5">
      {label ? <p className="text-sm text-ink3 sm:text-xs">{label}</p> : null}
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(normalized * 100)}>
        <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${normalized * 100}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-6 w-6";
  return <span className={cn("inline-block rounded-full border-2 border-current/25 border-t-current animate-spin", sizeClass)} aria-hidden="true" />;
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:240ms]" />
    </span>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  /** Disable both actions and show a spinner on the primary CTA while
   *  an async confirmation is in flight (e.g. delete network call). */
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const focusFirst = () => {
      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
      (focusables[0] ?? dialogRef.current)?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
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
    // Lock the underlying scroll so the page behind the dialog doesn't
    // shift on iOS when the user drags inside the bottom sheet. The
    // padding compensation keeps the layout stable when the scrollbar
    // disappears on desktop browsers that show one.
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

  if (!open) return null;
  return (
    <div
      // Bottom-sheet on mobile (items-end + pb-safe-4 keeps it above the
      // iOS home indicator), centered on sm+. Backdrop catches both
      // mouse and touch so taps outside the sheet always close it.
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-safe-4 pt-safe backdrop-blur-sm motion-safe:animate-fade-up sm:items-center sm:py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (busy) return;
        if (event.target === event.currentTarget) onCancel();
      }}
      onTouchEnd={(event) => {
        if (busy) return;
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          "w-full max-w-sm outline-none",
          // Subtle scale-in keeps the dialog from popping. Backdrop
          // fades alongside via animate-fade-up on the parent overlay.
          "motion-safe:animate-scale-in",
        )}
      >
        <Surface className="p-5">
          <h2 id={titleId} className="text-lg font-bold text-ink sm:text-base">{title}</h2>
          <div id={descriptionId} className="mt-2 text-base leading-snug text-ink3 sm:text-sm">{description}</div>
          {/* Stack buttons full-width on the smallest viewports so labels
              never wrap or overflow; switch to inline on sm+ where the
              dialog is centered and there's enough horizontal room. */}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onCancel} disabled={busy} className="sm:w-auto">
              {cancelLabel}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={onConfirm}
              loading={busy}
              disabled={busy || confirmDisabled}
              className="sm:w-auto"
            >
              {confirmLabel}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
