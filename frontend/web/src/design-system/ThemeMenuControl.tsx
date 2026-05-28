import { ThemeToggle } from "./ThemeToggle";
import { cn } from "./utils";

type ThemeMenuControlProps = {
  className?: string;
};

/**
 * One visual pattern for theme switching inside mobile menus and bottom sheets.
 * Keep labels, spacing and the toggle variant here so all mobile menus change
 * together when the design-system treatment changes.
 */
export function ThemeMenuControl({ className }: ThemeMenuControlProps) {
  return (
    <div className={cn("rounded-lg border border-line bg-canvas/40 px-3 py-2", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink3">Тема интерфейса</p>
      <div className="mt-1">
        <ThemeToggle showTooltips={false} />
      </div>
    </div>
  );
}
