import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, SelectField, TextField } from "../../../design-system";
import type { UserItem } from "../api/cmsTypes";
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
import { formatDate } from "../../../shared/lib/format";

export default function UsersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const params = useMemo(() => ({ q: debouncedQ, role: role || undefined }), [debouncedQ, role]);
  const list = useCmsList<UserItem>("/users", params, { scrollKey: "cms-users" });
  const searchRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Участники"
        description="Все, кто заходил в сессии планинг-покера. Один человек — одна запись; данные обновляются при каждом подключении."
        actions={<Button variant="ghost" size="sm" onClick={list.reload}>Обновить</Button>}
      />
      <HelpCallout title="Как использовать">
        <p>Поиск ищет по имени и id. Фильтр «Роль» оставит только Lead / Participant / Admin — удобно искать фасилитаторов.</p>
        <p>В одной сессии участники видны на её карточке (раздел «Сессии» → выберите сессию).</p>
      </HelpCallout>
      <Toolbar>
        <TextField
          ref={searchRef}
          className="md:max-w-sm"
          aria-label="Поиск участника"
          placeholder="Поиск по имени или id"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <SelectField
          className="md:max-w-[200px]"
          aria-label="Роль участника"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="">Все роли</option>
          <option value="participant">Participant</option>
          <option value="lead">Lead</option>
          <option value="admin">Admin</option>
        </SelectField>
        <Button variant="ghost" onClick={list.reload}>Обновить</Button>
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
        itemNoun="участников"
        columns={["Участник", "Роль", "Первое подключение", "Последнее подключение"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            // Two flavours: with filters → offer to clear them; with a
            // truly empty roster → point the user at the only action
            // that can populate it (running a session).
            (q.trim() || role) ? (
              <EmptyState
                title="Никого не нашли"
                description="По текущим фильтрам участников нет. Сбросьте фильтры — посмотрите всех."
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setQ(""); setRole(""); }}
                  >
                    Сбросить фильтры
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Участники пока не подключались"
                description="Список заполнится автоматически, когда люди впервые откроют invite-ссылку. Запустите первую сессию — пригласите команду."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/manage")}
                  >
                    Запустить сессию
                  </Button>
                }
              />
            )
          ) : null
        }
        mobileCards={list.items.map((item) => (
          <MobileRecordCard key={item.user_id} title={item.name} meta={`id ${item.user_id}`}>
            <MobileRecordField label="Роль" value={item.role} />
            <MobileRecordField label="Первое" value={formatDate(item.first_seen_at)} />
            <MobileRecordField label="Последнее" value={formatDate(item.last_seen_at)} />
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.user_id} className="border-t border-line align-top">
            <td className="px-3 py-2">
              <div className="max-w-[18rem] break-words">
                <p className="font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-ink3">id {item.user_id}</p>
              </div>
            </td>
            <td className="px-3 py-2 break-words">{item.role}</td>
            <td className="px-3 py-2 text-ink3 whitespace-nowrap">{formatDate(item.first_seen_at)}</td>
            <td className="px-3 py-2 text-ink3 whitespace-nowrap">{formatDate(item.last_seen_at)}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
