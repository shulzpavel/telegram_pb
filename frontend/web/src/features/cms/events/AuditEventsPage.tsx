import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, EmptyState, SelectField, TextField } from "../../../design-system";
import type { AuditEvent } from "../api/cmsTypes";
import {
  DataTable,
  HelpCallout,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Status,
} from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate } from "../../../shared/lib/format";

const ACTION_LABELS: Record<string, string> = {
  "cms.login": "Вход в CMS",
  "cms.logout": "Выход из CMS",
  "cms.session.close": "Сессия закрыта",
  "cms.session.delete": "Сессия удалена",
  "cms.token.revoke": "Invite-ссылка отозвана",
  "cms.task.create": "Задача создана",
  "cms.task.bulk_create": "Задачи добавлены пачкой",
  "cms.task.update": "Задача изменена",
  "cms.task.delete": "Задача удалена",
  "cms.task.move": "Задача перемещена",
  "cms.task.reorder": "Очередь переставлена",
  "cms.task.jira_import": "Импорт из Jira",
  "cms.access.role.create": "Создана роль",
  "cms.access.role.update": "Роль обновлена",
  "cms.access.admin.create": "Создан CMS-пользователь",
  "cms.access.admin.update": "CMS-пользователь обновлён",
  "app.session.start": "Старт раунда",
  "app.session.reveal": "Reveal",
  "app.session.next": "Следующая задача",
  "app.session.skip": "Пропуск задачи",
  "app.session.finish": "Сессия завершена",
  "app.session.final_estimate": "Финальная оценка SP",
  "app.session.invite": "Сгенерирована invite-ссылка",
};

function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function localDateTimeToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Backend serializes `payload` as a JSON string when it travels through the
// generic `_row_to_dict` helper (asyncpg's jsonb codec returns text), so we
// have to be defensive here: parse strings, accept already-parsed objects,
// and bail out gracefully on anything else (logged for debugging).
function normalizePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

interface EntityLink {
  label: string;
  to: string;
}

/**
 * Walk a payload and emit "open the related entity" links so each audit row
 * has at least one concrete next step instead of being a read-only dead-end.
 *
 * Closes UX audit risk: "Audit event row — нет перехода к сущности".
 *
 * Currently understood keys (intentionally narrow — we only link when the
 * destination page would actually surface the entity):
 *   - session_id / chat_id  → /cms/sessions
 *   - token_id              → /cms/tokens
 *   - user / username       → /cms/access/users (search) — admin entities
 *   - admin                 → same as user
 *
 * Unknown keys are ignored so the table stays uncluttered when the payload
 * is opaque (e.g. cms.login).
 */
function extractEntityLinks(payload: Record<string, unknown> | null): EntityLink[] {
  if (!payload) return [];
  const links: EntityLink[] = [];
  const seen = new Set<string>();
  const push = (link: EntityLink) => {
    const key = `${link.label}::${link.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };

  const sessionId =
    typeof payload.session_id === "number" || typeof payload.session_id === "string"
      ? String(payload.session_id)
      : typeof payload.chat_id === "number" || typeof payload.chat_id === "string"
        ? String(payload.chat_id)
        : null;
  if (sessionId) {
    push({ label: `Открыть сессию ${sessionId}`, to: `/cms/sessions?q=${encodeURIComponent(sessionId)}` });
  }

  const tokenId =
    typeof payload.token_id === "number" || typeof payload.token_id === "string"
      ? String(payload.token_id)
      : null;
  if (tokenId) {
    push({ label: "Открыть invite-ссылки", to: "/cms/tokens" });
  }

  const username =
    typeof payload.username === "string" && payload.username
      ? payload.username
      : typeof payload.admin === "string" && payload.admin
        ? payload.admin
        : null;
  if (username) {
    push({ label: `Открыть пользователя ${username}`, to: `/cms/access/users?q=${encodeURIComponent(username)}` });
  }

  return links;
}

function PayloadList({ payload }: { payload: unknown }) {
  const normalized = normalizePayload(payload);
  if (!normalized || Object.keys(normalized).length === 0) {
    return <span className="text-ink4">—</span>;
  }
  const entries = Object.entries(normalized);
  return (
    <ul className="space-y-0.5 text-xs">
      {entries.map(([key, value]) => (
        <li key={key} className="flex gap-1.5">
          <span className="font-semibold text-ink3">{key}:</span>
          <span className="min-w-0 break-words text-ink2">{formatPayloadValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AuditEventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const actorFromUrl = searchParams.get("actor") ?? "";
  const [status, setStatus] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState(actorFromUrl);
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const debouncedAction = useDebouncedValue(actionFilter);
  const debouncedActor = useDebouncedValue(actorFilter);
  const debouncedFrom = useDebouncedValue(fromFilter);
  const debouncedTo = useDebouncedValue(toFilter);

  // Reflect URL `actor` changes back into local state — clicking the Access
  // mini-journal link sends users here pre-filtered.
  useEffect(() => {
    setActorFilter((current) => (current === actorFromUrl ? current : actorFromUrl));
  }, [actorFromUrl]);

  // Mirror debounced actor back into the URL so the filter survives reloads
  // and can be linked from elsewhere.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = debouncedActor.trim();
    if (trimmed) next.set("actor", trimmed);
    else next.delete("actor");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // We intentionally don't depend on searchParams to avoid an infinite
    // loop — the URL is the destination, not a source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedActor]);

  const tsFrom = useMemo(() => localDateTimeToIso(debouncedFrom), [debouncedFrom]);
  const tsTo = useMemo(() => localDateTimeToIso(debouncedTo), [debouncedTo]);
  const dateRangeError =
    tsFrom && tsTo && new Date(tsFrom).getTime() > new Date(tsTo).getTime()
      ? "Начало периода должно быть раньше окончания."
      : null;
  const params = useMemo(
    () => ({
      status: status || undefined,
      action: debouncedAction.trim() ? debouncedAction.trim() : undefined,
      actor: debouncedActor.trim() ? debouncedActor.trim() : undefined,
      ts_from: tsFrom,
      ts_to: tsTo,
    }),
    [debouncedAction, debouncedActor, status, tsFrom, tsTo]
  );
  const list = useCmsList<AuditEvent>("/events", params, { scrollKey: "cms-events" });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  // Clicking an actor in a row filters the journal by that actor — saves the
  // user from copy-pasting the username into the filter field.
  function filterByActor(actor: string | null) {
    if (!actor) return;
    setActorFilter(actor);
  }
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Журнал действий"
        description="Что и когда происходило в CMS и в самих сессиях: кто стартовал раунд, кто закрыл сессию, кто отозвал invite."
      />
      <HelpCallout title="Что здесь">
        <p>Записи добавляются автоматически. Удалять их нельзя — это аудит.</p>
        <p>Фильтр «Статус» помогает быстро найти неудачные попытки: например, неуспешный логин или конфликт версии очереди.</p>
        <p>Диапазон времени применяется на сервере до пагинации: страница получает только нужное окно событий, без загрузки полного журнала.</p>
        <p>Если ввели «action», фильтр работает по точному совпадению (например, <code className="rounded bg-line2 px-1 text-xs">cms.session.delete</code>).</p>
      </HelpCallout>
      {dateRangeError ? <Alert tone="warning">{dateRangeError}</Alert> : null}
      <div className="grid w-full max-w-7xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <TextField
          ref={searchRef}
          className="xl:col-span-4"
          aria-label="Тип события"
          label="Action"
          placeholder="Фильтр по action, например cms.task.create"
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
        />
        <TextField
          className="xl:col-span-3"
          aria-label="Кто (actor)"
          label="Actor"
          placeholder="username, например lead.user"
          value={actorFilter}
          onChange={(event) => setActorFilter(event.target.value)}
        />
        <SelectField
          className="xl:col-span-2"
          aria-label="Статус"
          label="Статус"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="ok">Успех</option>
          <option value="failed">Ошибка</option>
        </SelectField>
        <TextField
          className="xl:col-span-3"
          aria-label="Начало периода"
          label="С"
          type="datetime-local"
          value={fromFilter}
          onChange={(event) => setFromFilter(event.target.value)}
          reserveMessageSpace={false}
        />
        <TextField
          className="xl:col-span-3"
          aria-label="Конец периода"
          label="По"
          type="datetime-local"
          value={toFilter}
          onChange={(event) => setToFilter(event.target.value)}
          reserveMessageSpace={false}
        />
        <Button
          variant="ghost"
          className="xl:self-end"
          onClick={() => {
            setActionFilter("");
            setActorFilter("");
            setStatus("");
            setFromFilter("");
            setToFilter("");
          }}
        >
          Сбросить
        </Button>
        <Button variant="ghost" className="xl:self-end" onClick={list.reload}>Обновить</Button>
      </div>
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
        itemNoun="событий"
        columns={["Событие", "Кто", "Статус", "IP", "Подробности", "Время"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            <EmptyState title="Записей нет" description="Поменяйте фильтры или подождите следующего действия." />
          ) : null
        }
        mobileCards={list.items.map((item) => {
          const entityLinks = extractEntityLinks(normalizePayload(item.payload));
          return (
            <MobileRecordCard
              key={item.id}
              title={
                <span className="block">
                  <span className="block font-semibold">{labelForAction(item.action)}</span>
                  <span className="block text-xs text-ink4">{item.action}</span>
                </span>
              }
              meta={formatDate(item.ts)}
              action={<Status active={item.status === "ok"} label={item.status === "ok" ? "успех" : "ошибка"} />}
            >
              <MobileRecordField
                label="Кто"
                value={
                  item.actor ? (
                    <button
                      type="button"
                      className="text-left text-blue underline-offset-2 hover:underline"
                      onClick={() => filterByActor(item.actor)}
                    >
                      {item.actor}
                    </button>
                  ) : (
                    "—"
                  )
                }
              />
              <MobileRecordField label="IP" value={item.ip ?? "—"} />
              <div className="col-span-2 min-w-0">
                <p className="font-semibold text-ink4">Подробности</p>
                <div className="mt-0.5 break-words [overflow-wrap:anywhere]">
                  <PayloadList payload={item.payload} />
                </div>
              </div>
              {entityLinks.length > 0 ? (
                <div className="col-span-2 mt-1 flex flex-wrap gap-2">
                  {entityLinks.map((link) => (
                    <Button key={link.to} variant="ghost" size="sm" onClick={() => navigate(link.to)}>
                      {link.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </MobileRecordCard>
          );
        })}
      >
        {list.items.map((item) => {
          const entityLinks = extractEntityLinks(normalizePayload(item.payload));
          return (
            <tr key={item.id} className="border-t border-line align-top">
              <td className="px-3 py-2">
                <div className="max-w-[16rem] break-words">
                  <p className="font-semibold text-ink">{labelForAction(item.action)}</p>
                  <p className="text-xs text-ink4">
                    <Badge tone="neutral">{item.action}</Badge>
                  </p>
                </div>
              </td>
              <td className="px-3 py-2 break-words">
                {item.actor ? (
                  <button
                    type="button"
                    className="text-left text-blue underline-offset-2 hover:underline"
                    onClick={() => filterByActor(item.actor)}
                    title="Фильтровать по этому пользователю"
                  >
                    {item.actor}
                  </button>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                <Status active={item.status === "ok"} label={item.status === "ok" ? "успех" : "ошибка"} />
              </td>
              <td className="px-3 py-2 text-ink3 whitespace-nowrap">{item.ip ?? "—"}</td>
              <td className="px-3 py-2">
                <div className="max-w-[24rem] space-y-2 break-words [overflow-wrap:anywhere]">
                  <PayloadList payload={item.payload} />
                  {entityLinks.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {entityLinks.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="inline-flex items-center rounded-md border border-line px-2 py-1 text-xs font-semibold text-blue hover:bg-line2"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2 text-ink3 whitespace-nowrap">{formatDate(item.ts)}</td>
            </tr>
          );
        })}
      </DataTable>
    </section>
  );
}
