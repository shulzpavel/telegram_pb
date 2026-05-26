import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, ConfirmDialog, EmptyState, SelectField } from "../../../design-system";
import { cmsTokensApi } from "../api/cmsClient";
import type { TokenItem } from "../api/cmsTypes";
import {
  DataTable,
  HelpCallout,
  InlineError,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Status,
  Toolbar,
} from "../components/CmsPrimitives";
import { useCmsList } from "../hooks/useCmsList";
import { formatDate, shortHash } from "../../../shared/lib/format";
import { sessionKeyChip } from "../sessions/sessionTitle";

interface TokensPageProps {
  canManageSessions: boolean;
}

export default function TokensPage({ canManageSessions }: TokensPageProps) {
  const navigate = useNavigate();
  const [active, setActive] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<TokenItem | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useMemo(() => ({ active: active === "" ? undefined : active === "true" }), [active]);
  const list = useCmsList<TokenItem>("/tokens", params, { scrollKey: "cms-tokens" });

  async function revoke(item: TokenItem) {
    setBusy(item.id);
    setError(null);
    setInfo(null);
    try {
      await cmsTokensApi.revoke(item.id);
      setInfo(`Invite-ссылка ${item.token_prefix}… отозвана.`);
      await list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отозвать ссылку");
    } finally {
      setBusy(null);
      setConfirmTarget(null);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Invite-ссылки"
        description="Одноразовые приглашения, по которым участники подключаются к сессии без логина."
      />
      <HelpCallout title="Что это и зачем">
        <p>
          Когда менеджер создаёт сессию, генерируется короткий токен и публичная ссылка вида <code className="rounded bg-line2 px-1 text-xs">/s/&lt;token&gt;</code>.
          Участник открывает её, вводит имя и сразу попадает в комнату — пароль не нужен.
        </p>
        <p>
          Время жизни ссылки — несколько часов. Если ссылка попала не тому, нажмите «Отозвать»: текущий доступ обрывается, придётся выпустить новую.
        </p>
        <p>Поле «Подключений» показывает, сколько разных людей зашли по этой ссылке.</p>
      </HelpCallout>
      {info ? <Alert tone="success">{info}</Alert> : null}
      {error ? <InlineError text={error} /> : null}
      <Toolbar>
        <SelectField
          className="md:max-w-[220px]"
          aria-label="Статус ссылки"
          value={active}
          onChange={(event) => setActive(event.target.value)}
        >
          <option value="">Все ссылки</option>
          <option value="true">Активные</option>
          <option value="false">Истёкшие</option>
        </SelectField>
        <Button variant="ghost" size="sm" className="md:self-end whitespace-nowrap" onClick={list.reload}>Обновить</Button>
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
        itemNoun="ссылок"
        columns={["Ссылка", "Сессия", "Подключений", "Статус", "Истекает", "Действия"]}
        empty={
          list.items.length === 0 && !list.loading ? (
            // Filter-set vs truly-empty roster: in the second case we
            // direct the user to the only place where tokens are
            // actually issued — the cockpit — instead of leaving an
            // explanatory paragraph with no CTA.
            active ? (
              <EmptyState
                title="По этому фильтру ссылок нет"
                description="Поменяйте статус, чтобы увидеть остальные ссылки."
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActive("")}
                  >
                    Сбросить фильтр
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Invite-ссылок пока нет"
                description="Ссылка выпускается автоматически при создании сессии. Создайте первую — в cockpit появится кнопка «Скопировать invite»."
                action={
                  canManageSessions ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate("/manage")}
                    >
                      Создать сессию
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : null
        }
        mobileCards={list.items.map((item) => (
          <MobileRecordCard
            key={item.id}
            title={<span className="break-all font-mono text-sm">{item.token_prefix}…</span>}
            meta={<span className="break-all font-mono text-ink4">{shortHash(item.token_hash)}</span>}
            action={<Status active={item.is_active} label={item.is_active ? "активна" : "истекла"} />}
          >
            <MobileRecordField label="Сессия" value={`Сессия ${sessionKeyChip(item)}`} />
            <MobileRecordField label="Подключений" value={item.participants_joined} />
            <MobileRecordField label="Истекает" value={formatDate(item.expires_at)} />
            <MobileRecordField label="Создана" value={formatDate(item.created_at)} />
            {canManageSessions && item.is_active ? (
              <div className="col-span-2 mt-1">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === item.id}
                  loading={busy === item.id}
                  onClick={() => setConfirmTarget(item)}
                >
                  Отозвать
                </Button>
              </div>
            ) : null}
          </MobileRecordCard>
        ))}
      >
        {list.items.map((item) => (
          <tr key={item.id} className="border-t border-line align-top">
            <td className="px-3 py-2">
              <div className="max-w-[18rem]">
                <p className="break-all font-mono text-xs font-semibold text-ink">{item.token_prefix}…</p>
                <p className="break-all text-xs text-ink3">{shortHash(item.token_hash)}</p>
              </div>
            </td>
            <td className="px-3 py-2 whitespace-nowrap">Сессия {sessionKeyChip(item)}</td>
            <td className="px-3 py-2 tabular-nums">{item.participants_joined}</td>
            <td className="px-3 py-2"><Status active={item.is_active} label={item.is_active ? "активна" : "истекла"} /></td>
            <td className="px-3 py-2 text-ink3 whitespace-nowrap">{formatDate(item.expires_at)}</td>
            <td className="px-3 py-2">
              {canManageSessions && item.is_active ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === item.id}
                  loading={busy === item.id}
                  onClick={() => setConfirmTarget(item)}
                >
                  Отозвать
                </Button>
              ) : (
                <span className="text-xs text-ink4">—</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <ConfirmDialog
        open={confirmTarget !== null}
        title="Отозвать invite-ссылку?"
        description={
          confirmTarget
            ? `Ссылка ${confirmTarget.token_prefix}… сразу перестанет работать. Если нужен новый доступ — попросите менеджера выпустить свежую из cockpit.`
            : ""
        }
        confirmLabel="Отозвать"
        cancelLabel="Отмена"
        tone="danger"
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) void revoke(confirmTarget);
        }}
      />
    </section>
  );
}
