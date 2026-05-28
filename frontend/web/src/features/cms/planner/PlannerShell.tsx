import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
  useToast,
} from "../../../design-system";
import {
  cmsPlannerApi,
  type SprintPlanHistoryEntry,
  type SprintPlanPayload,
  type SprintPlanRecord,
  type SprintPlanRoleInput,
} from "../api/cmsClient";
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
  DEFAULT_TRACKS,
  computePlannerResult,
  summarizePlannerResult,
  type PlannerHistoryEntry,
  type PlannerInputs,
  type PlannerResult,
  type PlannerRoleInput,
  type PlannerTrack,
  type PlannerTrackResult,
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
          Команда разбивается на треки (back / front / qa / любые свои). Velocity и Capacity считаются
          для каждого трека отдельно. План каждого трека = Velocity × (Capacity спринта / Capacity база)
          минус буфер (по умолчанию 20%) на незапланированные задачи.
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
// Editor view — defaults, payload <-> input mapping, save flow
// ---------------------------------------------------------------------------

function makeDefaultTracks(): PlannerTrack[] {
  return DEFAULT_TRACKS.map((t) => ({ ...t }));
}

function makeDefaultRoles(): PlannerRoleInput[] {
  // Dev/test split is the team's baseline. Sample roles match the canonical
  // shape from the handbook: разработка → dev, QA → test.
  return [
    { name: "Backend", trackId: "dev", headcount: 3, absences: 0 },
    { name: "Frontend", trackId: "dev", headcount: 3, absences: 0 },
    { name: "QA", trackId: "test", headcount: 3, absences: 0 },
  ];
}

function makeDefaultHistory(): PlannerHistoryEntry[] {
  const empty = (label: string): PlannerHistoryEntry => ({
    label,
    storyPointsByTrack: { dev: 0, test: 0 },
  });
  return [empty("Спринт −1"), empty("Спринт −2"), empty("Спринт −3")];
}

function emptyInputs(): PlannerInputs {
  return {
    workingDays: 10,
    bufferPercent: DEFAULT_BUFFER_PERCENT,
    tracks: makeDefaultTracks(),
    roles: makeDefaultRoles(),
    velocityHistory: makeDefaultHistory(),
  };
}

/**
 * Convert a stored payload back into the editor's working state.
 *
 * Two legacy shapes are migrated transparently so old plans keep opening
 * without surprises:
 *
 *   1. Plans saved before the tag-driven planner stored a single
 *      `story_points` (and later `story_points_dev` / `story_points_test`).
 *      We map those onto two synthetic tracks named "Dev" and "Test", and
 *      pin every role to "dev" by default. The user can then reorganise.
 *   2. Plans saved with the new tag-driven planner already carry `tracks` and
 *      `by_track` — we just hydrate them as-is.
 */
function payloadToInputs(payload: SprintPlanPayload): PlannerInputs {
  const legacyTracks = !payload.tracks || payload.tracks.length === 0;

  let tracks: PlannerTrack[];
  if (legacyTracks) {
    const usesDevTest = payload.velocity_history.some(
      (e) => e.story_points_dev != null || e.story_points_test != null,
    );
    if (usesDevTest) {
      tracks = [
        { id: "dev", label: "Dev" },
        { id: "test", label: "Test" },
      ];
    } else if (payload.velocity_history.some((e) => e.story_points != null)) {
      // Even older shape — single SP per sprint. Surface as one "Команда" track.
      tracks = [{ id: "team", label: "Команда" }];
    } else {
      tracks = makeDefaultTracks();
    }
  } else {
    tracks = payload.tracks!.map((t) => ({ id: t.id, label: t.label }));
  }

  const fallbackTrackId = tracks[0]?.id ?? "back";
  const knownIds = new Set(tracks.map((t) => t.id));

  return {
    workingDays: payload.working_days,
    bufferPercent: payload.buffer_percent,
    tracks,
    velocityHistory: payload.velocity_history.map((entry) => ({
      label: entry.label,
      storyPointsByTrack: hydrateByTrack(entry, tracks),
    })),
    roles: payload.roles.map((role) => ({
      name: role.name,
      // Backend role with a track that no longer exists — re-home onto the
      // first available track so its capacity stays in the calc.
      trackId: role.track_id && knownIds.has(role.track_id) ? role.track_id : fallbackTrackId,
      headcount: role.headcount,
      absences: role.absences,
    })),
  };
}

function hydrateByTrack(
  entry: SprintPlanHistoryEntry,
  tracks: PlannerTrack[],
): Record<string, number> {
  const out: Record<string, number> = {};
  // Prefer the explicit per-track map when present.
  if (entry.by_track) {
    for (const t of tracks) {
      out[t.id] = nonNegativeNumber(entry.by_track[t.id]);
    }
    return out;
  }
  // Otherwise fall back to legacy fields, mapping them onto matching IDs.
  for (const t of tracks) {
    if (t.id === "dev") out[t.id] = nonNegativeNumber(entry.story_points_dev ?? entry.story_points);
    else if (t.id === "test") out[t.id] = nonNegativeNumber(entry.story_points_test ?? entry.story_points);
    else if (t.id === "team") out[t.id] = nonNegativeNumber(entry.story_points);
    else out[t.id] = 0;
  }
  return out;
}

function nonNegativeNumber(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function inputsToPayload(
  inputs: PlannerInputs,
  notes: string,
  result: PlannerResult,
): SprintPlanPayload {
  return {
    working_days: inputs.workingDays,
    // Deprecated field — kept at 0 for back-compat with the older schema
    // which still includes it. Tag-driven capacity is computed per track.
    average_capacity: 0,
    buffer_percent: inputs.bufferPercent,
    tracks: inputs.tracks.map((t) => ({ id: t.id, label: t.label })),
    velocity_history: inputs.velocityHistory.map((entry) => {
      const byTrack: Record<string, number> = {};
      for (const t of inputs.tracks) {
        byTrack[t.id] = nonNegativeNumber(entry.storyPointsByTrack[t.id]);
      }
      // Legacy SP fields are still populated so older backends keep
      // accepting the payload and so a downgrade does not lose data
      // entirely. Mapping:
      //   - story_points     = max across all tracks
      //   - story_points_dev = byTrack.dev (or 0)
      //   - story_points_test= byTrack.test (or 0)
      const max = Object.values(byTrack).reduce((m, v) => (v > m ? v : m), 0);
      return {
        label: entry.label,
        story_points: max,
        story_points_dev: nonNegativeNumber(byTrack["dev"]),
        story_points_test: nonNegativeNumber(byTrack["test"]),
        by_track: byTrack,
      };
    }),
    roles: inputs.roles.map<SprintPlanRoleInput>((role) => ({
      name: role.name,
      headcount: role.headcount,
      absences: role.absences,
      track_id: role.trackId,
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

      // Detect older voting-service deployments that silently strip the new
      // `tracks` / `by_track` fields — surface a warning so the user knows
      // why their tag-driven plan "snaps back" to the legacy dev/test shape.
      const lostTracks =
        (!saved.payload.tracks || saved.payload.tracks.length === 0) &&
        inputs.tracks.length > 0;
      const lostByTrack = saved.payload.velocity_history.some((entry, idx) => {
        const original = inputs.velocityHistory[idx];
        if (!original) return false;
        const hadTrackedSp = Object.values(original.storyPointsByTrack).some((v) => (v ?? 0) > 0);
        return hadTrackedSp && !entry.by_track;
      });
      setLegacyBackendDetected(lostTracks || lostByTrack);

      // For "create" the editor will navigate to the edit URL and re-fetch
      // from the server; refreshing local state here would just flicker.
      if (mode === "edit") {
        setName(saved.name);
        setNotes(saved.payload.notes ?? "");
        setInputs(payloadToInputs(saved.payload));
      }

      setSavedAt(Date.now());
      toast.success(
        lostTracks || lostByTrack
          ? "Сохранено, но бэкенд свернул треки"
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
          Бэкенд voting-service ещё не обновлён под теги треков — часть данных
          свернута в legacy-поля и при следующей загрузке восстановится не полностью.
          Пересоберите сервис, чтобы значения по тегам сохранялись отдельно.
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

// ---------------------------------------------------------------------------
// Editor form — tracks, roles, history, buffer
// ---------------------------------------------------------------------------

function PlannerForm({
  disabled,
  name,
  onName,
  notes,
  onNotes,
  inputs,
  onInputs,
}: {
  disabled: boolean;
  name: string;
  onName: (next: string) => void;
  notes: string;
  onNotes: (next: string) => void;
  inputs: PlannerInputs;
  onInputs: (next: PlannerInputs) => void;
}) {
  // ----- velocity history mutators -----
  function setVelocity(
    index: number,
    patch: Partial<PlannerHistoryEntry>,
  ) {
    onInputs({
      ...inputs,
      velocityHistory: inputs.velocityHistory.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }
  function setVelocityTrackValue(index: number, trackId: string, value: number) {
    const entry = inputs.velocityHistory[index];
    if (!entry) return;
    setVelocity(index, {
      storyPointsByTrack: { ...entry.storyPointsByTrack, [trackId]: value },
    });
  }
  function addVelocity() {
    const blank: Record<string, number> = {};
    for (const t of inputs.tracks) blank[t.id] = 0;
    onInputs({
      ...inputs,
      velocityHistory: [
        ...inputs.velocityHistory,
        { label: `Спринт −${inputs.velocityHistory.length + 1}`, storyPointsByTrack: blank },
      ],
    });
  }
  function removeVelocity(index: number) {
    onInputs({
      ...inputs,
      velocityHistory: inputs.velocityHistory.filter((_, i) => i !== index),
    });
  }

  // ----- role mutators -----
  function setRole(index: number, patch: Partial<PlannerRoleInput>) {
    onInputs({
      ...inputs,
      roles: inputs.roles.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  function addRole() {
    const trackId = inputs.tracks[0]?.id ?? "back";
    onInputs({
      ...inputs,
      roles: [...inputs.roles, { name: "Новая роль", trackId, headcount: 1, absences: 0 }],
    });
  }
  function removeRole(index: number) {
    onInputs({ ...inputs, roles: inputs.roles.filter((_, i) => i !== index) });
  }

  // ----- track mutators -----
  function addTrack() {
    // Random opaque id keeps every keystroke in the label field stable —
    // changing the visible name doesn't move references in roles / history.
    const taken = new Set(inputs.tracks.map((t) => t.id));
    const id = randomTrackId(taken);
    const label = `Трек ${inputs.tracks.length + 1}`;
    onInputs({
      ...inputs,
      tracks: [...inputs.tracks, { id, label }],
      velocityHistory: inputs.velocityHistory.map((entry) => ({
        ...entry,
        storyPointsByTrack: { ...entry.storyPointsByTrack, [id]: 0 },
      })),
    });
  }
  function renameTrack(index: number, label: string) {
    onInputs({
      ...inputs,
      tracks: inputs.tracks.map((t, i) => (i === index ? { ...t, label } : t)),
    });
  }
  function removeTrack(index: number) {
    // Never allow zero tracks — the calc relies on at least one.
    if (inputs.tracks.length <= 1) return;
    const removed = inputs.tracks[index]!;
    const remaining = inputs.tracks.filter((_, i) => i !== index);
    const fallback = remaining[0]!.id;
    onInputs({
      ...inputs,
      tracks: remaining,
      // Re-home any roles that were pinned to the removed track so their
      // capacity does not silently disappear.
      roles: inputs.roles.map((r) =>
        r.trackId === removed.id ? { ...r, trackId: fallback } : r,
      ),
      velocityHistory: inputs.velocityHistory.map((entry) => {
        const { [removed.id]: _dropped, ...rest } = entry.storyPointsByTrack;
        return { ...entry, storyPointsByTrack: rest };
      }),
    });
  }

  // Build the dynamic grid template for the velocity rows. Tailwind can't
  // synthesize arbitrary `repeat(N, 1fr)` at runtime, so we inject the value
  // through inline style instead.
  const trackCount = inputs.tracks.length;
  const velocityRowStyle = useMemo(
    () => ({
      gridTemplateColumns: `minmax(0,2fr) ${
        trackCount > 0
          ? `${Array(trackCount).fill("minmax(0,1fr)").join(" ")} `
          : ""
      }auto`,
    }),
    [trackCount],
  );

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
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberCell
            label="Рабочие дни"
            hint="Длина спринта (одинаково для всех ролей). Пример: двухнедельный спринт = 10."
            value={inputs.workingDays}
            min={0}
            max={200}
            step={1}
            disabled={disabled}
            onChange={(value) => onInputs({ ...inputs, workingDays: value })}
          />
          <NumberCell
            label="Буфер, %"
            hint="Доля Velocity под незапланированное (горящие баги, переключения)."
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
        title="Треки команды"
        description="По умолчанию — Dev и Test (как в гайде). Хочешь гранулярнее (Backend, Frontend, QA, Design и т.д.) — переименуй и добавь свои. Каждой роли потом назначается один трек, план считается отдельно по каждому треку."
        action={
          !disabled ? (
            <Button size="sm" variant="ghost" onClick={addTrack}>
              + Добавить трек
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          {inputs.tracks.map((track, index) => (
            <div key={track.id} className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
              <TextField
                label={index === 0 ? "Название трека" : undefined}
                value={track.label}
                onChange={(event) => renameTrack(index, event.target.value)}
                maxLength={80}
                disabled={disabled}
                reserveMessageSpace={false}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeTrack(index)}
                disabled={disabled || inputs.tracks.length <= 1}
                title={inputs.tracks.length <= 1 ? "Нужен хотя бы один трек" : "Удалить трек"}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </FormCard>

      <FormCard
        title="История Velocity"
        description="Закрытые SP по каждому треку за 3–5 последних спринтов. Velocity трека = среднее по непустым значениям. Если истории нет — будет использовано стартовое значение 50 SP, распределённое между треками с командой."
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
            <p className="text-sm text-ink3">
              Нет данных — будет использовано {BOOTSTRAP_VELOCITY_SP} SP, разнесено по трекам.
            </p>
          ) : null}
          {inputs.velocityHistory.map((entry, index) => (
            <div
              key={index}
              className="grid items-end gap-2"
              style={velocityRowStyle}
            >
              <TextField
                label={index === 0 ? "Спринт" : undefined}
                value={entry.label}
                onChange={(event) => setVelocity(index, { label: event.target.value })}
                maxLength={120}
                disabled={disabled}
                reserveMessageSpace={false}
              />
              {inputs.tracks.map((track) => (
                <NumberCell
                  key={track.id}
                  label={index === 0 ? `SP ${track.label}` : undefined}
                  value={entry.storyPointsByTrack[track.id] ?? 0}
                  min={0}
                  step={1}
                  disabled={disabled}
                  onChange={(value) => setVelocityTrackValue(index, track.id, value)}
                />
              ))}
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
        description="Каждой роли — один трек. Capacity роли (человек × рабочие дни − отсутствия) пойдёт в план соответствующего трека."
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
            <div
              key={index}
              className="grid items-end gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
            >
              <TextField
                label={index === 0 ? "Роль" : undefined}
                value={role.name}
                onChange={(event) => setRole(index, { name: event.target.value })}
                maxLength={80}
                disabled={disabled}
                reserveMessageSpace={false}
              />
              <SelectField
                label={index === 0 ? "Трек" : undefined}
                value={role.trackId}
                onChange={(event) => setRole(index, { trackId: event.target.value })}
                disabled={disabled}
                reserveMessageSpace={false}
              >
                {inputs.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.label}
                  </option>
                ))}
              </SelectField>
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

// ---------------------------------------------------------------------------
// Result panel — recommendation grid + breakdowns
// ---------------------------------------------------------------------------

function ResultPanel({ result }: { result: PlannerResult }) {
  // Per-track visibility lives only in the UI layer — toggling a track does
  // not change the underlying calc, just hides its card so the team can
  // focus on the slice they care about ("SP FRONT", "SP BACK").
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  // Drop entries for tracks that no longer exist (rename / delete).
  useEffect(() => {
    setHidden((prev) => {
      const live = new Set(result.tracks.map((t) => t.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [result.tracks]);

  const visibleTracks = result.tracks.filter((t) => !hidden.has(t.id));
  const visiblePlanLimit = visibleTracks.reduce((acc, t) => acc + t.planLimit, 0);
  const visibleReserve = visibleTracks.reduce((acc, t) => acc + t.reserveSp, 0);

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-lg border border-blue/40 bg-blue/10 p-4 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink3">Рекомендация в план</p>
          <p className="text-[11px] text-ink3">
            Σ {formatSp(visiblePlanLimit)} SP · буфер {formatSp(visibleReserve)} SP
          </p>
        </div>

        {result.tracks.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.tracks.map((track) => {
              const off = hidden.has(track.id);
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => toggle(track.id)}
                  aria-pressed={!off}
                  className={
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors " +
                    (off
                      ? "border-line text-ink3 hover:border-ink3 hover:text-ink2"
                      : "border-blue/50 bg-blue/15 text-blue")
                  }
                  title={off ? "Показать трек в плане" : "Скрыть трек из плана"}
                >
                  {track.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {visibleTracks.length === 0 ? (
            <p className="col-span-full text-xs text-ink3">
              Все треки скрыты. Включите хотя бы один тег выше, чтобы увидеть план.
            </p>
          ) : (
            visibleTracks.map((track) => <TrackCard key={track.id} track={track} />)
          )}
        </div>

        <p className="mt-3 text-xs text-ink3">
          У каждой задачи свои SP по каждому треку. Берите задачи так, чтобы по каждому треку
          сумма не превышала его план. Буфер остаётся на незапланированные задачи.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Capacity команды, чел-дней</h3>
        <p className="mt-1 text-xs text-ink3">
          База = Σ человек × рабочие дни. Считается автоматически из таблицы «Команда по ролям».
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row
            label="База (без отсутствий)"
            value={`${formatSp(result.totalBaseCapacity)} чел-дней`}
          />
          {result.totalAbsences > 0 ? (
            <Row
              label="Минус отсутствия"
              value={`−${formatSp(result.totalAbsences)} чел-дней`}
            />
          ) : null}
          <Row
            label="Итого на спринт"
            value={
              <span className="text-blue">
                {formatSp(result.totalNetCapacity)} чел-дней
              </span>
            }
          />
        </dl>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Расчёт по трекам</h3>
        <p className="mt-1 text-xs text-ink3">
          Velocity усреднена по истории. Capacity = чел-дней по ролям трека.
          Adjusted = Velocity × (Capacity итого / Capacity база).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="text-xs uppercase text-ink3">
              <tr>
                <th className="px-2 py-1 text-left">Трек</th>
                <th className="px-2 py-1 text-right">Velocity, SP</th>
                <th className="px-2 py-1 text-right">База, чел-дней</th>
                <th className="px-2 py-1 text-right">Итого, чел-дней</th>
                <th className="px-2 py-1 text-right">План, SP</th>
              </tr>
            </thead>
            <tbody>
              {result.tracks.map((track) => (
                <tr key={track.id} className="border-t border-line">
                  <td className="px-2 py-1.5 text-ink">{track.label}</td>
                  <td className="px-2 py-1.5 text-right text-ink2">
                    {formatSp(track.velocity)}
                    {track.usedBootstrap ? <Badge tone="info" className="ml-1">стартовая</Badge> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right text-ink2">{formatSp(track.baseCapacity)}</td>
                  <td className="px-2 py-1.5 text-right text-ink2">
                    {formatSp(track.netCapacity)}
                    {track.absences > 0 ? (
                      <span className="ml-1 text-xs text-ink3">(−{formatSp(track.absences)})</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-ink">
                    {formatSp(track.planLimit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.bottleneckRole ? (
          <Alert tone="warning" className="mt-4">
            Узкое место: <b>{result.bottleneckRole.name}</b> ({result.bottleneckRole.trackLabel}) ·{" "}
            {formatSp(result.bottleneckRole.netCapacity)} чел-дней.
          </Alert>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold text-ink">Команда</h3>
        <table className="mt-2 w-full table-auto text-sm">
          <thead className="text-xs uppercase text-ink3">
            <tr>
              <th className="px-2 py-1 text-left">Роль</th>
              <th className="px-2 py-1 text-left">Трек</th>
              <th className="px-2 py-1 text-right">База</th>
              <th className="px-2 py-1 text-right">Минус</th>
              <th className="px-2 py-1 text-right">Итого</th>
            </tr>
          </thead>
          <tbody>
            {result.roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-sm text-ink3">
                  Добавьте роли, чтобы увидеть распределение.
                </td>
              </tr>
            ) : (
              result.roles.map((row, idx) => (
                <tr key={`${row.name}-${idx}`} className="border-t border-line">
                  <td className="px-2 py-1.5 text-ink">{row.name}</td>
                  <td className="px-2 py-1.5 text-ink2">{row.trackLabel}</td>
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

function TrackCard({ track }: { track: PlannerTrackResult }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink3">{track.label}</p>
      <p className="mt-0.5 text-2xl font-bold leading-tight text-ink">{formatSp(track.planLimit)} SP</p>
      <p className="mt-0.5 text-xs text-ink3">+ буфер {formatSp(track.reserveSp)} SP</p>
      {!track.hasRoles ? (
        <p className="mt-1 text-[11px] text-ink3">нет ролей</p>
      ) : track.usedBootstrap ? (
        <p className="mt-1 text-[11px] text-ink3">стартовая velocity</p>
      ) : null}
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

/**
 * Generate an opaque, stable id for a new track. We don't slugify the
 * user-visible label so that editing the label later doesn't move the
 * underlying key — that would invalidate role.trackId / history.byTrack
 * references and (worse) cause React to remount the input on every
 * keystroke.
 */
function randomTrackId(taken: Set<string>): string {
  for (let i = 0; i < 5; i++) {
    const id = `t_${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
  return `t_${Date.now().toString(36)}`;
}

void Spinner; // re-export marker — keeps Spinner available for callers extending this shell
