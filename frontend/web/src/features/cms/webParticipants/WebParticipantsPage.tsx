import { useMemo, useState } from "react";
import { Button, EmptyState, SelectField } from "../../../design-system";
import type { WebParticipantItem } from "../api/cmsTypes";
import { DataTable, MobileRecordCard, MobileRecordField, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { formatDate, shortHash } from "../../../shared/lib/format";
import { sessionKeyChip } from "../sessions/sessionTitle";

export default function WebParticipantsPage() {
  const [active, setActive] = useState("");
  const params = useMemo(() => ({ active: active === "" ? undefined : active === "true" }), [active]);
  const list = useCmsList<WebParticipantItem>("/web-participants", params, { scrollKey: "cms-web-participants" });
  return (
    <section className="space-y-4">
      <Toolbar>
        <SelectField className="md:max-w-[180px]" aria-label="Web participant status" value={active} onChange={(event) => setActive(event.target.value)}>
          <option value="">All web users</option>
          <option value="true">Active</option>
          <option value="false">Expired</option>
        </SelectField>
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
        itemNoun="участников"
        columns={["Participant", "Role", "Session", "Token", "Joined"]}
        empty={list.items.length === 0 && !list.loading ? <EmptyState title="No web participants found" description="Try another status filter." /> : null}
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.id} title={item.name} meta={item.user_id}>
            <MobileRecordField label="Role" value={item.role} />
            <MobileRecordField label="Session" value={`Сессия ${sessionKeyChip(item)}`} />
            <MobileRecordField label="Token" value={shortHash(item.token_hash)} />
            <MobileRecordField label="Joined" value={formatDate(item.joined_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line">
            <td className="px-3 py-2">
              <p className="font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-ink3">{item.user_id}</p>
            </td>
            <td className="px-3 py-2">{item.role}</td>
            <td className="px-3 py-2">Сессия {sessionKeyChip(item)}</td>
            <td className="px-3 py-2 text-xs text-ink3">{shortHash(item.token_hash)}</td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.joined_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
