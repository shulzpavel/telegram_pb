import { useMemo, useState } from "react";
import { Button, EmptyState, SelectField } from "../../../design-system";
import type { AuditEvent } from "../api/cmsTypes";
import { DataTable, MobileRecordCard, MobileRecordField, Status, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { formatDate } from "../../../shared/lib/format";

export default function AuditEventsPage() {
  const [status, setStatus] = useState("");
  const params = useMemo(() => ({ status: status || undefined }), [status]);
  const list = useCmsList<AuditEvent>("/events", params);
  return (
    <section className="space-y-4">
      <Toolbar>
        <SelectField className="md:max-w-[180px]" aria-label="Audit status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="ok">OK</option>
          <option value="failed">Failed</option>
        </SelectField>
        <Button variant="ghost" onClick={list.reload}>Refresh</Button>
      </Toolbar>
      <DataTable
        error={list.error}
        loading={list.loading}
        hasMore={Boolean(list.cursor)}
        onMore={list.loadMore}
        columns={["Action", "Actor", "Status", "IP", "Payload", "Time"]}
        empty={list.items.length === 0 && !list.loading ? <EmptyState title="No audit events found" description="Try another status filter." /> : null}
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.id} title={item.action} meta={formatDate(item.ts)} action={<Status active={item.status === "ok"} label={item.status} />}>
            <MobileRecordField label="Actor" value={item.actor ?? "-"} />
            <MobileRecordField label="IP" value={item.ip ?? "-"} />
            <MobileRecordField label="Payload" value={JSON.stringify(item.payload)} />
            <MobileRecordField label="Time" value={formatDate(item.ts)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line align-top">
            <td className="px-3 py-2 font-semibold text-ink">{item.action}</td>
            <td className="px-3 py-2">{item.actor ?? "-"}</td>
            <td className="px-3 py-2"><Status active={item.status === "ok"} label={item.status} /></td>
            <td className="px-3 py-2 text-ink3">{item.ip ?? "-"}</td>
            <td className="px-3 py-2">
              <pre className="max-w-sm overflow-auto text-xs text-ink3">{JSON.stringify(item.payload)}</pre>
            </td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.ts)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
