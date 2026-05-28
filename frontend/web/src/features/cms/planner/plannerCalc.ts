/**
 * Pure sprint-planner math. No UI, no I/O — everything else (form state,
 * persistence, presentation) sits on top of this module.
 *
 * Implements the team's planning rule:
 *   adjusted_velocity = velocity × (new_capacity / average_capacity)
 *   plan_limit         = adjusted_velocity × (1 − buffer_percent / 100)
 *
 * Defaults that match the team handbook (Velocity / Capacity doc):
 *   - 20% buffer for unplanned work
 *   - first-time fallback velocity = 50 SP if no history exists
 *   - velocity averaged across the last 3–5 closed sprints (caller passes the slice)
 */

/** Bootstrap velocity for teams that have not yet closed any sprints. */
export const BOOTSTRAP_VELOCITY_SP = 50;

/** Default share of velocity reserved for unplanned / interrupt work. */
export const DEFAULT_BUFFER_PERCENT = 20;

export interface PlannerRoleInput {
  /** Role label — "Backend", "Frontend", "QA", etc. */
  name: string;
  /** People in this role. May be fractional for part-time members. */
  headcount: number;
  /** Total people-days lost in the upcoming sprint (vacation, sick days, holidays, planning ceremonies, …). */
  absences: number;
}

export interface PlannerHistoryEntry {
  /** Optional label — "Sprint 41". Empty values render as blanks in the UI. */
  label: string;
  /** Story points closed by development in that sprint. */
  storyPointsDev: number;
  /** Story points closed by testing in that sprint. */
  storyPointsTest: number;
}

export interface PlannerInputs {
  /** Working days in the upcoming sprint (e.g. 10 for a two-week sprint). */
  workingDays: number;
  /**
   * Average team-day capacity historical sprints were achieved on. Used to
   * scale velocity down/up when the new sprint has less/more availability.
   * Set 0 to disable scaling (then adjusted velocity == raw velocity).
   */
  averageCapacity: number;
  /** Share of velocity reserved for unplanned work. 0–80. */
  bufferPercent: number;
  /** Last 3–5 closed sprints. Average is taken across all entries with sp > 0. */
  velocityHistory: PlannerHistoryEntry[];
  /** Roles in the upcoming sprint (detailed capacity by role). */
  roles: PlannerRoleInput[];
}

export interface PlannerRoleBreakdown {
  name: string;
  /** headcount × workingDays */
  baseCapacity: number;
  /** baseCapacity − absences (never negative) */
  netCapacity: number;
  /** Absences echoed back for the row in the UI. */
  absences: number;
}

export interface PlannerResult {
  /** Working days × Σ headcount across all roles. */
  totalBaseCapacity: number;
  /** Sum of role.netCapacity. The actual people-day budget for the upcoming sprint. */
  totalNetCapacity: number;
  /** Sum of role absences echoed back for the result summary. */
  totalAbsences: number;
  /**
   * Velocity used for planning. Equals `max(velocityDev, velocityTest)` —
   * matches the per-task rule `final_sp = max(sp_dev, sp_test)` from the team
   * handbook and yields a safe lower-bound plan (the slower track wins).
   */
  velocity: number;
  /** Average closed SP on the development track. */
  velocityDev: number;
  /** Average closed SP on the testing track. */
  velocityTest: number;
  /** True when velocity was substituted from the bootstrap rule. */
  usedBootstrapVelocity: boolean;
  /** velocity × netCapacity / averageCapacity (or velocity if averageCapacity ≤ 0). */
  adjustedVelocity: number;
  /** adjustedVelocity × (1 − bufferPercent / 100). What the team should commit to. */
  planLimit: number;
  /** Reserve set aside for unplanned work: adjustedVelocity − planLimit. */
  reserveSp: number;
  /** Per-role breakdown for the detailed-capacity table. */
  roles: PlannerRoleBreakdown[];
  /** Role with the smallest netCapacity. `null` when no roles defined. */
  bottleneckRole: PlannerRoleBreakdown | null;
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

/**
 * Computes per-track velocity (dev / test) and the planning velocity used for
 * scaling. The planning velocity follows the team handbook: a task's final SP
 * is `max(SP_dev, SP_test)`, so the slowest track sets the upper bound on
 * what the team can actually close.
 *
 * When neither dev nor test history is provided, falls back to the bootstrap
 * velocity (50 SP).
 */
export function computeVelocity(history: PlannerHistoryEntry[]): {
  velocity: number;
  velocityDev: number;
  velocityTest: number;
  usedBootstrap: boolean;
} {
  const dev = averagePositive(history.map((entry) => entry.storyPointsDev));
  const test = averagePositive(history.map((entry) => entry.storyPointsTest));

  if (dev === null && test === null) {
    return {
      velocity: BOOTSTRAP_VELOCITY_SP,
      velocityDev: 0,
      velocityTest: 0,
      usedBootstrap: true,
    };
  }
  const devSafe = dev ?? 0;
  const testSafe = test ?? 0;
  return {
    velocity: Math.max(devSafe, testSafe),
    velocityDev: devSafe,
    velocityTest: testSafe,
    usedBootstrap: false,
  };
}

/**
 * Detailed per-role breakdown. Each role contributes
 * `headcount × workingDays` people-days, minus the absences declared for that
 * role in the upcoming sprint.
 */
function computeRoles(
  roles: PlannerRoleInput[],
  workingDays: number,
): {
  rows: PlannerRoleBreakdown[];
  totalBase: number;
  totalNet: number;
  totalAbsences: number;
  bottleneck: PlannerRoleBreakdown | null;
} {
  const safeDays = nonNegative(workingDays);
  let totalBase = 0;
  let totalNet = 0;
  let totalAbsences = 0;
  let bottleneck: PlannerRoleBreakdown | null = null;

  const rows = roles.map((role) => {
    const headcount = nonNegative(role.headcount);
    const absences = nonNegative(role.absences);
    const baseCapacity = round1(headcount * safeDays);
    const netCapacity = round1(Math.max(0, baseCapacity - absences));
    totalBase = round1(totalBase + baseCapacity);
    totalNet = round1(totalNet + netCapacity);
    totalAbsences = round1(totalAbsences + absences);
    const row: PlannerRoleBreakdown = {
      name: role.name.trim() || "Без названия",
      baseCapacity,
      netCapacity,
      absences,
    };
    if (headcount > 0 && (bottleneck === null || netCapacity < bottleneck.netCapacity)) {
      bottleneck = row;
    }
    return row;
  });

  return { rows, totalBase, totalNet, totalAbsences, bottleneck };
}

export function computePlannerResult(inputs: PlannerInputs): PlannerResult {
  const { velocity, velocityDev, velocityTest, usedBootstrap } = computeVelocity(inputs.velocityHistory);
  const roles = computeRoles(inputs.roles, inputs.workingDays);

  const averageCapacity = nonNegative(inputs.averageCapacity);
  const buffer = clampPercent(inputs.bufferPercent);

  // When the user has not entered an "average capacity" baseline, treat the
  // adjustment as no-op rather than dividing by zero. This is also how the
  // first-sprint case is handled — the planner still produces a number.
  const adjustedVelocity =
    averageCapacity > 0 && roles.totalNet > 0
      ? round1(velocity * (roles.totalNet / averageCapacity))
      : round1(velocity);

  const planLimit = round1(adjustedVelocity * (1 - buffer / 100));
  const reserveSp = round1(Math.max(0, adjustedVelocity - planLimit));

  return {
    totalBaseCapacity: roles.totalBase,
    totalNetCapacity: roles.totalNet,
    totalAbsences: roles.totalAbsences,
    velocity,
    velocityDev,
    velocityTest,
    usedBootstrapVelocity: usedBootstrap,
    adjustedVelocity,
    planLimit,
    reserveSp,
    roles: roles.rows,
    bottleneckRole: roles.bottleneck,
  };
}

/**
 * Short headline used in the list view: "46 SP plan · 12 SP reserve".
 * Returns null when there is nothing meaningful to show.
 */
export function summarizePlannerResult(result: PlannerResult): string {
  return `${result.planLimit} SP в план · ${result.reserveSp} SP буфер`;
}
