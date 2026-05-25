import { motion, useReducedMotion } from "framer-motion";
import { useId, type SVGProps } from "react";
import { cn } from "./utils";
import { useTheme, type ThemeMode } from "./theme";

type Size = "sm" | "md";
type Tone = "ghost" | "surface";

interface ThemeToggleProps {
  className?: string;
  size?: Size;
  tone?: Tone;
}

interface Option {
  value: ThemeMode;
  label: string;
  description: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
}

const OPTIONS: Option[] = [
  { value: "light",  label: "Светлая",  description: "Светлая тема",  Icon: SunIcon },
  { value: "system", label: "Системная", description: "Системная тема", Icon: SystemIcon },
  { value: "dark",   label: "Тёмная",   description: "Тёмная тема",   Icon: MoonIcon },
];

const sizeClasses: Record<Size, { wrap: string; option: string; icon: string }> = {
  sm: {
    wrap:   "h-11 p-1 rounded-full gap-1 sm:h-7 sm:p-0.5 sm:gap-0.5",
    option: "h-9 w-9 rounded-full sm:h-6 sm:w-6",
    icon:   "h-5 w-5 sm:h-3.5 sm:w-3.5",
  },
  md: {
    wrap:   "h-12 p-1 rounded-full gap-1 sm:h-8 sm:p-0.5 sm:gap-0.5",
    option: "h-10 w-10 rounded-full sm:h-7 sm:w-7",
    icon:   "h-5 w-5 sm:h-4 sm:w-4",
  },
};

const toneWrapClasses: Record<Tone, string> = {
  ghost:   "bg-surface/65 border border-line/60 shadow-card backdrop-blur-md",
  surface: "bg-surface/90 border border-line shadow-card backdrop-blur-md",
};

export function ThemeToggle({ className, size = "sm", tone = "ghost" }: ThemeToggleProps) {
  const { mode, setMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const groupId = useId();

  const sizes = sizeClasses[size];

  return (
    <div
      role="radiogroup"
      aria-label="Тема оформления"
      className={cn(
        "inline-flex items-center select-none",
        sizes.wrap,
        toneWrapClasses[tone],
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = mode === option.value;
        const optionId = `${groupId}-${option.value}`;
        return (
          <button
            key={option.value}
            id={optionId}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.description}
            title={option.description}
            tabIndex={active ? 0 : -1}
            onClick={() => setMode(option.value)}
            className={cn(
              "relative inline-flex items-center justify-center font-semibold leading-none",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              sizes.option,
              active ? "text-ink" : "text-ink3 hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`theme-toggle-thumb-${groupId}`}
                aria-hidden
                transition={{ type: "spring", stiffness: 380, damping: 30, duration: reduceMotion ? 0 : undefined }}
                className="absolute inset-0 rounded-full bg-elevated shadow-card border border-line/60"
              />
            ) : null}
            <span className="relative inline-flex items-center justify-center">
              <option.Icon className={cn(sizes.icon, "shrink-0")} aria-hidden />
              <span className="sr-only">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
    </svg>
  );
}

function SystemIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </svg>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.5 14.5A8 8 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11Z" />
    </svg>
  );
}

export default ThemeToggle;
