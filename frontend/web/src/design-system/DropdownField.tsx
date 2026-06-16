import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { FieldLabel } from "./components";
import { cn } from "./utils";

export interface DropdownOption {
  value: string;
  label: ReactNode;
  searchText?: string;
  hint?: ReactNode;
  disabled?: boolean;
}

interface DropdownFieldProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  reserveMessageSpace?: boolean;
}

function optionText(option: DropdownOption): string {
  if (option.searchText) return option.searchText;
  if (typeof option.label === "string" || typeof option.label === "number") return String(option.label);
  return option.value;
}

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 10.5L8 14L15.5 6" />
    </svg>
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

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="9" cy="9" r="5.25" />
      <path d="M13 13L16 16" />
    </svg>
  );
}

export function DropdownField({
  value,
  options,
  onChange,
  label,
  hint,
  error,
  placeholder = "Выберите значение",
  searchPlaceholder = "Поиск...",
  emptyLabel = "Ничего не найдено",
  disabled,
  required,
  searchable,
  className,
  id,
  "aria-label": ariaLabel,
  reserveMessageSpace = true,
}: DropdownFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<string | null>(value || null);
  const [popoverLayout, setPopoverLayout] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => optionText(option).toLowerCase().includes(normalizedQuery));
  }, [options, query]);
  const enabledOptions = useMemo(() => filteredOptions.filter((option) => !option.disabled), [filteredOptions]);

  const layoutPopover = useCallback(() => {
    const root = rootRef.current;
    const popover = popoverRef.current;
    if (!root || !popover) return;

    const margin = 8;
    const viewportWidth = window.innerWidth;
    const triggerRect = root.getBoundingClientRect();
    const width = Math.min(Math.max(triggerRect.width, 280), viewportWidth - margin * 2);
    let left = triggerRect.left;
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - width - margin);
    }

    setPopoverLayout({ left, top: triggerRect.bottom + 8, width });
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPopoverLayout(null);
      return;
    }

    const initialActive = filteredOptions.some((option) => option.value === value && !option.disabled)
      ? value
      : enabledOptions[0]?.value ?? null;
    setActiveValue(initialActive);

    const frame = window.requestAnimationFrame(() => {
      layoutPopover();
      if (searchable) {
        searchRef.current?.focus();
      } else if (initialActive) {
        optionRefs.current.get(initialActive)?.focus();
      }
    });

    window.addEventListener("resize", layoutPopover);
    window.addEventListener("scroll", layoutPopover, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", layoutPopover);
      window.removeEventListener("scroll", layoutPopover, true);
    };
  }, [enabledOptions, filteredOptions, layoutPopover, open, searchable, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeValue) return;
    optionRefs.current.get(activeValue)?.scrollIntoView({ block: "nearest" });
  }, [activeValue, open]);

  function selectValue(nextValue: string) {
    const option = options.find((item) => item.value === nextValue);
    if (!option || option.disabled) return;
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(delta: number) {
    if (enabledOptions.length === 0) return;
    const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + enabledOptions.length) % enabledOptions.length;
    setActiveValue(enabledOptions[nextIndex].value);
  }

  function handleControlKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(-1);
    } else if (event.key === "Enter" && open && activeValue) {
      event.preventDefault();
      selectValue(activeValue);
    }
  }

  return (
    <div ref={rootRef} className={cn("space-y-1.5", className)}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={hint || error ? descriptionId : undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-required={required || undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleControlKeyDown}
        className={cn(
          "group flex min-h-11 w-full scroll-mt-24 scroll-mb-40 items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-base text-ink shadow-none outline-none",
          "transition-[border-color,box-shadow,background-color] duration-150 hover:border-blue/50 hover:shadow-card",
          "focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/20 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:bg-line2 disabled:text-ink4 disabled:opacity-60 sm:min-h-10 sm:text-sm",
          error ? "border-red focus-visible:border-red focus-visible:ring-red/20" : undefined,
        )}
      >
        <span className={cn("min-w-0 truncate", selectedOption ? "text-ink" : "text-ink4")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink3 transition-colors group-hover:border-blue/40 group-hover:text-blue">
          <ChevronDownIcon className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : undefined)} />
        </span>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          style={
            popoverLayout
              ? { left: popoverLayout.left, top: popoverLayout.top, width: popoverLayout.width }
              : undefined
          }
          className={cn(
            "fixed z-50 rounded-2xl border border-line bg-surface p-2 shadow-xl",
            !popoverLayout && "pointer-events-none opacity-0",
          )}
          onKeyDown={handleControlKeyDown}
        >
          {searchable ? (
            <div className="relative mb-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink4" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  window.requestAnimationFrame(layoutPopover);
                }}
                placeholder={searchPlaceholder}
                className="min-h-10 w-full rounded-lg border border-line bg-bg/70 py-2 pl-9 pr-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink4 focus:border-blue focus:ring-2 focus:ring-blue/20"
              />
            </div>
          ) : null}

          <div id={listboxId} role="listbox" aria-labelledby={inputId} className="max-h-72 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                const active = option.value === activeValue;
                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      if (node) {
                        optionRefs.current.set(option.value, node);
                      } else {
                        optionRefs.current.delete(option.value);
                      }
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onMouseEnter={() => {
                      if (!option.disabled) setActiveValue(option.value);
                    }}
                    onClick={() => selectValue(option.value)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/25",
                      selected ? "bg-blue/10 text-blue" : "text-ink hover:bg-line2",
                      active && !selected ? "bg-line2" : undefined,
                      option.disabled ? "cursor-not-allowed text-ink4 opacity-60 hover:bg-transparent" : undefined,
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{option.label}</span>
                      {option.hint ? <span className="mt-0.5 block text-xs text-ink3">{option.hint}</span> : null}
                    </span>
                    {selected ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-ink3">{emptyLabel}</p>
            )}
          </div>
        </div>
      ) : null}
      <FieldMessage id={descriptionId} error={error} hint={hint} reserveSpace={reserveMessageSpace} />
    </div>
  );
}
