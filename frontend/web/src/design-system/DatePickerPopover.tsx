import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components";
import { cn } from "./utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function todayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTriggerDate(value: string | null | undefined): string {
  const parsed = parseDateValue(value);
  if (!parsed) return "не задан";
  return parsed.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function sameDay(left: Date | null, right: Date | null): boolean {
  return Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
  );
}

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function DatePickerPopover({
  value,
  disabled,
  loading,
  label = "Дата",
  placeholder = "не задан",
  reservePopoverSpace = true,
  className,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  placeholder?: string;
  reservePopoverSpace?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? todayDate());
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [popoverLayout, setPopoverLayout] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const today = useMemo(() => todayDate(), []);

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate]);

  const layoutPopover = useCallback(() => {
    const root = rootRef.current;
    const popover = popoverRef.current;
    if (!root || !popover) return;

    const margin = 8;
    const viewportWidth = window.innerWidth;
    const width = Math.min(352, viewportWidth - margin * 2);
    const triggerRect = root.getBoundingClientRect();
    let left = triggerRect.left;
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - width - margin);
    }

    const top = triggerRect.bottom + 8;
    setPopoverLayout({ left, top, width });
    setSpacerHeight(reservePopoverSpace ? popover.offsetHeight + 8 : 0);
  }, [reservePopoverSpace]);

  useEffect(() => {
    if (!open) {
      setSpacerHeight(0);
      setPopoverLayout(null);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      layoutPopover();
      if (reservePopoverSpace) {
        popoverRef.current?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
      }
    });

    window.addEventListener("resize", layoutPopover);
    window.addEventListener("scroll", layoutPopover, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", layoutPopover);
      window.removeEventListener("scroll", layoutPopover, true);
    };
  }, [layoutPopover, open, reservePopoverSpace, visibleMonth]);

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
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function shiftMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function selectDate(date: Date) {
    onChange(formatDateValue(date));
    setOpen(false);
  }

  const triggerText = selectedDate ? formatTriggerDate(value) : placeholder;

  return (
    <div ref={rootRef} className={cn("relative max-w-full", className)}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex max-w-full min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-left text-xs transition-colors",
          "hover:border-blue/40 hover:bg-line2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        <span className="text-ink3">{label}:</span>
        <span className={cn("font-semibold tabular-nums", selectedDate ? "text-ink" : "text-ink3")}>{triggerText}</span>
        <span className="text-ink4" aria-hidden="true">▾</span>
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
            "fixed z-50 rounded-2xl border border-line bg-surface p-3 shadow-xl sm:p-4",
            !popoverLayout && "pointer-events-none opacity-0"
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">{label}</p>
              <p className="mt-1 text-lg font-bold capitalize text-ink">{monthLabel(visibleMonth)}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink3 transition-colors hover:border-blue/40 hover:bg-line2 hover:text-ink"
                onClick={() => shiftMonth(-1)}
                aria-label="Предыдущий месяц"
              >
                ‹
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink3 transition-colors hover:border-blue/40 hover:bg-line2 hover:text-ink"
                onClick={() => shiftMonth(1)}
                aria-label="Следующий месяц"
              >
                ›
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink3">
                {weekday}
              </div>
            ))}
            {days.map((date) => {
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const selected = sameDay(date, selectedDate);
              const isToday = sameDay(date, today);
              return (
                <button
                  type="button"
                  key={formatDateValue(date)}
                  className={cn(
                    "relative flex h-9 items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-colors sm:h-11",
                    inMonth ? "text-ink" : "text-ink4",
                    "hover:bg-blue/10 hover:text-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
                    selected && "bg-blue text-white hover:bg-blue hover:text-white",
                    !selected && isToday && "ring-1 ring-blue/35"
                  )}
                  onClick={() => selectDate(date)}
                  aria-pressed={selected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs text-ink3">
              {selectedDate ? `Выбрано ${formatTriggerDate(value)}` : "Выберите день, чтобы сохранить дату"}
            </p>
            <Button size="sm" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => selectDate(today)}>
              Сегодня
            </Button>
          </div>
        </div>
      ) : null}
      {open && reservePopoverSpace ? <div aria-hidden="true" style={{ height: spacerHeight }} /> : null}
    </div>
  );
}
