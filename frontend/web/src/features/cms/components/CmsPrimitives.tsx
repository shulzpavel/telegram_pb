import type { ReactNode } from "react";
import { Alert, Badge, Button, EmptyState, Skeleton as DsSkeleton, Spinner } from "../../../design-system";

export function DataTable({
  columns,
  children,
  mobileCards,
  empty,
  loading,
  error,
  hasMore,
  onMore,
}: {
  columns: string[];
  children: ReactNode;
  mobileCards?: ReactNode;
  empty?: ReactNode;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onMore: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface overflow-hidden shadow-card">
      {error ? <div className="p-3"><InlineError text={error} /></div> : null}
      {empty ? <div className="p-3">{empty}</div> : null}
      {mobileCards ? (
        <div className="divide-y divide-line md:hidden">
          {mobileCards}
        </div>
      ) : null}
      <div className={mobileCards ? "hidden overflow-auto md:block" : "overflow-auto"}>
        <table className="min-w-full text-sm">
          <thead className="bg-line2 text-xs uppercase text-ink3">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left font-bold whitespace-nowrap">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <div className="border-t border-line px-3 py-2 flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-xs text-ink3">
          {loading ? <Spinner size="sm" /> : null}
          {loading ? "Loading" : hasMore ? "More rows available" : "End"}
        </p>
        <Button variant="ghost" size="sm" onClick={onMore} disabled={loading || !hasMore}>Load more</Button>
      </div>
    </div>
  );
}

export function CompactList({
  children,
  loading,
  error,
  hasMore,
  onMore,
}: {
  children: ReactNode;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onMore: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 shadow-card">
      {error ? <InlineError text={error} /> : null}
      {children}
      <div className="py-2 flex items-center justify-between gap-3 border-t border-line">
        <p className="inline-flex items-center gap-2 text-xs text-ink3">
          {loading ? <Spinner size="sm" /> : null}
          {loading ? "Loading" : hasMore ? "More rows available" : "End"}
        </p>
        <Button variant="ghost" size="sm" onClick={onMore} disabled={loading || !hasMore}>More</Button>
      </div>
    </div>
  );
}

export function MobileRecordCard({
  title,
  meta,
  children,
  action,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink">{title}</div>
          {meta ? <div className="mt-1 text-xs text-ink3">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink3">
        {children}
      </div>
    </article>
  );
}

export function MobileRecordField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-ink4">{label}</p>
      <div className="mt-0.5 truncate text-ink2">{value}</div>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col md:flex-row md:items-center gap-2">{children}</div>;
}

export function Status({ active, done, label }: { active: boolean; done?: boolean; label?: string }) {
  const text = label ?? (done ? "done" : active ? "active" : "inactive");
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
    <main className="min-h-dvh bg-canvas flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink3">
        <Spinner size="sm" />
        <span>{text}</span>
      </div>
    </main>
  );
}

export { EmptyState };
