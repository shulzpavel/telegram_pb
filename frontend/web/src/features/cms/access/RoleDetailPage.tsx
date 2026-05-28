import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  BackLink as DsBackLink,
  Button,
  Skeleton,
  StickyActionFooter,
  Surface,
  TextField,
  TextareaField,
} from "../../../design-system";
import { cmsAccessApi } from "../api/cmsClient";
import type { CmsAdmin, CmsRole } from "../api/cmsTypes";
import { HelpCallout, InlineError } from "../components/CmsPrimitives";
import { useAccessContext } from "./AccessShell";
import { PermissionPicker } from "./parts/PermissionPicker";
import { formatRelativeTime } from "./parts/helpers";

interface RoleDetailLocationState {
  role?: CmsRole;
}

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/i;

export default function RoleDetailPage() {
  const params = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { roles, permissions, canManage, addRole, replaceRole } = useAccessContext();

  const isNew = params.roleId === undefined;
  const roleIdNumber = isNew ? null : Number(params.roleId);
  const seededRole = (location.state as RoleDetailLocationState | null)?.role;
  const role = useMemo<CmsRole | null>(() => {
    if (isNew) return null;
    if (roleIdNumber !== null && !Number.isNaN(roleIdNumber)) {
      return roles.find((item) => item.id === roleIdNumber) ?? seededRole ?? null;
    }
    return seededRole ?? null;
  }, [isNew, roleIdNumber, roles, seededRole]);

  if (!isNew && roleIdNumber !== null && Number.isNaN(roleIdNumber)) {
    return (
      <section className="space-y-4">
        <BackLink />
        <InlineError text="Некорректный id роли." />
      </section>
    );
  }

  if (!isNew && role === null) {
    // Either roles haven't loaded yet or this is an unknown id. The context
    // shows a global skeleton on first load, so this branch only matters
    // when an out-of-range id was typed manually.
    return (
      <section className="space-y-4">
        <BackLink />
        <Skeleton className="h-24" />
      </section>
    );
  }

  return (
    <RoleDetailContent
      key={role?.id ?? "new"}
      role={role}
      isNew={isNew}
      canManage={canManage}
      permissions={permissions}
      onCreated={(created) => {
        addRole(created);
        navigate(`/cms/access/roles/${created.id}`, { replace: true, state: { role: created } });
      }}
      onUpdated={(updated) => {
        replaceRole(updated);
      }}
    />
  );
}

interface RoleDetailContentProps {
  role: CmsRole | null;
  isNew: boolean;
  canManage: boolean;
  permissions: ReturnType<typeof useAccessContext>["permissions"];
  onCreated: (role: CmsRole) => void;
  onUpdated: (role: CmsRole) => void;
}

function RoleDetailContent({ role, isNew, canManage, permissions, onCreated, onUpdated }: RoleDetailContentProps) {
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissionKeys, setPermissionKeys] = useState<string[]>(role?.permission_keys ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSystem = role?.is_system === true;
  const editable = canManage && !isSystem;

  const dirty = useMemo(() => {
    if (isNew) return Boolean(key || name || description || permissionKeys.length > 0);
    if (!role) return false;
    if (name !== role.name) return true;
    if (description !== role.description) return true;
    if (permissionKeys.length !== role.permission_keys.length) return true;
    const set = new Set(role.permission_keys);
    return permissionKeys.some((k) => !set.has(k));
  }, [description, isNew, key, name, permissionKeys, role]);

  const validation = useMemo(() => validateRoleForm({ key, name, isNew }), [isNew, key, name]);
  const canSubmit = editable && !saving && validation.length === 0 && dirty;

  async function save() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await cmsAccessApi.createRole({
          key: key.trim(),
          name: name.trim(),
          description: description.trim(),
          permission_keys: permissionKeys,
        });
        setSuccess("Роль создана.");
        onCreated(created);
      } else if (role) {
        const updated = await cmsAccessApi.updateRole(role.id, {
          name: name.trim(),
          description: description.trim(),
          permission_keys: permissionKeys,
        });
        setSuccess("Изменения сохранены.");
        onUpdated(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить роль.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setError(null);
    setSuccess(null);
    if (role) {
      setKey(role.key);
      setName(role.name);
      setDescription(role.description);
      setPermissionKeys(role.permission_keys);
    } else {
      setKey("");
      setName("");
      setDescription("");
      setPermissionKeys([]);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <BackLink />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-ink">
              {isNew ? "Новая роль" : role?.name || "Роль"}
            </h3>
            {role
              ? role.is_system
                ? <Badge tone="info">системная</Badge>
                : <Badge tone="neutral">кастомная</Badge>
              : null}
          </div>
          {role ? (
            <p className="mt-0.5 text-xs text-ink3">
              <code className="font-mono">{role.key}</code> · обновлена {formatRelativeTime(role.updated_at)}
            </p>
          ) : null}
        </div>
      </header>

      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <InlineError text={error} /> : null}
      {!editable && role ? (
        <HelpCallout title={isSystem ? "Системная роль" : "Только для чтения"}>
          <p>
            {isSystem
              ? "Системные роли защищены от изменений. Чтобы поменять состав permissions — создайте копию как кастомную роль."
              : "У вас нет права изменять роли в CMS. Просмотр доступен."}
          </p>
        </HelpCallout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-4 lg:col-span-2">
          <h4 className="text-sm font-bold text-ink">Метаданные</h4>
          <div className="mt-3 space-y-2">
            <TextField
              label="Ключ роли"
              hint={
                isNew
                  ? "Латиница, цифры, _ и дефис. Используется в коде и аудите — поменять потом нельзя."
                  : "Ключ роли не меняется после создания."
              }
              placeholder="role_key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!isNew || !editable}
            />
            <TextField
              label="Название"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!editable}
            />
            <TextareaField
              label="Описание"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!editable}
              hint="Коротко объясните, для кого эта роль и какой доступ она даёт."
            />
          </div>

          <h4 className="mt-5 text-sm font-bold text-ink">Permissions</h4>
          <p className="mt-1 text-xs text-ink3">
            Атомарные права, сгруппированные по разделу. Используйте поиск и «Выбрать все» внутри группы.
          </p>
          <div className="mt-2">
            <PermissionPicker
              permissions={permissions}
              selected={permissionKeys}
              disabled={!editable}
              onChange={setPermissionKeys}
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

        <div className="space-y-4">
          {isNew ? (
            <HelpCallout title="Как создать роль">
              <p>
                <b>1.</b> Придумайте короткий ключ латиницей — он понадобится в коде и журнале действий.
              </p>
              <p>
                <b>2.</b> Назовите роль так, как её прочитают другие админы (например, «Менеджер сессий»).
              </p>
              <p>
                <b>3.</b> Выберите permissions внутри групп. Минимум для просмотра CMS — <code className="rounded bg-line2 px-1 text-xs">cms.overview.view</code>.
              </p>
              <p>
                <b>4.</b> Сохраните — затем назначайте роль пользователям из вкладки «Пользователи».
              </p>
            </HelpCallout>
          ) : role ? (
            <RoleUsersPanel role={role} />
          ) : null}
        </div>
      </div>

      <StickyActionFooter>
          <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
            Сбросить изменения
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={saving}
            disabled={!canSubmit}
            title={
              !editable
                ? isSystem
                  ? "Системная роль не редактируется"
                  : "У вас нет прав на изменение"
                : undefined
            }
          >
            {isNew ? "Создать роль" : "Сохранить"}
          </Button>
      </StickyActionFooter>
    </section>
  );
}

function BackLink() {
  return <DsBackLink to="/cms/access/roles" label="К ролям" size="sm" />;
}

function validateRoleForm(input: { key: string; name: string; isNew: boolean }): string[] {
  const errors: string[] = [];
  if (input.isNew) {
    const key = input.key.trim();
    if (!key) errors.push("Укажите ключ роли.");
    else if (!ROLE_KEY_PATTERN.test(key)) {
      errors.push("Ключ роли — латиница, цифры, _ или дефис (2–64 символа).");
    }
  }
  if (!input.name.trim()) errors.push("Название роли обязательно.");
  return errors;
}

interface RoleUsersPanelProps {
  role: CmsRole;
}

function RoleUsersPanel({ role }: RoleUsersPanelProps) {
  const [items, setItems] = useState<CmsAdmin[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await cmsAccessApi.admins({ role_id: role.id }, null);
      const limited = page.items.slice(0, 8);
      setItems(limited);
      setHasMore(Boolean(page.next_cursor) || page.items.length > limited.length);
      setTotal(page.items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить пользователей.");
    } finally {
      setLoading(false);
    }
  }, [role.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Surface className="p-4">
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">Пользователи с этой ролью</h4>
        <Link
          to={`/cms/access/users?role_id=${role.id}`}
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
          Пока никто не носит эту роль.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-line2">
              <Link
                to={`/cms/access/users/${admin.id}`}
                state={{ admin }}
                className="min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold text-ink"
              >
                <code className="font-mono text-xs">{admin.username}</code>
                {admin.display_name ? <span className="ml-2 text-ink3">{admin.display_name}</span> : null}
              </Link>
              {admin.is_active ? null : <Badge tone="warning">отключён</Badge>}
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <p className="mt-2 text-xs text-ink3">
          Показаны первые {items.length}{total !== null ? ` из ${total}+` : ""} — откройте полный список.
        </p>
      ) : null}
    </Surface>
  );
}
