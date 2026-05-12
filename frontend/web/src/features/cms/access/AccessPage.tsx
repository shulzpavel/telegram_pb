import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, CheckboxField, EmptyState, SelectField, Spinner, Surface, TextField } from "../../../design-system";
import { cmsAccessApi } from "../api/cmsClient";
import type { CmsAdmin, CmsPageAccess, CmsPermission, CmsRole } from "../api/cmsTypes";
import { useCmsList } from "../hooks/useCmsList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { validateCreateAdminInput } from "./accessValidation";

interface AccessPageProps {
  canManage: boolean;
  currentAdminId: number;
}

export default function AccessPage({ canManage, currentAdminId }: AccessPageProps) {
  const [permissions, setPermissions] = useState<CmsPermission[]>([]);
  const [pages, setPages] = useState<CmsPageAccess[]>([]);
  const [roles, setRoles] = useState<CmsRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminQ, setAdminQ] = useState("");
  const [adminActive, setAdminActive] = useState("");
  const [adminRoleId, setAdminRoleId] = useState("");
  const debouncedAdminQ = useDebouncedValue(adminQ);
  const adminParams = useMemo(
    () => ({
      q: debouncedAdminQ,
      active: adminActive === "" ? undefined : adminActive === "true",
      role_id: adminRoleId ? Number(adminRoleId) : undefined,
    }),
    [adminActive, adminRoleId, debouncedAdminQ]
  );
  const adminList = useCmsList<CmsAdmin>("/access/admins", adminParams);

  async function loadAccess() {
    setLoading(true);
    setError(null);
    try {
      const [permissionsPage, pagesPage, rolesPage] = await Promise.all([
        cmsAccessApi.permissions(),
        cmsAccessApi.pages(),
        cmsAccessApi.roles(),
      ]);
      setPermissions(permissionsPage.items);
      setPages(pagesPage.items);
      setRoles(rolesPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Access load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccess();
  }, []);

  const permissionByKey = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions]
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Access control</h2>
          <p className="text-sm text-ink3">Pages are protected by permissions stored in Postgres.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadAccess} disabled={loading} loading={loading}>
          Refresh
        </Button>
      </div>

      {error ? <InlineError text={error} /> : null}
      {!canManage ? <InlineError text="You can view access settings, but cannot manage roles or admins." /> : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <Surface className="p-4">
          <h3 className="text-sm font-bold text-ink">CMS pages</h3>
          <div className="mt-3 space-y-2">
            {pages.map((page) => (
              <div key={page.key} className="grid gap-1 border-b border-line pb-2 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{page.label}</p>
                  <Badge>{page.path}</Badge>
                </div>
                <p className="text-xs text-ink3">
                  {permissionByKey.get(page.permission_key)?.label ?? page.permission_key}
                </p>
              </div>
            ))}
          </div>
        </Surface>

        <CreateRoleCard
          canManage={canManage}
          permissions={permissions}
          onCreated={(role) => setRoles((current) => [...current, role])}
          onError={setError}
        />
      </section>

      <Surface as="section" className="p-4">
        <h3 className="text-sm font-bold text-ink">Roles</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {roles.map((role) => (
            <RoleEditor
              key={role.id}
              role={role}
              permissions={permissions}
              canManage={canManage}
              onSaved={(updated) =>
                setRoles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
              }
              onError={setError}
            />
          ))}
        </div>
      </Surface>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <Surface className="p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">CMS users</h3>
              <p className="text-xs text-ink3">Loaded with cursor pagination; use filters before scrolling deep lists.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={adminList.reload} disabled={adminList.loading} loading={adminList.loading}>
              Refresh
            </Button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_180px]">
            <TextField
              aria-label="Search CMS users"
              placeholder="Search username or display name"
              value={adminQ}
              onChange={(event) => setAdminQ(event.target.value)}
            />
            <SelectField aria-label="Admin status" value={adminActive} onChange={(event) => setAdminActive(event.target.value)}>
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </SelectField>
            <SelectField aria-label="Admin role" value={adminRoleId} onChange={(event) => setAdminRoleId(event.target.value)}>
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </SelectField>
          </div>

          <div className="mt-3 space-y-3">
            {adminList.error ? <InlineError text={adminList.error} /> : null}
            {adminList.items.length === 0 && !adminList.loading ? (
              <EmptyState title="No CMS users found" description="Try a different search, role, or status filter." />
            ) : null}
            {adminList.items.map((admin) => (
              <AdminEditor
                key={admin.id}
                admin={admin}
                roles={roles}
                canManage={canManage}
                isCurrent={admin.id === currentAdminId}
                onSaved={() => { void adminList.reload(); }}
                onError={setError}
              />
            ))}
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink3">
                {adminList.loading ? <span className="inline-flex items-center gap-2"><Spinner size="sm" /> Loading</span> : adminList.cursor ? "More CMS users available" : "End"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={adminList.loadMore}
                disabled={adminList.loading || !adminList.cursor}
              >
                Load more
              </Button>
            </div>
          </div>
        </Surface>

        <CreateAdminCard
          canManage={canManage}
          roles={roles}
          onCreated={() => { void adminList.reload(); }}
          onError={setError}
        />
      </section>
    </section>
  );
}

function CreateRoleCard({
  canManage,
  permissions,
  onCreated,
  onError,
}: {
  canManage: boolean;
  permissions: CmsPermission[];
  onCreated: (role: CmsRole) => void;
  onError: (error: string | null) => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function createRole() {
    setSaving(true);
    onError(null);
    try {
      const role = await cmsAccessApi.createRole({
        key,
        name,
        description,
        permission_keys: permissionKeys,
      });
      onCreated(role);
      setKey("");
      setName("");
      setDescription("");
      setPermissionKeys([]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Role create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">New role</h3>
      <div className="mt-3 space-y-2">
        <TextField
          label="Role key"
          placeholder="role_key"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={!canManage}
        />
        <TextField
          label="Role name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage}
        />
        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!canManage}
        />
        <PermissionPicker
          permissions={permissions}
          selected={permissionKeys}
          disabled={!canManage}
          onChange={setPermissionKeys}
        />
        <Button
          variant="primary"
          className="w-full"
          disabled={!canManage || saving || !key || !name}
          onClick={createRole}
          loading={saving}
        >
          Create role
        </Button>
      </div>
    </Surface>
  );
}

function RoleEditor({
  role,
  permissions,
  canManage,
  onSaved,
  onError,
}: {
  role: CmsRole;
  permissions: CmsPermission[];
  canManage: boolean;
  onSaved: (role: CmsRole) => void;
  onError: (error: string | null) => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [permissionKeys, setPermissionKeys] = useState(role.permission_keys);
  const [saving, setSaving] = useState(false);
  const editable = canManage && !role.is_system;

  async function saveRole() {
    setSaving(true);
    onError(null);
    try {
      const updated = await cmsAccessApi.updateRole(role.id, {
        name,
        description,
        permission_keys: permissionKeys,
      });
      onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="p-3 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{role.key}</p>
          <p className="text-xs text-ink3">{role.is_system ? "system role" : "custom role"}</p>
        </div>
        <Button variant="ghost" size="sm" disabled={!editable || saving} onClick={saveRole} loading={saving}>
          Save
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        <TextField
          label="Role name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!editable}
        />
        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!editable}
        />
        <PermissionPicker
          permissions={permissions}
          selected={permissionKeys}
          disabled={!editable}
          onChange={setPermissionKeys}
        />
      </div>
    </Surface>
  );
}

function CreateAdminCard({
  canManage,
  roles,
  onCreated,
  onError,
}: {
  canManage: boolean;
  roles: CmsRole[];
  onCreated: (admin: CmsAdmin) => void;
  onError: (error: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validationMessages = useMemo(
    () => validateCreateAdminInput({ username, password, roleIds }),
    [password, roleIds, username]
  );
  const canSubmit = canManage && !saving && validationMessages.length === 0;

  async function createAdmin() {
    const errors = validateCreateAdminInput({ username, password, roleIds });
    if (errors.length > 0) {
      setLocalError(errors[0]);
      return;
    }

    setSaving(true);
    setLocalError(null);
    onError(null);
    try {
      const admin = await cmsAccessApi.createAdmin({
        username: username.trim(),
        password,
        display_name: displayName.trim() || null,
        is_active: true,
        role_ids: roleIds,
      });
      onCreated(admin);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRoleIds([]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Admin create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-ink">New CMS user</h3>
      {localError ? <div className="mt-3"><InlineError text={localError} /></div> : null}
      <div className="mt-3 space-y-2">
        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={!canManage}
        />
        <TextField
          label="Temporary password"
          hint="Minimum 8 chars."
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!canManage}
        />
        <TextField
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={!canManage}
        />
        <RolePicker roles={roles} selected={roleIds} disabled={!canManage} onChange={setRoleIds} />
        {validationMessages.length > 0 ? (
          <ul className="space-y-1 text-xs text-ink3">
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <Button
          variant="primary"
          className="w-full"
          disabled={!canSubmit}
          onClick={createAdmin}
          loading={saving}
        >
          Create CMS user
        </Button>
      </div>
    </Surface>
  );
}

function AdminEditor({
  admin,
  roles,
  canManage,
  isCurrent,
  onSaved,
  onError,
}: {
  admin: CmsAdmin;
  roles: CmsRole[];
  canManage: boolean;
  isCurrent: boolean;
  onSaved: (admin: CmsAdmin) => void;
  onError: (error: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState(admin.display_name ?? "");
  const [active, setActive] = useState(admin.is_active);
  const [roleIds, setRoleIds] = useState(admin.roles.map((role) => role.id));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveAdmin() {
    setSaving(true);
    onError(null);
    try {
      const updated = await cmsAccessApi.updateAdmin(admin.id, {
        display_name: displayName || null,
        is_active: active,
        role_ids: roleIds,
        ...(password ? { password } : {}),
      });
      onSaved(updated);
      setPassword("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Admin update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="p-3 shadow-none">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-ink">{admin.username}</p>
            {admin.is_superuser ? <Badge tone="info">superuser</Badge> : null}
            {isCurrent ? <Badge tone="success">you</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-ink3">
            last login {admin.last_login_at ? formatDate(admin.last_login_at) : "never"}
          </p>
        </div>
        <Button variant="ghost" size="sm" disabled={!canManage || saving} onClick={saveAdmin} loading={saving}>
          Save
        </Button>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <TextField
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={!canManage}
        />
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!canManage}
        />
        <CheckboxField
          label="active"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          disabled={!canManage || isCurrent}
        />
      </div>

      <div className="mt-3">
        <RolePicker roles={roles} selected={roleIds} disabled={!canManage} onChange={setRoleIds} />
      </div>
    </Surface>
  );
}

function PermissionPicker({
  permissions,
  selected,
  disabled,
  onChange,
}: {
  permissions: CmsPermission[];
  selected: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="max-h-52 overflow-auto rounded-lg border border-line p-2">
      {permissions.map((permission) => (
        <CheckboxField
          key={permission.key}
          label={permission.label}
          hint={permission.key}
            checked={selected.includes(permission.key)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, permission.key]
                  : selected.filter((key) => key !== permission.key)
              )
            }
        />
      ))}
    </div>
  );
}

function RolePicker({
  roles,
  selected,
  disabled,
  onChange,
}: {
  roles: CmsRole[];
  selected: number[];
  disabled: boolean;
  onChange: (value: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const visibleRoles = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter((role) =>
      `${role.name} ${role.key}`.toLowerCase().includes(query)
    );
  }, [q, roles]);

  return (
    <div className="rounded-lg border border-line p-2">
      {roles.length > 8 ? (
        <TextField
          className="mb-2"
          aria-label="Filter roles"
          placeholder="Filter roles"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          disabled={disabled}
        />
      ) : null}
      <div className="max-h-52 overflow-auto">
        {visibleRoles.map((role) => (
          <CheckboxField
            key={role.id}
            label={role.name}
            hint={role.key}
              checked={selected.includes(role.id)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, role.id]
                    : selected.filter((roleId) => roleId !== role.id)
                )
              }
          />
        ))}
        {visibleRoles.length === 0 ? <p className="py-2 text-sm text-ink3">No roles found.</p> : null}
      </div>
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return <Alert tone="danger">{text}</Alert>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}
