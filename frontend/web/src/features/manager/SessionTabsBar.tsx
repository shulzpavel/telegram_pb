import { NavLink } from "react-router-dom";
import { SubnavBar, cn } from "../../design-system";

/**
 * Compact Управление / Отчёт switcher for the session header row.
 */
export function SessionTabsSegment({
  chatId,
  className,
  compact = false,
  stretch = false,
}: {
  chatId: number;
  className?: string;
  compact?: boolean;
  /** Full-width tabs with equal columns — use on the mobile header row. */
  stretch?: boolean;
}) {
  const tabs = [
    {
      to: `/cms/sessions/${chatId}/cockpit`,
      label: "Управление",
      end: true,
    },
    {
      to: `/cms/sessions/${chatId}/report`,
      label: "Отчёт",
      end: true,
    },
  ] as const;

  return (
    <nav
      aria-label="Разделы сессии"
      className={cn(
        "inline-flex shrink-0 rounded-md border border-line bg-line/40 p-0.5",
        stretch && "flex w-full",
        compact && "scale-[0.96] origin-left",
        className,
      )}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "rounded px-2 py-1 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40",
              stretch && "flex flex-1 basis-0 justify-center text-center",
              compact ? "px-1.5" : "sm:px-2.5",
              isActive ? "bg-surface text-ink shadow-sm" : "text-ink3 hover:text-ink",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Legacy full-width tab strip — kept for places that still need it.
 * Session detail screens use `SessionTabsSegment` inside `ManagerTopBar`.
 */
export function SessionTabsBar({
  chatId,
  className,
}: {
  chatId: number;
  className?: string;
}) {
  const tabs = [
    {
      to: `/cms/sessions/${chatId}/cockpit`,
      label: "Управление",
      end: true,
    },
    {
      to: `/cms/sessions/${chatId}/report`,
      label: "Отчёт",
      end: true,
    },
  ] as const;

  return (
    <SubnavBar aria-label="Разделы сессии" className={className}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "relative flex-1 basis-0 whitespace-nowrap px-3 py-2.5 text-center text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40",
              isActive ? "text-ink" : "text-ink3 hover:text-ink",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span>{tab.label}</span>
              {isActive ? (
                <span
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue"
                  aria-hidden="true"
                />
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </SubnavBar>
  );
}
