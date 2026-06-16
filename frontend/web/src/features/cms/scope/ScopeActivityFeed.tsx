import { useMemo } from "react";
import type { ScopeBoardSnapshot, ScopeRefreshEvent, ScopeRefreshLogEntry } from "../api/cmsClient";
import { useIncrementalList } from "./scopeListPaging";
import { ScopeIncrementalFooter } from "./ScopeIncrementalFooter";

function formatFeedTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function eventTone(type: string): string {
  switch (type) {
    case "added":
      return "bg-blue/5";
    case "removed":
      return "bg-line2/40";
    case "sp_changed":
      return "bg-amber/5";
    case "summary":
      return "bg-emerald-500/5";
    case "baseline":
      return "bg-line2/30";
    default:
      return "bg-surface";
  }
}

function EventRow({ event }: { event: ScopeRefreshEvent }) {
  const when = event.at ? formatFeedTime(event.at) : null;
  return (
    <li className={`rounded-xl px-4 py-3 text-sm ${eventTone(event.type)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-ink2">{event.message}</p>
        {when ? <span className="text-xs text-ink3">{when}</span> : null}
      </div>
      {event.summary && event.key ? (
        <p className="mt-0.5 truncate text-xs text-ink3">{event.key}: {event.summary}</p>
      ) : null}
    </li>
  );
}

function PaginatedEventList({ events }: { events: ScopeRefreshEvent[] }) {
  const { visibleItems, hasMore, loadMore, loadedCount, total } = useIncrementalList(events);

  if (events.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="space-y-2">
        {visibleItems.map((event, index) => (
          <EventRow key={`${event.type}-${event.key ?? index}-${event.at ?? index}`} event={event} />
        ))}
      </ul>
      <ScopeIncrementalFooter
        loadedCount={loadedCount}
        total={total}
        hasMore={hasMore}
        onMore={loadMore}
        itemNoun="событий"
      />
    </>
  );
}

function HistoryLogEntry({ entry }: { entry: ScopeRefreshLogEntry }) {
  const events = entry.events ?? [];

  return (
    <li className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink3">{formatFeedTime(entry.at)}</p>
      <PaginatedEventList events={events} />
    </li>
  );
}

export function ScopeActivityFeed({ snapshot }: { snapshot: ScopeBoardSnapshot }) {
  const log = snapshot.refresh_log ?? [];
  const latestEvents = snapshot.events ?? [];
  const historyEntries = useMemo(() => (log.length > 1 ? log.slice(1) : []), [log]);
  const {
    visibleItems: visibleHistory,
    hasMore: hasMoreHistory,
    loadMore: loadMoreHistory,
    loadedCount: loadedHistoryCount,
    total: historyTotal,
  } = useIncrementalList(historyEntries);
  const hasHistory = log.length > 0;

  if (!hasHistory && latestEvents.length === 0) {
    return null;
  }

  return (
    <details className="scope-collapsible-card group overflow-hidden rounded-lg bg-surface">
      <summary className="scope-section-header flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
        <div>
          <h3 className="text-base font-semibold text-ink">Что изменилось</h3>
          <p className="scope-section-header-subtitle mt-1 text-sm">Обновлено {formatFeedTime(snapshot.refreshed_at)}</p>
        </div>
        <span className="scope-section-header-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
          </svg>
        </span>
      </summary>

      <div className="space-y-5 p-4 sm:p-6 lg:p-7">
        {latestEvents.length > 0 ? <PaginatedEventList events={latestEvents} /> : null}

        {historyEntries.length > 0 ? (
          <details className="group rounded-2xl bg-bg/70 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:content-none">
              <span className="group-open:hidden">История обновлений ({historyEntries.length})</span>
              <span className="hidden group-open:inline">Скрыть историю</span>
            </summary>
            <ul className="mt-3 space-y-3">
              {visibleHistory.map((entry) => (
                <HistoryLogEntry key={entry.at} entry={entry} />
              ))}
            </ul>
            <ScopeIncrementalFooter
              loadedCount={loadedHistoryCount}
              total={historyTotal}
              hasMore={hasMoreHistory}
              onMore={loadMoreHistory}
              itemNoun="обновлений"
            />
          </details>
        ) : null}
      </div>
    </details>
  );
}
