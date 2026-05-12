import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect, useId, useRef } from "react";
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

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-blue bg-blue text-white hover:bg-blue2 active:bg-blue",
  secondary: "border-line bg-surface text-ink2 hover:border-ink4 hover:bg-line2",
  ghost: "border-transparent bg-transparent text-ink3 hover:bg-line2 hover:text-ink",
  danger: "border-red/20 bg-red/5 text-red hover:bg-red/10",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
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
        "transition-[background-color,border-color,color,box-shadow] duration-150",
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
      {children}
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
      className={cn("h-9 w-9 px-0", className)}
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
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink3">
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder-ink4 shadow-none outline-none transition-[border-color,box-shadow] duration-150 focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed disabled:bg-line2 disabled:text-ink4";

export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <input
        id={inputId}
        className={cn(inputClassName, error ? "border-red focus:border-red focus:ring-red/20" : "")}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
        {...props}
      />
      {hint || error ? (
        <p id={descriptionId} className={cn("text-xs", error ? "text-red" : "text-ink3")}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
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
        {...props}
      />
      {hint || error ? (
        <p id={descriptionId} className={cn("text-xs", error ? "text-red" : "text-ink3")}>
          {error ?? hint}
        </p>
      ) : null}
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
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <select
        id={inputId}
        className={cn(inputClassName, "appearance-none", error ? "border-red focus:border-red focus:ring-red/20" : "")}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
        {...props}
      >
        {children}
      </select>
      {hint || error ? (
        <p id={descriptionId} className={cn("text-xs", error ? "text-red" : "text-ink3")}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  label,
  hint,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("flex min-h-10 items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-ink3", className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line text-blue focus:ring-2 focus:ring-blue/20 disabled:cursor-not-allowed"
        {...props}
      />
      <span className="min-w-0">
        <span className="font-semibold text-ink">{label}</span>
        {hint ? <span className="block text-xs text-ink3">{hint}</span> : null}
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
    <span className={cn("inline-flex min-h-6 items-center rounded-full px-2 text-xs font-semibold", badgeTone[tone], className)}>
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

export function Alert({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", alertTone[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-ink3">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={cn("rounded-lg border border-line bg-line2 animate-pulse", className)} />;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <div className="space-y-1.5">
      {label ? <p className="text-xs text-ink3">{label}</p> : null}
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
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 px-4 py-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
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
        className="w-full max-w-sm"
      >
        <Surface className="p-4">
          <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2>
          <p id={descriptionId} className="mt-2 text-sm text-ink3">{description}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
            <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
