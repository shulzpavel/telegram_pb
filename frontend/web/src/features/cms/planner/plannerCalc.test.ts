import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_VELOCITY_SP,
  DEFAULT_BUFFER_PERCENT,
  computePlannerResult,
  computeVelocity,
  summarizePlannerResult,
  type PlannerInputs,
} from "./plannerCalc";

describe("computeVelocity", () => {
  it("falls back to 50 SP when history is empty", () => {
    const result = computeVelocity([]);
    expect(result).toEqual({ velocity: BOOTSTRAP_VELOCITY_SP, usedBootstrap: true });
  });

  it("averages valid sprint entries, ignoring zeros", () => {
    const result = computeVelocity([
      { label: "S1", storyPoints: 42 },
      { label: "S2", storyPoints: 38 },
      { label: "S3", storyPoints: 45 },
      { label: "S4", storyPoints: 40 },
    ]);
    expect(result).toEqual({ velocity: 41.3, usedBootstrap: false });
  });

  it("ignores zero and negative entries when averaging", () => {
    const result = computeVelocity([
      { label: "S1", storyPoints: 60 },
      { label: "S2", storyPoints: 0 },
      { label: "S3", storyPoints: -5 },
    ]);
    expect(result.velocity).toBe(60);
    expect(result.usedBootstrap).toBe(false);
  });
});

describe("computePlannerResult", () => {
  function makeInputs(overrides: Partial<PlannerInputs> = {}): PlannerInputs {
    return {
      workingDays: 22,
      averageCapacity: 198,
      bufferPercent: DEFAULT_BUFFER_PERCENT,
      velocityHistory: [{ label: "S1", storyPoints: 60 }],
      roles: [
        { name: "Backend", headcount: 3, absences: 5 },
        { name: "Frontend", headcount: 3, absences: 0 },
        { name: "QA", headcount: 3, absences: 0 },
      ],
      ...overrides,
    };
  }

  it("matches the team handbook simple example (60 SP, 198 → 193, plan 46.4)", () => {
    const result = computePlannerResult(makeInputs());
    expect(result.velocity).toBe(60);
    expect(result.totalBaseCapacity).toBe(198);
    expect(result.totalNetCapacity).toBe(193);
    expect(result.totalAbsences).toBe(5);
    expect(result.adjustedVelocity).toBe(58.5);
    expect(result.planLimit).toBe(46.8);
    expect(result.reserveSp).toBe(11.7);
    expect(result.bottleneckRole?.name).toBe("Backend");
  });

  it("flags the smallest netCapacity role as the bottleneck", () => {
    const result = computePlannerResult(
      makeInputs({
        roles: [
          { name: "Backend", headcount: 3, absences: 8 },
          { name: "Frontend", headcount: 3, absences: 0 },
          { name: "QA", headcount: 4, absences: 0 },
        ],
      }),
    );
    expect(result.bottleneckRole?.name).toBe("Backend");
    expect(result.bottleneckRole?.netCapacity).toBe(58);
  });

  it("uses bootstrap velocity when history is empty", () => {
    const result = computePlannerResult(
      makeInputs({ velocityHistory: [], averageCapacity: 0, roles: [] }),
    );
    expect(result.usedBootstrapVelocity).toBe(true);
    expect(result.velocity).toBe(BOOTSTRAP_VELOCITY_SP);
    expect(result.adjustedVelocity).toBe(BOOTSTRAP_VELOCITY_SP);
  });

  it("keeps adjusted velocity equal to raw when average capacity is zero", () => {
    const result = computePlannerResult(
      makeInputs({ averageCapacity: 0, roles: [{ name: "Backend", headcount: 3, absences: 0 }] }),
    );
    expect(result.adjustedVelocity).toBe(60);
    expect(result.planLimit).toBe(48);
  });

  it("clamps buffer at 0..80 percent", () => {
    const high = computePlannerResult(makeInputs({ bufferPercent: 200 }));
    expect(high.planLimit).toBe(11.7);

    const low = computePlannerResult(makeInputs({ bufferPercent: -10 }));
    expect(low.planLimit).toBe(58.5);
  });

  it("never returns negative netCapacity for absences exceeding base", () => {
    const result = computePlannerResult(
      makeInputs({
        roles: [{ name: "Solo", headcount: 1, absences: 999 }],
        averageCapacity: 22,
      }),
    );
    expect(result.totalNetCapacity).toBe(0);
    expect(result.bottleneckRole?.name).toBe("Solo");
  });
});

describe("summarizePlannerResult", () => {
  it("produces a single-line summary used in the list view", () => {
    const inputs: PlannerInputs = {
      workingDays: 22,
      averageCapacity: 198,
      bufferPercent: DEFAULT_BUFFER_PERCENT,
      velocityHistory: [{ label: "S1", storyPoints: 60 }],
      roles: [{ name: "Team", headcount: 9, absences: 5 }],
    };
    const result = computePlannerResult(inputs);
    expect(summarizePlannerResult(result)).toBe("46.8 SP в план · 11.7 SP буфер");
  });
});
