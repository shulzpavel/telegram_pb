import { useMemo, useState } from "react";
import { Button, EmptyState, SelectField } from "../../../design-system";
import type { TokenItem } from "../api/cmsTypes";
import { DataTable, MobileRecordCard, MobileRecordField, Status, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { formatDate, shortHash } from "../../../shared/lib/format";

export default function TokensPage() {
  const [active, setActive] = useState("");
  const params = useMemo(() => ({ active: active === "" ? undefined : active === "true" }), [active]);
  const list = useCmsList<TokenItem>("/tokens", params);
  return (
    <section className="space-y-4">
      <Toolbar>
        <SelectField className="md:max-w-[180px]" aria-label="Token status" value={active} onChange={(event) => setActive(event.target.value)}>
          <option value="">All tokens</option>
          <option value="true">Active</option>
          <option value="false">Expired</option>
        </SelectField>
        <Button variant="ghost" onClick={list.reload}>Refresh</Button>
      </Toolbar>
      <DataTable
        error={list.error}
        loading={list.loading}
        hasMore={Boolean(list.cursor)}
        onMore={list.loadMore}
        columns={["Token", "Session", "Participants", "State", "Expires"]}
        empty={list.items.length === 0 && !list.loading ? <EmptyState title="No tokens found" description="Try another token status filter." /> : null}
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.id} title={`${item.token_prefix}...`} meta={shortHash(item.token_hash)} action={<Status active={item.is_active} />}>
            <MobileRecordField label="Session" value={item.session_key} />
            <MobileRecordField label="Participants" value={item.participants_joined} />
            <MobileRecordField label="Expires" value={formatDate(item.expires_at)} />
            <MobileRecordField label="Created" value={formatDate(item.created_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line">
            <td className="px-3 py-2">
              <p className="font-semibold text-ink">{item.token_prefix}...</p>
              <p className="text-xs text-ink3">{shortHash(item.token_hash)}</p>
            </td>
            <td className="px-3 py-2">{item.session_key}</td>
            <td className="px-3 py-2">{item.participants_joined}</td>
            <td className="px-3 py-2"><Status active={item.is_active} /></td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.expires_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
