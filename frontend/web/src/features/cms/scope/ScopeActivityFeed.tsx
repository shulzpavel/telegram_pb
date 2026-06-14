import { useMemo } from "react";
import { Surface } from "../../../design-system";
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
      return "border-l-blue bg-blue/5";
    case "removed":
      return "border-l-ink3 bg-line2/40";
    case "sp_changed":
      return "border-l-amber bg-amber/5";
    case "summary":
      return "border-l-emerald-500 bg-emerald-500/5";
    case "baseline":
      return "border-l-ink3 bg-line2/30";
    default:
      return "border-l-line bg-surface";
  }
}

function EventRow({ event }: { event: ScopeRefreshEvent }) {
  const when = event.at ? formatFeedTime(event.at) : null;
  return (
    <li className={`rounded-md border-l-4 px-3 py-2 text-sm ${eventTone(event.type)}`}>
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
    <Surface className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Что изменилось</h3>
        <span className="text-xs text-ink3">Обновлено {formatFeedTime(snapshot.refreshed_at)}</span>
      </div>

      {latestEvents.length > 0 ? <PaginatedEventList events={latestEvents} /> : null}

      {historyEntries.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-blue marker:content-none">
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
    </Surface>
  );
}
