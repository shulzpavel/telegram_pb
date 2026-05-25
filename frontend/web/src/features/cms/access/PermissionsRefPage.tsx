import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, EmptyState, TextField } from "../../../design-system";
import type { CmsPermission, CmsRole } from "../api/cmsTypes";
import { DataTable, HelpCallout, MobileRecordCard, MobileRecordField, SectionHeader, Toolbar } from "../components/CmsPrimitives";
import { useAccessContext } from "./AccessShell";
import { filterPermissions, groupPermissionsByPrefix } from "./parts/helpers";

export default function PermissionsRefPage() {
  const { permissions, pages, roles } = useAccessContext();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterPermissions(permissions, query), [permissions, query]);
  const grouped = useMemo(() => groupPermissionsByPrefix(filtered), [filtered]);

  const rolesByPermission = useMemo(() => buildRolesByPermission(roles), [roles]);
  const permissionByKey = useMemo(() => new Map(permissions.map((p) => [p.key, p])), [permissions]);

  const flatPermissions = useMemo(() => grouped.flatMap((group) => group.permissions), [grouped]);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Права"
        description="Справочник атомарных permissions, их назначение и роли, в которые они входят."
      />
      <HelpCallout title="Что это">
        <p>
          Permissions — самый низкоуровневый кирпич доступа. Они не назначаются пользователю напрямую: вместо этого
          собираются в <b>роли</b>, а уже роли назначаются администраторам.
        </p>
        <p>
          Чтобы добавить новое право, его сначала прописывают в коде бэкенда, потом включают в нужные роли на этой странице.
        </p>
      </HelpCallout>

      <Toolbar>
        <TextField
          className="md:max-w-sm"
          aria-label="Поиск права"
          placeholder="Поиск по permission или роли"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Toolbar>

      <DataTable
        error={null}
        loading={false}
        loadingMore={false}
        hasMore={false}
        reachedCap={false}
        loadedCount={flatPermissions.length}
        total={permissions.length}
        onMore={() => undefined}
        itemNoun="прав"
        showSkeleton={false}
        columns={["Permission", "Описание", "Используется в ролях"]}
        empty={
          flatPermissions.length === 0 ? (
            <EmptyState title="Ничего не нашлось" description="Поменяйте поисковый запрос." />
          ) : null
        }
        mobileCards={flatPermissions.map((permission) => (
          <MobileRecordCard
            key={permission.key}
            title={<code className="font-mono">{permission.key}</code>}
            meta={permission.label}
          >
            <MobileRecordField label="Описание" value={permission.description || "—"} />
            <MobileRecordField
              label="Роли"
              value={<PermissionRoleChips roles={rolesByPermission.get(permission.key) ?? []} />}
            />
          </MobileRecordCard>
        ))}
      >
        {grouped.map((group) => (
          <PermissionGroupRows
            key={group.key}
            label={group.label}
            permissions={group.permissions}
            rolesByPermission={rolesByPermission}
          />
        ))}
      </DataTable>

      <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Разделы CMS → permission</h3>
        <p className="mt-1 text-xs text-ink3">
          Какому разделу администратор должен иметь доступ, чтобы увидеть его в боковом меню.
        </p>

        {/* Mobile: stacked cards — same as the main table above. */}
        <ul className="mt-3 flex flex-col gap-3 md:hidden">
          {pages.map((page) => {
            const permission = permissionByKey.get(page.permission_key);
            return (
              <li key={page.key} className="rounded-lg border border-line bg-canvas p-3">
                <p className="font-semibold text-ink">{page.label}</p>
                <p className="mt-1 break-all font-mono text-xs text-ink3">{page.path}</p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <dt className="font-semibold text-ink4">Permission</dt>
                    <dd className="mt-0.5 break-all font-mono text-ink2">{page.permission_key}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-semibold text-ink4">Назначение</dt>
                    <dd className="mt-0.5 break-words text-ink2">{permission?.label ?? "—"}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
          {pages.length === 0 ? (
            <li className="rounded-lg border border-dashed border-line p-3 text-center text-sm text-ink3">
              Маппинг пуст.
            </li>
          ) : null}
        </ul>

        {/* Desktop: regular table without horizontal scroll. */}
        <div className="mt-3 hidden md:block">
          <table className="w-full table-auto text-sm">
            <thead className="bg-line2 text-xs uppercase text-ink3">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Раздел</th>
                <th className="px-3 py-2 text-left font-bold">URL</th>
                <th className="px-3 py-2 text-left font-bold">Permission</th>
                <th className="px-3 py-2 text-left font-bold">Назначение</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const permission = permissionByKey.get(page.permission_key);
                return (
                  <tr key={page.key} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-semibold text-ink break-words">{page.label}</td>
                    <td className="px-3 py-2">
                      <code className="block max-w-[16rem] break-all font-mono text-xs text-ink2">{page.path}</code>
                    </td>
                    <td className="px-3 py-2">
                      <code className="block max-w-[18rem] break-all font-mono text-xs text-ink2">{page.permission_key}</code>
                    </td>
                    <td className="px-3 py-2 text-ink2 break-words">{permission?.label ?? "—"}</td>
                  </tr>
                );
              })}
              {pages.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-ink3">Маппинг пуст.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function PermissionGroupRows({
  label,
  permissions,
  rolesByPermission,
}: {
  label: string;
  permissions: CmsPermission[];
  rolesByPermission: Map<string, CmsRole[]>;
}) {
  return (
    <>
      <tr className="border-t border-line bg-line2/40">
        <td colSpan={3} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink3">
          {label}
        </td>
      </tr>
      {permissions.map((permission) => (
        <tr key={permission.key} className="border-t border-line align-top">
          <td className="px-3 py-2">
            <code className="block max-w-[18rem] break-all font-mono text-xs text-ink">{permission.key}</code>
            {permission.label ? <p className="mt-0.5 max-w-[18rem] break-words text-xs text-ink3">{permission.label}</p> : null}
          </td>
          <td className="px-3 py-2 text-ink2 break-words">{permission.description || <span className="text-ink4">—</span>}</td>
          <td className="px-3 py-2">
            <div className="max-w-[20rem]">
              <PermissionRoleChips roles={rolesByPermission.get(permission.key) ?? []} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function PermissionRoleChips({ roles }: { roles: CmsRole[] }) {
  if (!roles.length) return <span className="text-ink4">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {roles.map((role) => (
        <Link
          key={role.id}
          to={`/cms/access/roles/${role.id}`}
          state={{ role }}
          className="rounded-full bg-line2 px-2 py-0.5 text-xs font-semibold text-ink2 hover:bg-blue/10 hover:text-blue"
        >
          {role.name}
        </Link>
      ))}
      {roles.some((role) => role.is_system) ? <Badge tone="info">в т.ч. системные</Badge> : null}
    </span>
  );
}

function buildRolesByPermission(roles: CmsRole[]): Map<string, CmsRole[]> {
  const map = new Map<string, CmsRole[]>();
  for (const role of roles) {
    for (const key of role.permission_keys) {
      const list = map.get(key);
      if (list) list.push(role);
      else map.set(key, [role]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}
