import { ListSkeleton } from "./components";
import { cn } from "./utils";

/**
 * Suspense fallback for route-level code splits. Looks like the page outline
 * on the canvas background so the user immediately understands "the screen
 * is on its way" rather than seeing a blank flash.
 */
export function PageLoader({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <main
      className={cn(
        "min-h-screen-mobile w-full app-gradient-bg",
        className,
      )}
      aria-busy="true"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10 lg:px-6">
        <div className="h-6 w-44 animate-pulse rounded bg-line2" aria-hidden="true" />
        <div className="h-4 w-64 animate-pulse rounded bg-line2" aria-hidden="true" />
        <ListSkeleton rows={rows} className="mt-4" />
      </div>
    </main>
  );
}
