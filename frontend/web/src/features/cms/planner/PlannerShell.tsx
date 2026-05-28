import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Spinner,
  TextField,
  TextareaField,
  useToast,
} from "../../../design-system";
import { cmsPlannerApi, type SprintPlanPayload, type SprintPlanRecord } from "../api/cmsClient";
import {
  HelpCallout,
  InlineError,
  MobileRecordCard,
  MobileRecordField,
  SectionHeader,
  Skeleton,
} from "../components/CmsPrimitives";
import {
  BOOTSTRAP_VELOCITY_SP,
  DEFAULT_BUFFER_PERCENT,
  computePlannerResult,
  summarizePlannerResult,
  type PlannerInputs,
  type PlannerResult,
} from "./plannerCalc";

interface PlannerShellProps {
  canManage: boolean;
}

/**
 * `/cms/planner` entry point. Routes the list view and the editor; the editor
 * is shared between "new" and "edit by id" cases.
 */
export default function PlannerShell({ canManage }: PlannerShellProps) {
  return (
    <Routes>
      <Route index element={<PlannerListPage canManage={canManage} />} />
      <Route path="new" element={<PlannerEditorPage canManage={canManage} mode="create" />} />
      <Route path=":planId" element={<PlannerEditorPage canManage={canManage} mode="edit" />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function PlannerListPage({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<SprintPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SprintPlanRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cmsPlannerApi.list();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список планов.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await cmsPlannerApi.delete(pendingDelete.id);
      setItems((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить план.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Планирование SP"
        description="Калькулятор Velocity/Capacity по командному гайду. Сохранённые расчёты остаются здесь для следующего спринта."
        actions={
          canManage ? (
            <Button variant="primary" size="sm" onClick={() => navigate("new")}>
              Новый план
            </Button>
          ) : undefined
        }
      />

      <HelpCallout title="Кратко">
        <p>
          Velocity = среднее закрытых SP за последние 3–5 спринтов. Capacity = человеко-дни команды
          с учётом отпусков. План = Velocity × (Capacity новый / Capacity средний), затем минус
          буфер (по умолчанию 20%) на незапланированные задачи.
        </p>
      </HelpCallout>

      {error ? <InlineError text={error} /> : null}

      {loading ? (
        <Skeleton height="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Ещё нет ни одного плана"
          description="Создайте первый, чтобы оценить план на ближайший спринт."
          action={
            canManage ? (
              <Button variant="primary" onClick={() => navigate("new")}>
                Новый план
              </Button>
            ) : undefined
          }
        />
      ) : (
        <PlannerList items={items} canManage={canManage} onEdit={(id) => navigate(`${id}`)} onDelete={setPendingDelete} />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Удалить план?"
        description={
          pendingDelete ? (
            <span>
              План <b>«{pendingDelete.name}»</b> будет удалён без возможности восстановить.
            </span>
          ) : (
            <span />
          )
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

function PlannerList({
  items,
  canManage,
  onEdit,
  onDelete,
}: {
  items: SprintPlanRecord[];
  canManage: boolean;
  onEdit: (id: number) => void;
  onDelete: (record: SprintPlanRecord) => void;
}) {
  return (
    <div className="space-y-3 md:space-y-0">
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {items.map((item) => {
          const summary = item.payload.result_summary ?? "—";
          return (
            <MobileRecordCard
              key={item.id}
              title={item.name}
              meta={summary}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(item.id)}>
                    Открыть
                  </Button>
                  {canManage ? (
                    <Button size="sm" variant="danger" onClick={() => onDelete(item)}>
                      Удалить
                    </Button>
                  ) : null}
                </div>
              }
            >
              <MobileRecordField label="Создан" value={formatDate(item.created_at)} />
              <MobileRecordField label="Обновлён" value={formatDate(item.updated_at)} />
              <MobileRecordField label="Автор" value={item.created_by_display_name || item.created_by_username || "—"} />
            </MobileRecordCard>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface shadow-card md:block">
        <table className="w-full table-auto text-sm">
          <thead className="bg-line2 text-xs uppercase text-ink3">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Название</th>
              <th className="px-3 py-2 text-left font-bold">Результат</th>
              <th className="px-3 py-2 text-left font-bold">Обновлён</th>
              <th className="px-3 py-2 text-left font-bold">Автор</th>
              <th className="px-3 py-2 text-right font-bold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-3 py-2 align-top">
                  <button
                    type="button"
                    onClick={() => onEdit(item.id)}
                    className="text-left font-semibold text-ink hover:text-blue focus-visible:outline-none focus-visible:underline"
                  >
                    {item.name}
                  </button>
                </td>
                <td className="px-3 py-2 align-top text-ink2">{item.payload.result_summary ?? "—"}</td>
                <td className="px-3 py-2 align-top text-ink3">{formatDate(item.updated_at)}</td>
                <td className="px-3 py-2 align-top text-ink3">
                  {item.created_by_display_name || item.created_by_username || "—"}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <div className="inline-flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(item.id)}>
                      Открыть
                    </Button>
                    {canManage ? (
                      <Button size="sm" variant="danger" onClick={() => onDelete(item)}>
                        Удалить
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Editor view
// ---------------------------------------------------------------------------

const DEFAULT_ROLES: PlannerInputs["roles"] = [
  { name: "Backend", headcount: 3, absences: 0 },
  { name: "Frontend", headcount: 3, absences: 0 },
  { name: "QA", headcount: 3, absences: 0 },
];

const DEFAULT_HISTORY: PlannerInputs["velocityHistory"] = [
  { label: "Спринт −1", storyPointsDev: 0, storyPointsTest: 0 },
  { label: "Спринт −2", storyPointsDev: 0, storyPointsTest: 0 },
  { label: "Спринт −3", storyPointsDev: 0, storyPointsTest: 0 },
];

function emptyInputs(): PlannerInputs {
  return {
    workingDays: 10,
    averageCapacity: 0,
    bufferPercent: DEFAULT_BUFFER_PERCENT,
    velocityHistory: DEFAULT_HISTORY.map((entry) => ({ ...entry })),
    roles: DEFAULT_ROLES.map((entry) => ({ ...entry })),
  };
}

function payloadToInputs(payload: SprintPlanPayload): PlannerInputs {
  return {
    workingDays: payload.working_days,
    averageCapacity: payload.average_capacity,
    bufferPercent: payload.buffer_percent,
    velocityHistory: payload.velocity_history.map((entry) => {
      // Backwards-compat: older plans stored a single `story_points` field
      // before we split dev/test. Map it onto both tracks so the loaded plan
      // produces the same velocity it did before the migration.
      const legacy = entry.story_points;
      return {
        label: entry.label,
        storyPointsDev: entry.story_points_dev ?? legacy ?? 0,
        storyPointsTest: entry.story_points_test ?? legacy ?? 0,
      };
    }),
    roles: payload.roles.map((role) => ({
      name: role.name,
      headcount: role.headcount,
      absences: role.absences,
    })),
  };
}

function inputsToPayload(
  inputs: PlannerInputs,
  notes: string,
  result: PlannerResult,
): SprintPlanPayload {
  return {
    working_days: inputs.workingDays,
    average_capacity: inputs.averageCapacity,
    buffer_percent: inputs.bufferPercent,
    velocity_history: inputs.velocityHistory.map((entry) => ({
      label: entry.label,
      // Legacy `story_points` is required by older backends (deployed before
      // the dev/test split). Send max(dev, test) so old releases keep
      // accepting the payload without changing the meaning for new ones.
      story_points: Math.max(entry.storyPointsDev, entry.storyPointsTest),
      story_points_dev: entry.storyPointsDev,
      story_points_test: entry.storyPointsTest,
    })),
    roles: inputs.roles.map((role) => ({
      name: role.name,
      headcount: role.headcount,
      absences: role.absences,
    })),
    notes,
    result_summary: summarizePlannerResult(result),
  };
}

function PlannerEditorPage({
  canManage,
  mode,
}: {
  canManage: boolean;
  mode: "create" | "edit";
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams<{ planId: string }>();
  const planId = mode === "edit" ? Number(params.planId) : null;

  const [name, setName] = useState<string>(() => defaultPlanName());
  const [notes, setNotes] = useState("");
  const [inputs, setInputs] = useState<PlannerInputs>(() => emptyInputs());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [legacyBackendDetected, setLegacyBackendDetected] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !planId || !Number.isFinite(planId)) return;
    let active = true;
    setLoading(true);
    setError(null);
    cmsPlannerApi
      .get(planId)
      .then((record) => {
        if (!active) return;
        setName(record.name);
        setNotes(record.payload.notes ?? "");
        setInputs(payloadToInputs(record.payload));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить план.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, planId]);

  const result = useMemo(() => computePlannerResult(inputs), [inputs]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = inputsToPayload(inputs, notes, result);
      const saved =
        mode === "edit" && planId
          ? await cmsPlannerApi.update(planId, { name: name.trim(), payload })
          : await cmsPlannerApi.create({ name: name.trim(), payload });

      // Reflect what was actually persisted. If the deployed voting-service is
      // older than the dev/test split it silently drops the new fields and
      // only stores legacy `story_points`. Detect that and warn the user so
      // they don't see their dev/test inputs "snap back" on next visit.
      const lostDevTestSplit = saved.payload.velocity_history.some((entry) => {
        const hasNew = entry.story_points_dev != null || entry.story_points_test != null;
        return !hasNew && entry.story_points != null;
      });
      setLegacyBackendDetected(lostDevTestSplit);

      // For "create" the editor will navigate to the edit URL and re-fetch
      // from the server; refreshing local state here would just flicker.
      if (mode === "edit") {
        setName(saved.name);
        setNotes(saved.payload.notes ?? "");
        setInputs(payloadToInputs(saved.payload));
      }

      setSavedAt(Date.now());
      toast.success(
        lostDevTestSplit
          ? "Сохранено, но дорожки dev/test свёрнуты бэком"
          : "План сохранён",
      );

      if (mode === "create") {
        navigate(`../${saved.id}`, { replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось сохранить план.";
      setError(message);
      toast.error(message, { title: "Сохранение не прошло" });
    } finally {
      setSaving(false);
    }
  }

  // Fade the "Сохранено" pill out after a couple of seconds — the toast still
  // gives a louder confirmation, this is the inline reassurance.
  useEffect(() => {
    if (!savedAt) return;
    const id = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  async function confirmDelete() {
    if (!planId) return;
    setDeleting(true);
    try {
      await cmsPlannerApi.delete(planId);
      navigate("..");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить план.");
    } finally {
      setDeleting(false);
      setPendingDelete(false);
    }
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        title={mode === "edit" ? "Редактировать план" : "Новый план"}
        description="Заполните поля — расчёт обновляется по мере ввода. Сохраните, чтобы вернуться позже."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("..")}>К списку</Button>
            {mode === "edit" && canManage ? (
              <Button variant="danger" size="sm" onClick={() => setPendingDelete(true)}>
                Удалить
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <InlineError text={error} /> : null}
      {legacyBackendDetected ? (
        <Alert tone="warning">
          Бэкенд voting-service ещё не обновлён под разделение SP dev / SP test —
          ваши значения свёрнуты в одно число <code>max(dev, test)</code>. Пересоберите
          сервис, чтобы значения сохранялись по отдельности.
        </Alert>
      ) : null}

      {loading ? (
        <Skeleton height="h-72" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <PlannerForm
            disabled={!canManage}
            name={name}
            onName={setName}
            notes={notes}
            onNotes={setNotes}
            inputs={inputs}
            onInputs={setInputs}
            totalBaseFromRoles={result.totalBaseCapacity}
          />
          <ResultPanel result={result} />
        </div>
      )}

      {!loading ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {savedAt ? (
            <span
              className="motion-safe:animate-fade-up inline-flex items-center gap-1.5 text-xs font-semibold text-green"
              aria-live="polite"
            >
              <CheckIcon />
              Сохранено
            </span>
          ) : null}
          <Button variant="ghost" onClick={() => navigate("..")} disabled={saving}>Отмена</Button>
          {canManage ? (
            <Button
              variant="primary"
              loading={saving}
              disabled={!name.trim() || saving}
              onClick={() => void save()}
            >
              {mode === "edit" ? "Сохранить" : "Создать"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete}
        title="Удалить план?"
        description={<span>План <b>«{name}»</b> будет удалён без возможности восстановить.</span>}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        tone="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </section>
  );
}

function defaultPlanName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `Спринт ${year}-${month}-${day}`;
}

function PlannerForm({
  disabled,
  name,
  onName,
  notes,
  onNotes,
  inputs,
  onInputs,
  totalBaseFromRoles,
}: {
  disabled: boolean;
  name: string;
  onName: (next: string) => void;
  notes: string;
  onNotes: (next: string) => void;
  inputs: PlannerInputs;
  onInputs: (next: PlannerInputs) => void;
  /** headcount × workingDays summed over all roles (no absences) — used as the
   *  "take from current roles" shortcut for the base-capacity field. */
  totalBaseFromRoles: number;
}) {
  function setVelocity(index: number, patch: Partial<PlannerInputs["velocityHistory"][number]>) {
    onInputs({
      ...inputs,
      velocityHistory: inputs.velocityHistory.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  function addVelocity() {
    onInputs({
      ...inputs,
      velocityHistory: [
        ...inputs.velocityHistory,
        { label: `Спринт −${inputs.velocityHistory.length + 1}`, storyPointsDev: 0, storyPointsTest: 0 },
      ],
    });
  }
  function removeVelocity(index: number) {
    onInputs({
      ...inputs,
      velocityHistory: inputs.velocityHistory.filter((_, i) => i !== index),
    });
  }

  function setRole(index: number, patch: Partial<PlannerInputs["roles"][number]>) {
    onInputs({
      ...inputs,
      roles: inputs.roles.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  function addRole() {
    onInputs({
      ...inputs,
      roles: [...inputs.roles, { name: "Новая роль", headcount: 1, absences: 0 }],
    });
  }
  function removeRole(index: number) {
    onInputs({ ...inputs, roles: inputs.roles.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-5">
      <FormCard title="Метаданные">
        <TextField
          label="Название спринта"
          value={name}
          onChange={(event) => onName(event.target.value)}
          maxLength={200}
          hint="Например: «Sprint 42»"
          disabled={disabled}
        />
      </FormCard>

      <FormCard title="Спринт">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberCell
            label="Рабочие дни"
            hint="Длина спринта"
            value={inputs.workingDays}
            min={0}
            max={200}
            step={1}
            disabled={disabled}
            onChange={(value) => onInputs({ ...inputs, workingDays: value })}
          />
          <div className="space-y-1.5">
            <NumberCell
              label="Базовый Capacity, чел-дней"
              hint={`Сколько чел-дней даёт команда в типичном спринте — без отпусков, на этом фоне получена Velocity. Пример: 9 чел × 22 дня = 198. Сейчас по ролям без отсутствий: ${formatBase(totalBaseFromRoles)}.`}
              placeholder="Например, 198"
              value={inputs.averageCapacity}
              min={0}
              step={1}
              disabled={disabled}
              onChange={(value) => onInputs({ ...inputs, averageCapacity: value })}
            />
            {!disabled && totalBaseFromRoles > 0 ? (
              <button
                type="button"
                onClick={() => onInputs({ ...inputs, averageCapacity: totalBaseFromRoles })}
                className="text-xs font-semibold text-blue hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Взять из текущих ролей: {formatBase(totalBaseFromRoles)}
              </button>
            ) : null}
          </div>
          <NumberCell
            label="Буфер, %"
            hint="Доля Velocity под незапланированное"
            value={inputs.bufferPercent}
            min={0}
            max={80}
            step={5}
            disabled={disabled}
            onChange={(value) => onInputs({ ...inputs, bufferPercent: value })}
          />
        </div>
      </FormCard>

      <FormCard
        title="История Velocity"
        description="Закрытые SP за 3–5 последних спринтов, отдельно по dev и test. Планирующая Velocity = max(dev, test) — это соответствует правилу команды «итоговый SP задачи = max(SP dev, SP test)»."
        action={
          !disabled ? (
            <Button size="sm" variant="ghost" onClick={addVelocity}>
              + Добавить спринт
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          {inputs.velocityHistory.length === 0 ? (
            <p className="text-sm text-ink3">Нет данных — будет использовано {BOOTSTRAP_VELOCITY_SP} SP.</p>
          ) : null}
          {inputs.velocityHistory.map((entry, index) => (
            <div key={index} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <TextField
                label={index === 0 ? "Спринт" : undefined}
                value={entry.label}
                onChange={(event) => setVelocity(index, { label: event.target.value })}
                maxLength={120}
                disabled={disabled}
                reserveMessageSpace={false}
              />
              <NumberCell
                label={index === 0 ? "SP dev" : undefined}
                value={entry.storyPointsDev}
                min={0}
                step={1}
                disabled={disabled}
                onChange={(value) => setVelocity(index, { storyPointsDev: value })}
              />
              <NumberCell
                label={index === 0 ? "SP test" : undefined}
                value={entry.storyPointsTest}
                min={0}
                step={1}
                disabled={disabled}
                onChange={(value) => setVelocity(index, { storyPointsTest: value })}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeVelocity(index)}
                disabled={disabled}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </FormCard>

      <FormCard
        title="Команда по ролям"
        description="Detail-режим: считаем capacity отдельно по ролям, чтобы видеть узкое место."
        action={
          !disabled ? (
            <Button size="sm" variant="ghost" onClick={addRole}>
              + Добавить роль
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          {inputs.roles.length === 0 ? (
            <p className="text-sm text-ink3">Добавьте хотя бы одну роль, чтобы посчитать Capacity.</p>
          ) : null}
          {inputs.roles.map((role, index) => (
            <div key={index} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <TextField
                label={index === 0 ? "Роль" : undefined}
                value={role.name}
                onChange={(event) => setRole(index, { name: event.target.value })}
                maxLength={80}
                disabled={disabled}
                reserveMessageSpace={false}
              />
              <NumberCell
                label={index === 0 ? "Человек" : undefined}
                value={role.headcount}
                min={0}
                step={0.5}
                disabled={disabled}
                onChange={(value) => setRole(index, { headcount: value })}
              />
              <NumberCell
                label={index === 0 ? "Отсутствие, чел-дней" : undefined}
                value={role.absences}
                min={0}
                step={1}
                disabled={disabled}
                onChange={(value) => setRole(index, { absences: value })}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeRole(index)}
                disabled={disabled}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </FormCard>

      <FormCard title="Заметки (опционально)">
        <TextareaField
          label="Контекст этого спринта"
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          maxLength={2000}
          rows={4}
          disabled={disabled}
          hint="Сюда удобно записать особые риски, новички, праздники"
        />
      </FormCard>
    </div>
  );
}

function FormCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {description ? <p className="mt-1 text-xs text-ink3">{description}</p> : null}
        </div>
        {action ?? null}
      </div>
      {children}
    </div>
  );
}

function NumberCell({
  label,
  hint,
  placeholder,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label?: string;
  hint?: string;
  placeholder?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <TextField
      label={label}
      hint={hint}
      placeholder={placeholder}
      type="number"
      inputMode="decimal"
      value={Number.isFinite(value) ? String(value) : ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const next = Number.parseFloat(event.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
      reserveMessageSpace={false}
    />
  );
}

function ResultPanel({ result }: { result: PlannerResult }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-lg border border-blue/40 bg-blue/10 p-4 shadow-card">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink3">Рекомендация в план</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <TrackCard label="Dev" planLimit={result.dev.planLimit} reserveSp={result.dev.reserveSp} />
          <TrackCard label="Test" planLimit={result.test.planLimit} reserveSp={result.test.reserveSp} />
        </div>
        <p className="mt-3 text-xs text-ink3">
          У задачи в спринте свои SP по dev и test. Берите задачи так, чтобы суммарно
          {" "}<b>Σ SP dev ≤ {formatSp(result.dev.planLimit)}</b> и{" "}
          <b>Σ SP test ≤ {formatSp(result.test.planLimit)}</b>. Буфер остаётся на незапланированные задачи.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Расчёт</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Velocity dev" value={`${formatSp(result.velocityDev)} SP`} />
          <Row label="Velocity test" value={`${formatSp(result.velocityTest)} SP`} />
          {result.usedBootstrapVelocity ? (
            <Row
              label="Velocity для шапки"
              value={
                <span>
                  {formatSp(result.velocity)} SP <Badge tone="info">стартовая</Badge>
                </span>
              }
            />
          ) : null}
          <Row label="Capacity база" value={`${formatSp(result.totalBaseCapacity)} чел-дней`} />
          <Row
            label="Capacity спринта"
            value={`${formatSp(result.totalNetCapacity)} чел-дней${
              result.totalAbsences > 0 ? ` (−${formatSp(result.totalAbsences)} отсутствия)` : ""
            }`}
          />
          <Row label="Velocity спринта (dev)" value={`${formatSp(result.dev.adjustedVelocity)} SP`} />
          <Row label="Velocity спринта (test)" value={`${formatSp(result.test.adjustedVelocity)} SP`} />
        </dl>
        {result.bottleneckRole ? (
          <Alert tone="warning" className="mt-4">
            Узкое место: <b>{result.bottleneckRole.name}</b> · {formatSp(result.bottleneckRole.netCapacity)} чел-дней.
            Если задачи спринта в основном на эту роль — стоит пересмотреть набор.
          </Alert>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Команда</h3>
        <table className="mt-2 w-full table-auto text-sm">
          <thead className="text-xs uppercase text-ink3">
            <tr>
              <th className="px-2 py-1 text-left">Роль</th>
              <th className="px-2 py-1 text-right">База</th>
              <th className="px-2 py-1 text-right">Минус</th>
              <th className="px-2 py-1 text-right">Итого</th>
            </tr>
          </thead>
          <tbody>
            {result.roles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-2 text-sm text-ink3">
                  Добавьте роли, чтобы увидеть распределение.
                </td>
              </tr>
            ) : (
              result.roles.map((row) => (
                <tr key={row.name} className="border-t border-line">
                  <td className="px-2 py-1.5 text-ink">{row.name}</td>
                  <td className="px-2 py-1.5 text-right text-ink2">{formatSp(row.baseCapacity)}</td>
                  <td className="px-2 py-1.5 text-right text-ink2">{row.absences > 0 ? `−${formatSp(row.absences)}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-ink">{formatSp(row.netCapacity)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 10.5L8 14.5L16 6" />
    </svg>
  );
}

function TrackCard({
  label,
  planLimit,
  reserveSp,
}: {
  label: string;
  planLimit: number;
  reserveSp: number;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-ink leading-tight">{formatSp(planLimit)} SP</p>
      <p className="mt-0.5 text-xs text-ink3">+ буфер {formatSp(reserveSp)} SP</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink3">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function formatSp(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Same rounding rules as `formatSp` but used for capacity (people-days). */
function formatBase(value: number): string {
  return formatSp(value);
}

void Spinner; // re-export marker — keeps Spinner available for callers extending this shell
