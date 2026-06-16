import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, DropdownField, EmptyState, TextField } from "../../../design-system";
import type { CmsAdmin, CmsRoleRef } from "../api/cmsTypes";
import {
  DataTable,
  HelpCallout,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Toolbar,
} from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAccessContext } from "./AccessShell";
import { formatRelativeTime } from "./parts/helpers";

const SCROLL_KEY = "cms-access-users";

export default function UsersListPage() {
  const navigate = useNavigate();
  const { roles, canManage, cacheAdmin } = useAccessContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const activeParam = searchParams.get("active") ?? "";
  const roleIdParam = searchParams.get("role_id") ?? "";

  // Local mirror for the search input so we can debounce without losing
  // state on every keystroke; the URL is updated when the debounced value
  // settles.
  const [qInput, setQInput] = useState(q);
  const debouncedQ = useDebouncedValue(qInput);

  useEffect(() => {
    if (debouncedQ === (searchParams.get("q") ?? "")) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedQ.trim()) next.set("q", debouncedQ.trim());
    else next.delete("q");
    setSearchParams(next, { replace: true });
    // We intentionally don't re-run when searchParams changes by external
    // means; the debounce only mirrors local input back into the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // External param changes (e.g. clicking "Все" link from a role page) need
  // to reflect into the input.
  useEffect(() => {
    setQInput((current) => (current === q ? current : q));
  }, [q]);

  const params = useMemo(
    () => ({
      q: debouncedQ.trim() ? debouncedQ.trim() : undefined,
      active: activeParam === "" ? undefined : activeParam === "true",
      role_id: roleIdParam ? Number(roleIdParam) : undefined,
    }),
    [activeParam, debouncedQ, roleIdParam]
  );

  const list = useCmsList<CmsAdmin>("/access/admins", params, { scrollKey: SCROLL_KEY });
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Mirror loaded admins into the in-memory cache so the detail page can
  // look them up by id when the user navigates back via direct URL.
  useEffect(() => {
    for (const admin of list.items) cacheAdmin(admin);
  }, [cacheAdmin, list.items]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setQInput("");
    const next = new URLSearchParams();
    setSearchParams(next, { replace: true });
  }

  function onCreate() {
    navigate("/cms/access/users/new");
  }

  function onOpen(admin: CmsAdmin) {
    cacheAdmin(admin);
    navigate(`/cms/access/users/${admin.id}`, { state: { admin } });
  }

  const activeFiltersCount =
    (q ? 1 : 0) + (activeParam ? 1 : 0) + (roleIdParam ? 1 : 0);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Пользователи CMS"
        description="Кто заходит в админку Planning Poker. Назначайте роли, отключайте доступ и сбрасывайте пароль через карточку пользователя."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={onCreate}
            disabled={!canManage}
            title={!canManage ? "Нет прав на управление" : undefined}
          >
            + Новый
          </Button>
        }
      />
      <HelpCallout title="Как искать">
        <p>Поиск ищет по <b>username</b> и <b>display_name</b>. Фильтр «Статус» помогает быстро отделить отключённые аккаунты.</p>
        <p>Все фильтры сохраняются в URL — ссылку можно отправить коллеге.</p>
      </HelpCallout>

      <Toolbar>
        <TextField
          ref={searchRef}
          className="md:max-w-sm"
          aria-label="Поиск пользователя"
          placeholder="username или отображаемое имя"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <DropdownField
          className="md:max-w-[200px]"
          aria-label="Статус"
          value={activeParam}
          options={[
            { value: "", label: "Все статусы" },
            { value: "true", label: "Активные" },
            { value: "false", label: "Отключённые" },
          ]}
          onChange={(value) => setParam("active", value)}
        />
        <DropdownField
          className="md:max-w-[220px]"
          aria-label="Роль"
          value={roleIdParam}
          options={[
            { value: "", label: "Все роли" },
            ...roles.map((role) => ({ value: String(role.id), label: role.name })),
          ]}
          searchable={roles.length > 8}
          searchPlaceholder="Поиск роли..."
          onChange={(value) => setParam("role_id", value)}
        />
        {activeFiltersCount > 0 ? (
          <Button variant="ghost" onClick={clearFilters}>
            Сбросить фильтры
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={list.reload} disabled={list.loading}>
          Обновить
        </Button>
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
        onFocusSearch={() => searchRef.current?.focus()}
        itemNoun="пользователей"
        columns={["Username", "Имя", "Роли", "Статус", "Последний вход"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            <EmptyState
              title={activeFiltersCount > 0 ? "Никого не нашли" : "Ещё нет ни одного CMS-пользователя"}
              description={
                activeFiltersCount > 0
                  ? "Поменяйте поиск, роль или статус."
                  : "Создайте первого администратора, чтобы начать работу с CMS."
              }
              action={
                activeFiltersCount > 0 ? (
                  <Button variant="ghost" onClick={clearFilters}>Сбросить фильтры</Button>
                ) : canManage ? (
                  <Button variant="primary" onClick={onCreate}>+ Новый</Button>
                ) : null
              }
            />
          ) : null
        }
        mobileCards={list.items.map((admin) => (
          <MobileRecordCard
            key={admin.id}
            title={
              <button
                type="button"
                onClick={() => onOpen(admin)}
                className="block w-full text-left font-semibold text-ink hover:text-blue"
              >
                <code className="font-mono">{admin.username}</code>
              </button>
            }
            meta={admin.display_name ?? "—"}
            action={<StatusBadge admin={admin} />}
          >
            <MobileRecordField label="Роли" value={<RoleChips roles={admin.roles} />} />
            <MobileRecordField label="Последний вход" value={formatRelativeTime(admin.last_login_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((admin) => (
          <tr
            key={admin.id}
            className="cursor-pointer border-t border-line transition-colors hover:bg-line2/50"
            onClick={() => onOpen(admin)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(admin);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Открыть пользователя ${admin.username}`}
          >
            <td className="px-3 py-2 align-top">
              <code className="block max-w-[14rem] break-all font-mono text-sm font-semibold text-ink">{admin.username}</code>
            </td>
            <td className="px-3 py-2 align-top text-ink2">
              <span className="block max-w-[16rem] break-words">
                {admin.display_name || <span className="text-ink4">—</span>}
              </span>
            </td>
            <td className="px-3 py-2 align-top">
              <div className="max-w-[20rem]">
                <RoleChips roles={admin.roles} />
              </div>
            </td>
            <td className="px-3 py-2 align-top"><StatusBadge admin={admin} /></td>
            <td className="px-3 py-2 align-top text-ink2 whitespace-nowrap">{formatRelativeTime(admin.last_login_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

function StatusBadge({ admin }: { admin: CmsAdmin }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {admin.is_active ? <Badge tone="success">активен</Badge> : <Badge tone="warning">отключён</Badge>}
      {admin.is_superuser ? <Badge tone="info">superuser</Badge> : null}
    </span>
  );
}

function RoleChips({ roles }: { roles: CmsRoleRef[] }) {
  if (!roles.length) return <span className="text-ink4">—</span>;
  const visible = roles.slice(0, 3);
  const extra = roles.length - visible.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visible.map((role) => (
        <Badge key={role.id} tone={role.is_system ? "info" : "neutral"}>
          {role.name}
        </Badge>
      ))}
      {extra > 0 ? <Badge tone="neutral">+{extra}</Badge> : null}
    </span>
  );
}
