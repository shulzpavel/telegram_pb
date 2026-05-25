import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, TextField } from "../../../design-system";
import { cmsAccessApi } from "../api/cmsClient";
import type { CmsRole } from "../api/cmsTypes";
import { DataTable, HelpCallout, MobileRecordCard, MobileRecordField, SectionHeader, Toolbar } from "../components/CmsPrimitives";
import { useAccessContext } from "./AccessShell";

const ROLE_COUNT_THRESHOLD = 20;
const ROLE_USER_COUNT_LIMIT = 100;

interface RoleCountState {
  loading: boolean;
  byRoleId: Map<number, { count: number; hasMore: boolean } | null>;
}

export default function RolesListPage() {
  const navigate = useNavigate();
  const { roles, canManage } = useAccessContext();
  const [query, setQuery] = useState("");

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((role) => `${role.name} ${role.key} ${role.description}`.toLowerCase().includes(q));
  }, [query, roles]);

  // Counts are optional: only when role count is small enough that 20
  // parallel admin probes won't melt the UI / backend.
  const showCounts = roles.length > 0 && roles.length <= ROLE_COUNT_THRESHOLD;
  const [counts, setCounts] = useState<RoleCountState>({ loading: false, byRoleId: new Map() });

  useEffect(() => {
    if (!showCounts) {
      setCounts({ loading: false, byRoleId: new Map() });
      return;
    }
    let cancelled = false;
    setCounts({ loading: true, byRoleId: new Map() });
    void (async () => {
      const results = await Promise.allSettled(
        roles.map((role) => cmsAccessApi.admins({ role_id: role.id }, null))
      );
      if (cancelled) return;
      const next = new Map<number, { count: number; hasMore: boolean } | null>();
      results.forEach((result, index) => {
        const role = roles[index];
        if (!role) return;
        if (result.status === "fulfilled") {
          const items = result.value.items.slice(0, ROLE_USER_COUNT_LIMIT);
          next.set(role.id, { count: items.length, hasMore: Boolean(result.value.next_cursor) });
        } else {
          next.set(role.id, null);
        }
      });
      setCounts({ loading: false, byRoleId: next });
    })();
    return () => {
      cancelled = true;
    };
  }, [roles, showCounts]);

  function onCreate() {
    navigate("/cms/access/roles/new");
  }

  function onOpen(role: CmsRole) {
    navigate(`/cms/access/roles/${role.id}`, { state: { role } });
  }

  const tableColumns = showCounts
    ? ["Название", "Ключ", "Тип", "Прав", "Пользователей"]
    : ["Название", "Ключ", "Тип", "Прав"];

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Роли"
        description="Набор permissions с понятным именем. Системные роли защищены — их можно открыть, но не редактировать."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={!canManage}
            title={!canManage ? "Нет прав на управление" : undefined}
          >
            + Новая роль
          </Button>
        }
      />
      <HelpCallout title="Как читать">
        <p>
          Колонка <b>Прав</b> — сколько атомарных permissions включает роль. Чтобы быстро увидеть, что именно она даёт,
          откройте роль.
        </p>
        {showCounts ? (
          <p>
            Колонка <b>Пользователей</b> — сколько CMS-аккаунтов уже носят эту роль. Для больших каталогов (&gt;{ROLE_COUNT_THRESHOLD}{" "}
            ролей) счётчик скрывается, чтобы не нагружать страницу.
          </p>
        ) : (
          <p>
            Ролей в каталоге &gt;{ROLE_COUNT_THRESHOLD}, поэтому колонка «Пользователей» скрыта. Чтобы увидеть носителей конкретной
            роли — откройте её.
          </p>
        )}
      </HelpCallout>

      <Toolbar>
        <TextField
          className="md:max-w-sm"
          aria-label="Поиск роли"
          placeholder="Поиск по названию или ключу"
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
        loadedCount={filteredRoles.length}
        total={roles.length}
        onMore={() => undefined}
        itemNoun="ролей"
        showSkeleton={false}
        columns={tableColumns}
        empty={
          filteredRoles.length === 0 ? (
            <EmptyState
              title={query.trim() ? "Ничего не нашлось" : "Ролей ещё нет"}
              description={
                query.trim()
                  ? "Поменяйте поисковый запрос."
                  : "Создайте первую роль — для нее можно будет назначить CMS-пользователей."
              }
              action={canManage ? <Button variant="primary" onClick={onCreate}>+ Новая роль</Button> : null}
            />
          ) : null
        }
        mobileCards={filteredRoles.map((role) => {
          const usersEntry = showCounts ? counts.byRoleId.get(role.id) ?? undefined : undefined;
          return (
            <MobileRecordCard
              key={role.id}
              title={
                <button
                  type="button"
                  onClick={() => onOpen(role)}
                  className="block w-full text-left font-semibold text-ink hover:text-blue"
                >
                  {role.name}
                </button>
              }
              meta={<code className="font-mono text-xs text-ink3">{role.key}</code>}
              action={
                role.is_system ? <Badge tone="info">системная</Badge> : <Badge tone="neutral">кастомная</Badge>
              }
            >
              <MobileRecordField label="Прав" value={role.permission_keys.length} />
              {showCounts ? (
                <MobileRecordField
                  label="Пользователей"
                  value={renderUserCount(counts.loading, usersEntry)}
                />
              ) : null}
            </MobileRecordCard>
          );
        })}
      >
        {filteredRoles.map((role) => {
          const usersEntry = showCounts ? counts.byRoleId.get(role.id) ?? undefined : undefined;
          return (
            <tr
              key={role.id}
              className="cursor-pointer border-t border-line transition-colors hover:bg-line2/50"
              onClick={() => onOpen(role)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(role);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Открыть роль ${role.name}`}
            >
              <td className="px-3 py-2">
                <p className="font-semibold text-ink">{role.name}</p>
                {role.description ? <p className="text-xs text-ink3">{role.description}</p> : null}
              </td>
              <td className="px-3 py-2">
                <code className="font-mono text-xs text-ink2">{role.key}</code>
              </td>
              <td className="px-3 py-2">
                {role.is_system ? <Badge tone="info">системная</Badge> : <Badge tone="neutral">кастомная</Badge>}
              </td>
              <td className="px-3 py-2 text-ink2">{role.permission_keys.length}</td>
              {showCounts ? (
                <td className="px-3 py-2 text-ink2">{renderUserCount(counts.loading, usersEntry)}</td>
              ) : null}
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}

function renderUserCount(
  loading: boolean,
  entry: { count: number; hasMore: boolean } | null | undefined,
) {
  if (loading && entry === undefined) {
    return <span className="text-ink4">…</span>;
  }
  if (entry === undefined) {
    return <span className="text-ink4">—</span>;
  }
  if (entry === null) {
    return <span className="text-ink4">не удалось получить</span>;
  }
  if (entry.hasMore) return `${entry.count}+`;
  return entry.count;
}
