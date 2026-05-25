import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  BackLink as DsBackLink,
  Button,
  CheckboxField,
  Skeleton,
  Spinner,
  Surface,
  TextField,
} from "../../../design-system";
import { cmsAccessApi, cmsEventsApi } from "../api/cmsClient";
import type { AuditEvent, CmsAdmin, CmsRole } from "../api/cmsTypes";
import { HelpCallout, InlineError, Status } from "../components/CmsPrimitives";
import { useAccessContext } from "./AccessShell";
import { RolePicker } from "./parts/RolePicker";
import { formatRelativeTime } from "./parts/helpers";
import { validateCreateAdminInput, ADMIN_PASSWORD_MIN_LENGTH } from "./accessValidation";

const ADMIN_FALLBACK_PAGE_LIMIT = 10;

interface UserDetailLocationState {
  admin?: CmsAdmin;
}

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { canManage, currentAdminId, roles, lookupAdmin, cacheAdmin } = useAccessContext();

  const isNew = params.userId === undefined;
  const userIdNumber = isNew ? null : Number(params.userId);

  const seededAdmin = (location.state as UserDetailLocationState | null)?.admin ?? null;
  const cachedAdmin = !isNew && userIdNumber !== null && !Number.isNaN(userIdNumber)
    ? lookupAdmin(userIdNumber)
    : null;

  const [admin, setAdmin] = useState<CmsAdmin | null>(seededAdmin ?? cachedAdmin);
  const [loadingAdmin, setLoadingAdmin] = useState<boolean>(!isNew && admin === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // For direct URL access we don't have a GET-by-id endpoint, so we scan
  // the paginated admins list until we find the id (or run out of pages).
  useEffect(() => {
    if (isNew) return;
    if (admin) return;
    if (userIdNumber === null || Number.isNaN(userIdNumber)) return;
    let cancelled = false;
    setLoadingAdmin(true);
    setLoadError(null);
    void (async () => {
      try {
        let cursor: string | null = null;
        for (let i = 0; i < ADMIN_FALLBACK_PAGE_LIMIT; i += 1) {
          const page = await cmsAccessApi.admins({}, cursor);
          for (const item of page.items) cacheAdmin(item);
          const match = page.items.find((item) => item.id === userIdNumber);
          if (match) {
            if (!cancelled) {
              setAdmin(match);
              setLoadingAdmin(false);
            }
            return;
          }
          if (!page.next_cursor) break;
          cursor = page.next_cursor;
        }
        if (!cancelled) {
          setLoadingAdmin(false);
          setLoadError("Пользователь не найден. Вернитесь к списку и откройте его оттуда.");
        }
      } catch (err) {
        if (cancelled) return;
        setLoadingAdmin(false);
        setLoadError(err instanceof Error ? err.message : "Не удалось загрузить пользователя.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [admin, cacheAdmin, isNew, userIdNumber]);

  if (!isNew && (userIdNumber === null || Number.isNaN(userIdNumber))) {
    return (
      <section className="space-y-4">
        <BackLink />
        <InlineError text="Некорректный id пользователя." />
      </section>
    );
  }

  if (isNew) {
    return (
      <NewUserView
        canManage={canManage}
        roles={roles}
        onCreated={(created) => {
          cacheAdmin(created);
          navigate(`/cms/access/users/${created.id}`, { replace: true, state: { admin: created } });
        }}
      />
    );
  }

  if (loadingAdmin) {
    return (
      <section className="space-y-4">
        <BackLink />
        <div className="flex items-center gap-2 text-sm text-ink3">
          <Spinner size="sm" />
          <span>Ищем пользователя…</span>
        </div>
        <Skeleton className="h-48" />
      </section>
    );
  }

  if (loadError || !admin) {
    return (
      <section className="space-y-4">
        <BackLink />
        <InlineError text={loadError ?? "Пользователь не найден."} />
      </section>
    );
  }

  return (
    <ExistingUserView
      key={admin.id}
      admin={admin}
      canManage={canManage}
      isCurrent={admin.id === currentAdminId}
      roles={roles}
      onUpdated={(updated) => {
        cacheAdmin(updated);
        setAdmin(updated);
      }}
    />
  );
}

interface NewUserViewProps {
  canManage: boolean;
  roles: CmsRole[];
  onCreated: (admin: CmsAdmin) => void;
}

function NewUserView({ canManage, roles, onCreated }: NewUserViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(
    () => validateCreateAdminInput({ username, password, roleIds }),
    [password, roleIds, username]
  );
  const canSubmit = canManage && !saving && validation.length === 0;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const created = await cmsAccessApi.createAdmin({
        username: username.trim(),
        password,
        display_name: displayName.trim() || null,
        is_active: true,
        role_ids: roleIds,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать пользователя.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <BackLink />
        <h3 className="text-lg font-bold text-ink">Новый пользователь</h3>
        <p className="text-xs text-ink3">Логин латиницей, временный пароль минимум {ADMIN_PASSWORD_MIN_LENGTH} символов.</p>
      </header>

      {error ? <InlineError text={error} /> : null}
      {!canManage ? (
        <HelpCallout title="Только для чтения">
          <p>У вас нет права создавать пользователей CMS.</p>
        </HelpCallout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-4 lg:col-span-2">
          <h4 className="text-sm font-bold text-ink">Профиль</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label="Username"
              placeholder="lead.user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={!canManage}
            />
            <TextField
              label="Отображаемое имя"
              placeholder="Имя и фамилия"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={!canManage}
            />
            <TextField
              className="sm:col-span-2"
              label="Временный пароль"
              type="password"
              hint={`Минимум ${ADMIN_PASSWORD_MIN_LENGTH} символов. Пользователь сможет сменить его позже.`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!canManage}
            />
          </div>

          <h4 className="mt-5 text-sm font-bold text-ink">Роли</h4>
          <p className="mt-1 text-xs text-ink3">Назначьте минимум одну роль — без ролей пользователь не увидит ни одного раздела.</p>
          <div className="mt-2">
            <RolePicker
              roles={roles}
              selected={roleIds}
              disabled={!canManage}
              onChange={setRoleIds}
            />
          </div>

          {validation.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-red">
              {validation.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          ) : null}
        </Surface>

        <HelpCallout title="Чек-лист">
          <p><b>1.</b> Username — латиница, цифры, точка, дефис, @.</p>
          <p><b>2.</b> Пароль придумайте сами и передайте пользователю — он сменит его при первом входе.</p>
          <p><b>3.</b> Назначьте только те роли, которые реально нужны. Полный доступ — роль <code className="rounded bg-line2 px-1 text-xs">superadmin</code>.</p>
        </HelpCallout>
      </div>

      <footer className="sticky bottom-0 z-10 -mx-3 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <Button variant="ghost" onClick={() => { setUsername(""); setPassword(""); setDisplayName(""); setRoleIds([]); }} disabled={saving}>
          Очистить
        </Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={!canSubmit}
          onClick={submit}
        >
          Создать пользователя
        </Button>
      </footer>
    </section>
  );
}

interface ExistingUserViewProps {
  admin: CmsAdmin;
  canManage: boolean;
  isCurrent: boolean;
  roles: CmsRole[];
  onUpdated: (admin: CmsAdmin) => void;
}

function ExistingUserView({ admin, canManage, isCurrent, roles, onUpdated }: ExistingUserViewProps) {
  const [displayName, setDisplayName] = useState(admin.display_name ?? "");
  const [isActive, setIsActive] = useState(admin.is_active);
  const [roleIds, setRoleIds] = useState<number[]>(admin.roles.map((role) => role.id));

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [passwordModal, setPasswordModal] = useState(false);

  const profileDirty = displayName !== (admin.display_name ?? "") || isActive !== admin.is_active;
  const rolesDirty = useMemo(() => {
    const before = new Set(admin.roles.map((role) => role.id));
    if (before.size !== roleIds.length) return true;
    return roleIds.some((id) => !before.has(id));
  }, [admin.roles, roleIds]);

  async function saveProfile() {
    setError(null);
    setSuccess(null);
    setSavingProfile(true);
    try {
      const updated = await cmsAccessApi.updateAdmin(admin.id, {
        display_name: displayName.trim() || null,
        is_active: isActive,
        role_ids: roleIds,
      });
      onUpdated(updated);
      setSuccess("Профиль сохранён.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveRoles() {
    setError(null);
    setSuccess(null);
    setSavingRoles(true);
    try {
      const updated = await cmsAccessApi.updateAdmin(admin.id, {
        display_name: displayName.trim() || null,
        is_active: isActive,
        role_ids: roleIds,
      });
      onUpdated(updated);
      setSuccess("Роли обновлены.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить роли.");
    } finally {
      setSavingRoles(false);
    }
  }

  async function applyPasswordReset(newPassword: string) {
    setError(null);
    setSuccess(null);
    try {
      const updated = await cmsAccessApi.updateAdmin(admin.id, {
        display_name: displayName.trim() || null,
        is_active: isActive,
        role_ids: roleIds,
        password: newPassword,
      });
      onUpdated(updated);
      setSuccess("Пароль обновлён. Передайте новый пароль пользователю.");
      setPasswordModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить пароль.");
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-ink">
            <code className="font-mono">{admin.username}</code>
          </h3>
          {isCurrent ? <Badge tone="success">это вы</Badge> : null}
          {admin.is_superuser ? <Badge tone="info">superuser</Badge> : null}
          <Status active={admin.is_active} label={admin.is_active ? "активен" : "отключён"} />
        </div>
        <p className="text-xs text-ink3">
          Последний вход: {formatRelativeTime(admin.last_login_at)}.{" "}
          Создан: {formatRelativeTime(admin.created_at)}.
        </p>
      </header>

      {error ? <InlineError text={error} /> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Surface className="p-4">
            <h4 className="text-sm font-bold text-ink">Профиль</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Отображаемое имя"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={!canManage}
              />
              <CheckboxField
                label="Активен"
                hint={isCurrent ? "Себя нельзя отключить" : "Снимите галочку — пользователь не сможет войти"}
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={!canManage || isCurrent}
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => { setDisplayName(admin.display_name ?? ""); setIsActive(admin.is_active); }} disabled={!profileDirty || savingProfile}>
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={saveProfile}
                disabled={!canManage || !profileDirty || savingProfile}
                loading={savingProfile}
              >
                Сохранить профиль
              </Button>
            </div>
          </Surface>

          <Surface className="p-4">
            <h4 className="text-sm font-bold text-ink">Роли</h4>
            <p className="mt-1 text-xs text-ink3">Минимум одна роль. Без ролей пользователь увидит пустую CMS.</p>
            <div className="mt-3">
              <RolePicker
                roles={roles}
                selected={roleIds}
                disabled={!canManage}
                onChange={setRoleIds}
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setRoleIds(admin.roles.map((role) => role.id))} disabled={!rolesDirty || savingRoles}>
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={saveRoles}
                disabled={!canManage || !rolesDirty || savingRoles || roleIds.length === 0}
                loading={savingRoles}
                title={roleIds.length === 0 ? "Назначьте хотя бы одну роль" : undefined}
              >
                Сохранить роли
              </Button>
            </div>
          </Surface>

          <Surface className="p-4">
            <h4 className="text-sm font-bold text-ink">Пароль</h4>
            <p className="mt-1 text-xs text-ink3">
              Установите новый временный пароль для пользователя. Он сам сменит его при первом входе.
            </p>
            <div className="mt-3">
              <Button
                variant="danger"
                onClick={() => setPasswordModal(true)}
                disabled={!canManage}
              >
                Сбросить пароль…
              </Button>
            </div>
          </Surface>
        </div>

        <div className="space-y-4">
          <RecentActionsPanel username={admin.username} />
        </div>
      </div>

      <PasswordResetDialog
        open={passwordModal}
        username={admin.username}
        onCancel={() => setPasswordModal(false)}
        onConfirm={applyPasswordReset}
      />
    </section>
  );
}

function BackLink() {
  return <DsBackLink to="/cms/access/users" label="К пользователям" size="sm" />;
}

interface PasswordResetDialogProps {
  open: boolean;
  username: string;
  onCancel: () => void;
  onConfirm: (newPassword: string) => Promise<void>;
}

function PasswordResetDialog({ open, username, onCancel, onConfirm }: PasswordResetDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError(null);
    setSubmitting(false);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open) return null;

  const trimmed = password.trim();
  const isValid = trimmed.length >= ADMIN_PASSWORD_MIN_LENGTH;

  async function submit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить пароль.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm"
      >
        <Surface className="p-4">
          <h2 id={titleId} className="text-base font-bold text-ink">Сбросить пароль</h2>
          <p id={descriptionId} className="mt-2 text-sm text-ink3">
            Введите новый пароль для <code className="font-mono">{username}</code>. Минимум {ADMIN_PASSWORD_MIN_LENGTH} символов.
          </p>
          <div className="mt-3">
            <TextField
              ref={inputRef}
              type="password"
              label="Новый пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              error={password.length > 0 && !isValid ? `Минимум ${ADMIN_PASSWORD_MIN_LENGTH} символов.` : null}
              hint={`Минимум ${ADMIN_PASSWORD_MIN_LENGTH} символов.`}
              disabled={submitting}
            />
          </div>
          {error ? (
            <div className="mt-3"><InlineError text={error} /></div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>Отмена</Button>
            <Button variant="danger" onClick={submit} loading={submitting} disabled={!isValid || submitting}>
              Сбросить пароль
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}

interface RecentActionsPanelProps {
  username: string;
}

function RecentActionsPanel({ username }: RecentActionsPanelProps) {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await cmsEventsApi.list({ actor: username, limit: 10 });
      setItems(page.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить журнал действий.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Surface className="p-4">
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">Последние действия</h4>
        <Link
          to={`/cms/events?actor=${encodeURIComponent(username)}`}
          className="text-xs font-semibold text-blue hover:underline"
        >
          Все →
        </Link>
      </header>

      {loading ? (
        <div className="mt-3"><Skeleton className="h-24" /></div>
      ) : error ? (
        <div className="mt-3"><InlineError text={error} /></div>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line bg-line2/30 px-3 py-4 text-center text-xs text-ink3">
          Пользователь ещё ничего не делал.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((event) => (
            <li key={event.id} className="rounded-md border border-line bg-canvas/40 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="font-mono text-xs text-ink2">{event.action}</code>
                <Status active={event.status === "ok"} label={event.status === "ok" ? "успех" : "ошибка"} />
              </div>
              <p className="mt-1 text-xs text-ink3">{formatRelativeTime(event.ts)}</p>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
