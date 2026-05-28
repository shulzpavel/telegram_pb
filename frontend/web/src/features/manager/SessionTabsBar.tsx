import { NavLink } from "react-router-dom";
import { SubnavBar, cn } from "../../design-system";

/**
 * Tabbed sub-navigation shown under the page header on every session
 * detail screen (cockpit + report). The two screens conceptually
 * belong to the same "session detail" — exposing them as tabs makes
 * the relationship obvious in the UI and removes the surprise jump
 * between `/cockpit` and `/report` URLs.
 *
 * Lives outside `ManagerTopBar` so each page composes its own header
 * + tabs combo without coupling header layout to routing.
 *
 * Mobile behaviour:
 *  - Horizontal scroll fallback when tab labels don't fit.
 *  - Bottom border + active-bar pattern mirrors the CMS tab-strip,
 *    so users see the same affordance across the entire app.
 *
 * Accessibility:
 *  - `aria-current="page"` (implicit via NavLink) is enough; we don't
 *    fake an ARIA tab pattern because each tab is its own route, not
 *    a panel inside the same document.
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
      // Active for the cockpit URL; an empty `/cms/sessions/:id`
      // (index) also routes to cockpit so we keep one signal.
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
                isActive
                  ? "text-ink"
                  : "text-ink3 hover:text-ink",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span>{tab.label}</span>
                {/* Active bar sits flush with the parent's bottom
                    border so swapping tabs feels like sliding rather
                    than re-painting the whole strip. */}
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
