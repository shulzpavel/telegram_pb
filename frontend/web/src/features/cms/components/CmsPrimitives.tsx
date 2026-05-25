import type { ReactNode } from "react";
import { Alert, Badge, Button, EmptyState, ListSkeleton, Skeleton as DsSkeleton, Spinner } from "../../../design-system";

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mx-auto flex w-full max-w-4xl flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink sm:text-lg">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-snug text-ink3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function HelpCallout({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="mx-auto w-full max-w-3xl rounded-lg border border-line bg-line2/30 p-3 text-sm text-ink2 sm:p-4">
      {title ? <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink3">{title}</p> : null}
      <div className="space-y-1">{children}</div>
    </aside>
  );
}

/**
 * Footer for list views with progressive loading. Renders one of three
 * states:
 *  - reachedCap: soft-cap hint with optional search-focus shortcut.
 *  - hasMore: "Показать ещё" button + counter.
 *  - exhausted: muted "Это всё" caption.
 *
 * Accepts both `loading` (first-load) and `loadingMore` (in-flight next
 * page) so the button can disable itself appropriately and the caption can
 * surface progress without blocking the entire list.
 */
export function LoadMoreFooter({
  loading,
  loadingMore = false,
  hasMore,
  reachedCap = false,
  loadedCount,
  total,
  onMore,
  onFocusSearch,
  itemNoun = "записей",
  variant = "table",
}: {
  loading: boolean;
  loadingMore?: boolean;
  hasMore: boolean;
  reachedCap?: boolean;
  loadedCount: number;
  total?: number | null;
  onMore: () => void;
  onFocusSearch?: () => void;
  itemNoun?: string;
  variant?: "table" | "compact";
}) {
  const wrapperClass =
    variant === "compact"
      ? "border-t border-line py-2 px-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      : "border-t border-line px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between";

  if (reachedCap) {
    return (
      <div className={wrapperClass}>
        <p className="text-xs text-ink2">
          Показано {loadedCount} {itemNoun}. Уточните поиск или фильтры, чтобы найти нужное.
        </p>
        {onFocusSearch ? (
          <Button variant="ghost" size="sm" onClick={onFocusSearch}>К поиску</Button>
        ) : null}
      </div>
    );
  }

  const counter = total != null ? `${loadedCount} из ${total}` : `${loadedCount}`;
  return (
    <div className={wrapperClass}>
      <p className="inline-flex items-center gap-2 text-xs text-ink3">
        {loading || loadingMore ? <Spinner size="sm" /> : null}
        {loading
          ? "Загрузка"
          : loadingMore
          ? `Загружаем следующую страницу · ${counter}`
          : hasMore
          ? `Показано ${counter}`
          : `Это всё · ${counter}`}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onMore}
        disabled={loading || loadingMore || !hasMore}
        loading={loadingMore}
      >
        Показать ещё
      </Button>
    </div>
  );
}

export function DataTable({
  columns,
  children,
  mobileCards,
  empty,
  loading,
  loadingMore = false,
  error,
  hasMore,
  reachedCap = false,
  loadedCount,
  total,
  onMore,
  onFocusSearch,
  itemNoun,
  showSkeleton = true,
}: {
  columns: string[];
  children: ReactNode;
  mobileCards?: ReactNode;
  empty?: ReactNode;
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap?: boolean;
  loadedCount: number;
  total?: number | null;
  onMore: () => void;
  onFocusSearch?: () => void;
  itemNoun?: string;
  /**
   * When `true` (default) the table renders a list skeleton during the
   * initial load (loading && loadedCount === 0) instead of the regular
   * empty body. Pages that prefer their own placeholder can opt out.
   */
  showSkeleton?: boolean;
}) {
  const showInitialSkeleton = showSkeleton && loading && loadedCount === 0;
  // Desktop tables flex to the container and break long cells (`break-words`
  // on <td> in callers); we keep `overflow-x-auto` only at the wrapper as a
  // safety valve for genuinely wide tables — but our column setup is sized
  // to fit comfortably inside the 7xl content area at md+ without scrolling.
  return (
    <div className="w-full rounded-lg border border-line bg-surface overflow-hidden shadow-card">
      {error ? <div className="p-3"><InlineError text={error} /></div> : null}
      {showInitialSkeleton ? (
        <div className="p-3">
          <ListSkeleton rows={6} />
        </div>
      ) : null}
      {!showInitialSkeleton && empty ? <div className="p-3">{empty}</div> : null}
      {!showInitialSkeleton && mobileCards ? (
        <div className="flex flex-col gap-3 bg-canvas p-3 md:hidden">
          {mobileCards}
        </div>
      ) : null}
      {!showInitialSkeleton ? (
        <div className={mobileCards ? "hidden md:block" : "block"}>
          <table className="w-full table-auto text-sm">
            <thead className="bg-line2 text-xs uppercase text-ink3">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 text-left font-bold align-bottom">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : null}
      <LoadMoreFooter
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        reachedCap={reachedCap}
        loadedCount={loadedCount}
        total={total}
        onMore={onMore}
        onFocusSearch={onFocusSearch}
        itemNoun={itemNoun}
      />
    </div>
  );
}

export function CompactList({
  children,
  loading,
  loadingMore = false,
  error,
  hasMore,
  reachedCap = false,
  loadedCount,
  total,
  onMore,
  onFocusSearch,
  itemNoun,
}: {
  children: ReactNode;
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap?: boolean;
  loadedCount: number;
  total?: number | null;
  onMore: () => void;
  onFocusSearch?: () => void;
  itemNoun?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 shadow-card">
      {error ? <InlineError text={error} /> : null}
      {loading && loadedCount === 0 ? (
        <div className="py-3"><ListSkeleton rows={3} dense /></div>
      ) : (
        children
      )}
      <LoadMoreFooter
        variant="compact"
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        reachedCap={reachedCap}
        loadedCount={loadedCount}
        total={total}
        onMore={onMore}
        onFocusSearch={onFocusSearch}
        itemNoun={itemNoun}
      />
    </div>
  );
}

export function MobileRecordCard({
  title,
  meta,
  children,
  action,
  footer,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Optional row of full-width controls — typically Buttons. Rendered below
   *  the stat grid with a top border so it visually separates from data. */
  footer?: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-ink break-words">{title}</div>
          {meta ? <div className="mt-1 text-xs text-ink3">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink3">
          {children}
        </div>
      ) : null}
      {footer ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {footer}
        </div>
      ) : null}
    </article>
  );
}

export function MobileRecordField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-ink4">{label}</p>
      <div className="mt-0.5 whitespace-normal break-words text-ink2">{value}</div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 md:flex-row md:items-center">{children}</div>;
}

export function Status({ active, done, label }: { active: boolean; done?: boolean; label?: string }) {
  const text = label ?? (done ? "завершена" : active ? "идёт" : "неактивна");
  const tone = active && !done ? "success" : done ? "info" : "neutral";
  return <Badge tone={tone}>{text}</Badge>;
}

export function InlineError({ text }: { text: string }) {
  return <Alert tone="danger">{text}</Alert>;
}

export function Skeleton({ height }: { height: string }) {
  return <DsSkeleton className={height} />;
}

export function Centered({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen-mobile items-center justify-center app-gradient-bg py-safe">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink3">
        <Spinner size="sm" />
        <span>{text}</span>
      </div>
    </main>
  );
}

export { EmptyState };
