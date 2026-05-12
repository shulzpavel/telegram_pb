import { useMemo, useState } from "react";
import { Button, EmptyState, SelectField, TextField } from "../../../design-system";
import type { UserItem } from "../api/cmsTypes";
import { DataTable, MobileRecordCard, MobileRecordField, Toolbar } from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate } from "../../../shared/lib/format";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const params = useMemo(() => ({ q: debouncedQ, role: role || undefined }), [debouncedQ, role]);
  const list = useCmsList<UserItem>("/users", params);
  return (
    <section className="space-y-4">
      <Toolbar>
        <TextField className="md:max-w-sm" aria-label="Search user" placeholder="Search user" value={q} onChange={(event) => setQ(event.target.value)} />
        <SelectField className="md:max-w-[180px]" aria-label="User role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">All roles</option>
          <option value="participant">Participant</option>
          <option value="lead">Lead</option>
          <option value="admin">Admin</option>
        </SelectField>
        <Button variant="ghost" onClick={list.reload}>Refresh</Button>
      </Toolbar>
      <DataTable
        error={list.error}
        loading={list.loading}
        hasMore={Boolean(list.cursor)}
        onMore={list.loadMore}
        columns={["User", "Role", "Source", "First seen", "Last seen"]}
        empty={list.items.length === 0 && !list.loading ? <EmptyState title="No users found" description="Try a different search or role filter." /> : null}
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.user_id} title={item.name} meta={item.user_id}>
            <MobileRecordField label="Role" value={item.role} />
            <MobileRecordField label="Source" value={item.is_web ? "web" : "telegram"} />
            <MobileRecordField label="First seen" value={formatDate(item.first_seen_at)} />
            <MobileRecordField label="Last seen" value={formatDate(item.last_seen_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.user_id} className="border-t border-line">
            <td className="px-3 py-2">
              <p className="font-semibold text-ink">{item.name}</p>
              <p className="text-xs text-ink3">{item.user_id}</p>
            </td>
            <td className="px-3 py-2">{item.role}</td>
            <td className="px-3 py-2">{item.is_web ? "web" : "telegram"}</td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.first_seen_at)}</td>
            <td className="px-3 py-2 text-ink3">{formatDate(item.last_seen_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
