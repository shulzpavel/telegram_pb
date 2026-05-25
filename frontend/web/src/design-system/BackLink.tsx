import type { MouseEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { cn } from "./utils";

export interface BackLinkProps {
  /** Куда вернуться. Если задано — компонент рендерит <Link>. */
  to?: string;
  /** Лейбл, например «К списку сессий» / «Назад». */
  label: ReactNode;
  /** Если `to` не задан — назад через history; fallback используется, когда
   *  history пустая (страница открыта прямой ссылкой). */
  fallbackTo?: string;
  /** Скрыть/показать стрелку (по умолчанию true). */
  showArrow?: boolean;
  /** Дополнительные классы. */
  className?: string;
  size?: "sm" | "md";
}

const sizeStyles: Record<NonNullable<BackLinkProps["size"]>, string> = {
  sm: "min-h-9 text-xs",
  md: "min-h-10 text-sm",
};

const baseClass = cn(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5",
  "font-semibold text-ink3 hover:text-ink hover:bg-line2",
  "transition-[color,background-color] duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
);

/**
 * Decide where the back-link should navigate when clicked.
 *
 * - `to` is an explicit destination → render a real `<Link to={to}>`.
 * - No `to` and we *have* prior history (router has navigated at least once
 *   within the app) → `navigate(-1)` brings the user to the previous page.
 * - No `to` and no usable history (page opened via a direct URL / new tab)
 *   → fall back to `fallbackTo`. If both are missing we land on `/`.
 *
 * Exported separately so the decision is easy to unit-test without rendering.
 */
export type BackTarget =
  | { kind: "link"; to: string }
  | { kind: "history-back" }
  | { kind: "fallback"; to: string };

export function resolveBackTarget(input: {
  to?: string;
  fallbackTo?: string;
  /** `useLocation().key` — React Router sets this to `"default"` on first
   *  render when there is no prior in-app navigation. Any other value means
   *  the user actually arrived via a router navigation. */
  locationKey: string;
}): BackTarget {
  if (input.to !== undefined) {
    return { kind: "link", to: input.to };
  }
  if (input.locationKey && input.locationKey !== "default") {
    return { kind: "history-back" };
  }
  return { kind: "fallback", to: input.fallbackTo ?? "/" };
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4l-6 6 6 6" />
      <path d="M5 10h12" />
    </svg>
  );
}

export function BackLink({
  to,
  label,
  fallbackTo,
  showArrow = true,
  className,
  size = "md",
}: BackLinkProps) {
  const navigate = useNavigate();
  const location = useLocation() as Location;
  const target = resolveBackTarget({ to, fallbackTo, locationKey: location.key ?? "default" });
  const classes = cn(baseClass, sizeStyles[size], className);

  if (target.kind === "link") {
    return (
      <Link to={target.to} className={classes}>
        {showArrow ? <ArrowIcon /> : null}
        <span>{label}</span>
      </Link>
    );
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.defaultPrevented) return;
    if (target.kind === "history-back") {
      navigate(-1);
      return;
    }
    navigate(target.to);
  }

  return (
    <button type="button" onClick={handleClick} className={classes}>
      {showArrow ? <ArrowIcon /> : null}
      <span>{label}</span>
    </button>
  );
}
