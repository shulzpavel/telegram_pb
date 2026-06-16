import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, ConfirmDialog, DropdownField, EmptyState, TextField } from "../../../design-system";
import { cmsUsersApi } from "../api/cmsClient";
import type { CmsPrincipal, UserItem } from "../api/cmsTypes";
import { CMS_PERMISSIONS, hasPermission } from "../navigation";
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

export default function UsersPage({ principal }: { principal: CmsPrincipal }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(q);
  const params = useMemo(() => ({ q: debouncedQ, role: role || undefined }), [debouncedQ, role]);
  const list = useCmsList<UserItem>("/users", params, { scrollKey: "cms-users" });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const canHardDeleteParticipants = hasPermission(principal, CMS_PERMISSIONS.webParticipantsDelete);
  const deleteConfirmed = deleteTarget !== null && deleteConfirmName.trim() === deleteTarget.name;

  function openDeleteDialog(item: UserItem) {
    setDeleteTarget(item);
    setDeleteConfirmName("");
    setDeleteError(null);
  }

  async function hardDeleteParticipant() {
    if (!deleteTarget || !deleteConfirmed || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await cmsUsersApi.hardDelete(deleteTarget.user_id, deleteConfirmName.trim());
      setDeleteTarget(null);
      setDeleteConfirmName("");
      await list.reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Не удалось удалить участника");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Участники"
        description="Все, кто заходил в сессии планинг-покера. Один человек — одна запись; данные обновляются при каждом подключении."
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
        <DropdownField
          className="md:max-w-[200px]"
          aria-label="Роль участника"
          value={role}
          options={[
            { value: "", label: "Все роли" },
            { value: "participant", label: "Participant" },
            { value: "lead", label: "Lead" },
            { value: "admin", label: "Admin" },
          ]}
          onChange={setRole}
        />
        <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={list.reload}>Обновить</Button>
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
        columns={canHardDeleteParticipants ? ["Участник", "Роль", "Первое подключение", "Последнее подключение", ""] : ["Участник", "Роль", "Первое подключение", "Последнее подключение"]}
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
            {canHardDeleteParticipants ? (
              <div className="pt-2">
                <Button variant="danger" size="sm" onClick={() => openDeleteDialog(item)}>
                  Удалить навсегда
                </Button>
              </div>
            ) : null}
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
            {canHardDeleteParticipants ? (
              <td className="px-3 py-2 text-right">
                <Button variant="danger" size="sm" onClick={() => openDeleteDialog(item)}>
                  Удалить
                </Button>
              </td>
            ) : null}
          </tr>
        ))}
      </DataTable>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить участника навсегда?"
        description={
          <div className="space-y-3">
            <p>
              Это hard delete из CMS: карточка участника, связи с сессиями, web-подключения и строки голосов будут удалены без восстановления.
            </p>
            {deleteTarget ? (
              <div className="rounded-lg border border-line bg-line2 p-3 text-xs text-ink2">
                <p className="font-semibold text-ink">{deleteTarget.name}</p>
                <p>id {deleteTarget.user_id}</p>
              </div>
            ) : null}
            <TextField
              label="Для подтверждения введите имя участника"
              autoFocus
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              placeholder={deleteTarget?.name ?? ""}
              disabled={deleteBusy}
              reserveMessageSpace={false}
            />
            {deleteError ? <Alert tone="danger">{deleteError}</Alert> : null}
          </div>
        }
        confirmLabel="Удалить навсегда"
        cancelLabel="Отмена"
        tone="danger"
        busy={deleteBusy}
        confirmDisabled={!deleteConfirmed}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteConfirmName("");
          setDeleteError(null);
        }}
        onConfirm={() => { void hardDeleteParticipant(); }}
      />
    </section>
  );
}
