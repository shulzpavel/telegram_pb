/**
 * Pure sprint-planner math. No UI, no I/O — everything else (form state,
 * persistence, presentation) sits on top of this module.
 *
 * The planner is tag-driven: the team defines its own "tracks" (e.g. back,
 * front, qa, design). Each role is pinned to one track. Velocity history
 * records closed SP per track. The result is computed independently per
 * track, then summed for the headline:
 *
 *   for each track t:
 *     velocity_t        = avg over positive history[*].byTrack[t] entries
 *     base_capacity_t   = Σ role.headcount × workingDays  (roles on track t)
 *     net_capacity_t    = Σ max(0, base − absences)
 *     scale_t           = net_capacity_t / base_capacity_t  (or 1 if no roles)
 *     adjusted_t        = velocity_t × scale_t
 *     plan_limit_t      = adjusted_t × (1 − buffer_percent / 100)
 *     reserve_t         = adjusted_t − plan_limit_t
 *
 * The team handbook's first-sprint fallback (50 SP) kicks in when the entire
 * history is empty: it splits 50 SP evenly across tracks that have at least
 * one role, so a 2-track team gets 25/25 and a 3-track team gets ~17/17/17.
 */

/** Bootstrap velocity for teams that have not yet closed any sprints. */
export const BOOTSTRAP_VELOCITY_SP = 50;

/** Default share of velocity reserved for unplanned / interrupt work. */
export const DEFAULT_BUFFER_PERCENT = 20;

/**
 * Default tracks for a brand-new plan. The team handbook splits work into
 * Dev and Test budgets, so we start there. Users can add / rename / remove
 * tracks freely (e.g. split Dev into Backend + Frontend, or add Design).
 */
export const DEFAULT_TRACKS: PlannerTrack[] = [
  { id: "dev", label: "Dev" },
  { id: "test", label: "Test" },
];

export interface PlannerTrack {
  /** Short slug used as the stable reference (e.g. "back", "front"). */
  id: string;
  /** Human-readable label rendered in the UI (e.g. "Backend"). */
  label: string;
}

export interface PlannerRoleInput {
  /** Role label — "Backend lead", "Mobile dev", "QA manual", etc. */
  name: string;
  /** Which track this role belongs to. Must match one of the tracks[].id. */
  trackId: string;
  /** People in this role. May be fractional for part-time members. */
  headcount: number;
  /** Total people-days lost in the upcoming sprint (vacation, sick days, holidays, planning ceremonies, …). */
  absences: number;
}

export interface PlannerHistoryEntry {
  /** Optional label — "Sprint 41". Empty values render as blanks in the UI. */
  label: string;
  /** Closed SP per track id, e.g. { back: 30, front: 20, qa: 25 }. */
  storyPointsByTrack: Record<string, number>;
}

export interface PlannerInputs {
  /** Working days in the upcoming sprint (e.g. 10 for a two-week sprint). */
  workingDays: number;
  /** Share of velocity reserved for unplanned work. 0–80. */
  bufferPercent: number;
  /** Track definitions. Order is preserved for the UI. */
  tracks: PlannerTrack[];
  /** Roles in the upcoming sprint (each pinned to one track). */
  roles: PlannerRoleInput[];
  /** Last 3–5 closed sprints. Average is taken across all entries with sp > 0. */
  velocityHistory: PlannerHistoryEntry[];
  /**
   * Actual SP closed during this sprint, per track. Entered at sprint
   * close — empty / undefined while the sprint is still in flight.
   * Mapped to PlannerTrackResult.actualSp / deltaSp / deltaPercent so
   * the result panel can compare plan vs reality.
   */
  actualByTrack: Record<string, number>;
}

export interface PlannerRoleBreakdown {
  name: string;
  trackId: string;
  trackLabel: string;
  /** headcount × workingDays */
  baseCapacity: number;
  /** baseCapacity − absences (never negative) */
  netCapacity: number;
  /** Absences echoed back for the row in the UI. */
  absences: number;
}

/** Per-track planning numbers — same shape for every track. */
export interface PlannerTrackResult {
  id: string;
  label: string;
  /** Averaged SP across positive history entries. 0 when no history (and not bootstrapped). */
  velocity: number;
  /** True when velocity came from the historical average (vs. zero / bootstrap). */
  velocityKnown: boolean;
  /** True when velocity was substituted by the first-sprint fallback. */
  usedBootstrap: boolean;
  /** Σ headcount × workingDays for roles on this track. */
  baseCapacity: number;
  /** Σ max(0, base − absences). */
  netCapacity: number;
  /** Σ role absences echoed back. */
  absences: number;
  /** netCapacity / baseCapacity (or 1 when no roles assigned). */
  scale: number;
  /** velocity × scale. */
  adjustedVelocity: number;
  /** adjustedVelocity × (1 − bufferPercent / 100). What the team should commit to on this track. */
  planLimit: number;
  /** Reserve set aside for unplanned work on this track. */
  reserveSp: number;
  /** True when at least one role is pinned to this track. */
  hasRoles: boolean;
  /**
   * Actual SP the team closed on this track at sprint end. `null` when
   * the value hasn't been entered yet (sprint still open).
   */
  actualSp: number | null;
  /** actualSp − planLimit. Positive = over plan, negative = under plan. */
  deltaSp: number;
  /** actualSp / planLimit as a 0..∞ ratio (1 = exactly on plan). 0 when planLimit is 0. */
  deltaRatio: number;
}

export interface PlannerResult {
  /** Σ baseCapacity across roles. */
  totalBaseCapacity: number;
  /** Σ netCapacity across roles. */
  totalNetCapacity: number;
  /** Σ role absences. */
  totalAbsences: number;
  /** Echoed back so the UI can show "buffer X%". */
  bufferPercent: number;
  /** Per-track results in the order tracks were declared. */
  tracks: PlannerTrackResult[];
  /** Σ planLimit across tracks — overall recommendation for the sprint. */
  totalPlanLimit: number;
  /** Σ reserveSp across tracks — overall buffer carved out. */
  totalReserveSp: number;
  /** Σ actualSp across tracks that have an actual value. `null` if nobody entered anything. */
  totalActualSp: number | null;
  /** True when at least one track has an actual SP entry. */
  hasActuals: boolean;
  /** Per-role breakdown for the detailed-capacity table. */
  roles: PlannerRoleBreakdown[];
  /** First role with the smallest netCapacity. Kept for older consumers. */
  bottleneckRole: PlannerRoleBreakdown | null;
  /** All roles tied for the smallest netCapacity. Empty when no roles with headcount are defined. */
  bottleneckRoles: PlannerRoleBreakdown[];
  /** True when no track had any historical SP at all and we used the first-sprint fallback. */
  usedBootstrapVelocity: boolean;
}

/** Round to one decimal place. We never want to show "46.000000001". */
function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 80) return 80;
  return value;
}

/** Average across positive values; returns null when nothing usable was given. */
function averagePositive(values: number[]): number | null {
  const valid = values.map(nonNegative).filter((sp) => sp > 0);
  if (valid.length === 0) return null;
  return round1(valid.reduce((acc, sp) => acc + sp, 0) / valid.length);
}

interface TrackAggregate {
  baseCapacity: number;
  netCapacity: number;
  absences: number;
  hasRoles: boolean;
}

function aggregateRolesByTrack(
  tracks: PlannerTrack[],
  rolesBreakdown: PlannerRoleBreakdown[],
): Map<string, TrackAggregate> {
  const map = new Map<string, TrackAggregate>();
  for (const track of tracks) {
    map.set(track.id, { baseCapacity: 0, netCapacity: 0, absences: 0, hasRoles: false });
  }
  for (const role of rolesBreakdown) {
    const agg = map.get(role.trackId);
    if (!agg) continue;
    agg.baseCapacity = round1(agg.baseCapacity + role.baseCapacity);
    agg.netCapacity = round1(agg.netCapacity + role.netCapacity);
    agg.absences = round1(agg.absences + role.absences);
    agg.hasRoles = true;
  }
  return map;
}

function buildRoleBreakdowns(
  roles: PlannerRoleInput[],
  workingDays: number,
  trackLabelById: Map<string, string>,
  fallbackTrackId: string,
): {
  rows: PlannerRoleBreakdown[];
  totalBase: number;
  totalNet: number;
  totalAbsences: number;
  bottlenecks: PlannerRoleBreakdown[];
} {
  const safeDays = nonNegative(workingDays);
  let totalBase = 0;
  let totalNet = 0;
  let totalAbsences = 0;
  let bottlenecks: PlannerRoleBreakdown[] = [];

  const rows = roles.map((role) => {
    const headcount = nonNegative(role.headcount);
    const absences = nonNegative(role.absences);
    const baseCapacity = round1(headcount * safeDays);
    const netCapacity = round1(Math.max(0, baseCapacity - absences));
    totalBase = round1(totalBase + baseCapacity);
    totalNet = round1(totalNet + netCapacity);
    totalAbsences = round1(totalAbsences + absences);

    // Roles pointing at a deleted track get re-homed onto the fallback so
    // their capacity is still counted somewhere (instead of silently leaking).
    const trackId = trackLabelById.has(role.trackId) ? role.trackId : fallbackTrackId;
    const trackLabel = trackLabelById.get(trackId) ?? trackId;

    const row: PlannerRoleBreakdown = {
      name: role.name.trim() || "Без названия",
      trackId,
      trackLabel,
      baseCapacity,
      netCapacity,
      absences,
    };
    if (headcount > 0) {
      const currentMin = bottlenecks[0]?.netCapacity;
      if (currentMin === undefined || netCapacity < currentMin) {
        bottlenecks = [row];
      } else if (netCapacity === currentMin) {
        bottlenecks.push(row);
      }
    }
    return row;
  });

  return { rows, totalBase, totalNet, totalAbsences, bottlenecks };
}

export function computePlannerResult(inputs: PlannerInputs): PlannerResult {
  const buffer = clampPercent(inputs.bufferPercent);

  // Ensure we always have at least one track to anchor calculations even
  // for malformed payloads — falls back to the canonical defaults.
  const tracks: PlannerTrack[] =
    inputs.tracks.length > 0
      ? inputs.tracks.map((t) => ({ id: t.id, label: t.label.trim() || t.id }))
      : DEFAULT_TRACKS.map((t) => ({ ...t }));

  const trackLabelById = new Map(tracks.map((t) => [t.id, t.label]));
  const fallbackTrackId = tracks[0]!.id;

  const roles = buildRoleBreakdowns(
    inputs.roles,
    inputs.workingDays,
    trackLabelById,
    fallbackTrackId,
  );
  const aggregates = aggregateRolesByTrack(tracks, roles.rows);

  // Per-track velocity averaged across positive historical SP entries.
  const trackVelocities = new Map<string, number | null>();
  for (const track of tracks) {
    const samples = inputs.velocityHistory.map((entry) => entry.storyPointsByTrack[track.id] ?? 0);
    trackVelocities.set(track.id, averagePositive(samples));
  }

  const everyVelocityEmpty = Array.from(trackVelocities.values()).every((v) => v === null);

  // First-sprint fallback: distribute the team's 50 SP guidance evenly
  // across tracks that actually have a team behind them. Solo-bootstrap
  // tracks without roles to avoid recommending work into thin air.
  const tracksWithRoles = tracks.filter((t) => aggregates.get(t.id)?.hasRoles);
  const bootstrapPerTrack =
    everyVelocityEmpty && tracksWithRoles.length > 0
      ? round1(BOOTSTRAP_VELOCITY_SP / tracksWithRoles.length)
      : 0;

  const trackResults: PlannerTrackResult[] = tracks.map((track) => {
    const agg = aggregates.get(track.id) ?? {
      baseCapacity: 0,
      netCapacity: 0,
      absences: 0,
      hasRoles: false,
    };
    const rawVelocity = trackVelocities.get(track.id);
    const velocityKnown = rawVelocity !== null;
    const usedBootstrap = !velocityKnown && bootstrapPerTrack > 0 && agg.hasRoles;
    const velocity = velocityKnown ? rawVelocity! : usedBootstrap ? bootstrapPerTrack : 0;

    // When there are no roles on the track we can't really scale capacity —
    // surface the raw velocity number untouched (mostly useful for QA-only
    // teams scrolling through their old history).
    const scale = agg.baseCapacity > 0 ? agg.netCapacity / agg.baseCapacity : 1;
    const adjustedVelocity = round1(velocity * scale);
    const planLimit = round1(adjustedVelocity * (1 - buffer / 100));
    const reserveSp = round1(Math.max(0, adjustedVelocity - planLimit));

    // Distinguish "haven't entered yet" (null) from "entered zero" so the
    // UI can render a placeholder vs an honest "0 SP closed".
    const rawActual = inputs.actualByTrack?.[track.id];
    const actualSp =
      typeof rawActual === "number" && Number.isFinite(rawActual) && rawActual >= 0
        ? round1(rawActual)
        : null;
    const deltaSp = actualSp !== null ? round1(actualSp - planLimit) : 0;
    const deltaRatio = actualSp !== null && planLimit > 0 ? round1((actualSp / planLimit) * 100) / 100 : 0;

    return {
      id: track.id,
      label: track.label,
      velocity,
      velocityKnown,
      usedBootstrap,
      baseCapacity: agg.baseCapacity,
      netCapacity: agg.netCapacity,
      absences: agg.absences,
      scale: Number.isFinite(scale) ? round1(scale * 100) / 100 : 1,
      adjustedVelocity,
      planLimit,
      reserveSp,
      hasRoles: agg.hasRoles,
      actualSp,
      deltaSp,
      deltaRatio,
    };
  });

  const totalPlanLimit = round1(trackResults.reduce((acc, t) => acc + t.planLimit, 0));
  const totalReserveSp = round1(trackResults.reduce((acc, t) => acc + t.reserveSp, 0));
  const actualEntries = trackResults.filter((t) => t.actualSp !== null);
  const totalActualSp = actualEntries.length > 0
    ? round1(actualEntries.reduce((acc, t) => acc + (t.actualSp ?? 0), 0))
    : null;

  return {
    totalBaseCapacity: roles.totalBase,
    totalNetCapacity: roles.totalNet,
    totalAbsences: roles.totalAbsences,
    bufferPercent: buffer,
    tracks: trackResults,
    totalPlanLimit,
    totalReserveSp,
    totalActualSp,
    hasActuals: actualEntries.length > 0,
    roles: roles.rows,
    bottleneckRole: roles.bottlenecks[0] ?? null,
    bottleneckRoles: roles.bottlenecks,
    usedBootstrapVelocity: everyVelocityEmpty && tracksWithRoles.length > 0,
  };
}

/**
 * Short headline used in the list view, e.g.:
 *   "Backend 32 / Frontend 28 / QA 12 SP · буфер 18"
 *
 * Empty tracks are skipped so the summary stays readable for small teams.
 */
export function summarizePlannerResult(result: PlannerResult): string {
  const visible = result.tracks.filter((t) => t.hasRoles || t.velocity > 0);
  if (visible.length === 0) return "Нет данных";
  const parts = visible.map((t) => `${t.label} ${formatNumber(t.planLimit)}`);
  return `${parts.join(" / ")} SP · буфер ${formatNumber(result.totalReserveSp)}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}
