import { useMemo, useState } from "react";
import { Button, EmptyState, TextField } from "../../../design-system";
import type { VoteItem } from "../api/cmsTypes";
import { DataTable, MobileRecordCard, MobileRecordField, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate } from "../../../shared/lib/format";
import { sessionKeyChip } from "../sessions/sessionTitle";

export default function VotesPage() {
  const [sessionId, setSessionId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [userId, setUserId] = useState("");
  const debouncedSessionId = useDebouncedValue(sessionId);
  const debouncedTaskId = useDebouncedValue(taskId);
  const debouncedUserId = useDebouncedValue(userId);
  const params = useMemo(
    () => ({
      session_id: debouncedSessionId ? Number(debouncedSessionId) : undefined,
      task_id: debouncedTaskId ? Number(debouncedTaskId) : undefined,
      user_id: debouncedUserId ? Number(debouncedUserId) : undefined,
    }),
    [debouncedSessionId, debouncedTaskId, debouncedUserId]
  );
  const list = useCmsList<VoteItem>("/votes", params, { scrollKey: "cms-votes" });
  return (
    <section className="space-y-4">
      <Toolbar>
        <TextField className="md:max-w-[160px]" aria-label="Session id" placeholder="session_id" value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
        <TextField className="md:max-w-[160px]" aria-label="Task id" placeholder="task_id" value={taskId} onChange={(event) => setTaskId(event.target.value)} />
        <TextField className="md:max-w-[160px]" aria-label="User id" placeholder="user_id" value={userId} onChange={(event) => setUserId(event.target.value)} />
        <Button variant="ghost" onClick={list.reload}>Refresh</Button>
      </Toolbar>
      <DataTable
        error={list.error}
        loading={list.loading}
        loadingMore={list.loadingMore}
        hasMore={list.hasMore}
        reachedCap={list.reachedCap}
        loadedCount={list.items.length}
        total={list.total}
        onMore={list.loadMore}
        itemNoun="голосов"
        columns={["Vote", "User", "Task", "Session", "Created"]}
        empty={list.items.length === 0 && !list.loading ? <EmptyState title="No votes found" description="Try another session, task, or user filter." /> : null}
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.id} title={`Vote ${item.value}`} meta={item.user_name ?? "Unknown"}>
            <MobileRecordField label="User" value={`${item.user_id} · ${item.user_role ?? "-"}`} />
            <MobileRecordField label="Task" value={item.jira_key ?? `task ${item.task_id}`} />
            <MobileRecordField label="Session" value={`Сессия #${item.session_id} · ${sessionKeyChip(item)}`} />
            <MobileRecordField label="Created" value={formatDate(item.created_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line">
            <td className="px-3 py-2 font-bold text-ink">{item.value}</td>
            <td className="px-3 py-2">
              <p className="text-sm text-ink">{item.user_name ?? "Unknown"}</p>
              <p className="text-xs text-ink3">{item.user_id} · {item.user_role ?? "-"}</p>
            </td>
            <td className="px-3 py-2">
              <p className="text-sm font-semibold text-ink">{item.jira_key ?? `task ${item.task_id}`}</p>
              <p className="max-w-sm break-words text-xs text-ink3">{item.summary}</p>
            </td>
            <td className="px-3 py-2">
              <p className="text-sm text-ink">Сессия #{item.session_id}</p>
              <p className="text-xs text-ink3">{sessionKeyChip(item)}</p>
            </td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
