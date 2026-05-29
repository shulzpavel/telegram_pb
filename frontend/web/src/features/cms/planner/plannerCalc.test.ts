import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_VELOCITY_SP,
  DEFAULT_BUFFER_PERCENT,
  DEFAULT_TRACKS,
  computePlannerResult,
  summarizePlannerResult,
  type PlannerInputs,
  type PlannerTrack,
} from "./plannerCalc";

// The granular "back/front/qa" split is used throughout these tests because
// it exercises three independent tracks. The product default is dev/test —
// see the dedicated test below for that.
const TRIPLE_TRACKS: PlannerTrack[] = [
  { id: "back", label: "Backend" },
  { id: "front", label: "Frontend" },
  { id: "qa", label: "QA" },
];

function makeInputs(overrides: Partial<PlannerInputs> = {}): PlannerInputs {
  const tracks: PlannerTrack[] = overrides.tracks ?? TRIPLE_TRACKS.map((t) => ({ ...t }));
  return {
    workingDays: 22,
    bufferPercent: DEFAULT_BUFFER_PERCENT,
    tracks,
    roles: [
      { name: "Backend", trackId: "back", headcount: 3, absences: 5 },
      { name: "Frontend", trackId: "front", headcount: 3, absences: 0 },
      { name: "QA", trackId: "qa", headcount: 3, absences: 0 },
    ],
    velocityHistory: [
      {
        label: "S1",
        storyPointsByTrack: { back: 60, front: 40, qa: 30 },
      },
    ],
    actualByTrack: {},
    ...overrides,
  };
}

describe("computePlannerResult — per-track math", () => {
  it("computes each track independently using only the roles pinned to it", () => {
    const result = computePlannerResult(makeInputs());

    expect(result.tracks).toHaveLength(3);
    const [back, front, qa] = result.tracks;

    expect(back.id).toBe("back");
    expect(back.velocity).toBe(60);
    expect(back.baseCapacity).toBe(66); // 3 × 22
    expect(back.netCapacity).toBe(61); // 66 − 5 absences
    expect(back.adjustedVelocity).toBe(55.5); // 60 × 61/66
    expect(back.planLimit).toBe(44.4); // 55.5 × 0.8
    expect(back.reserveSp).toBe(11.1);

    expect(front.id).toBe("front");
    expect(front.velocity).toBe(40);
    expect(front.baseCapacity).toBe(66);
    expect(front.netCapacity).toBe(66);
    expect(front.adjustedVelocity).toBe(40); // no absences
    expect(front.planLimit).toBe(32);

    expect(qa.id).toBe("qa");
    expect(qa.velocity).toBe(30);
    expect(qa.planLimit).toBe(24);
  });

  it("sums per-track plan limits into the headline numbers", () => {
    const result = computePlannerResult(makeInputs());
    const sum = result.tracks.reduce((acc, t) => acc + t.planLimit, 0);
    expect(result.totalPlanLimit).toBe(Math.round(sum * 10) / 10);
  });

  it("auto-detects bottleneck role across all tracks", () => {
    const result = computePlannerResult(
      makeInputs({
        roles: [
          { name: "Backend", trackId: "back", headcount: 3, absences: 8 },
          { name: "Frontend", trackId: "front", headcount: 3, absences: 0 },
          { name: "QA", trackId: "qa", headcount: 4, absences: 0 },
        ],
      }),
    );
    expect(result.bottleneckRole?.name).toBe("Backend");
    expect(result.bottleneckRole?.netCapacity).toBe(58);
  });

  it("uses bootstrap velocity split across role-bearing tracks when history is empty", () => {
    const result = computePlannerResult(makeInputs({ velocityHistory: [] }));
    expect(result.usedBootstrapVelocity).toBe(true);
    const perTrack = BOOTSTRAP_VELOCITY_SP / 3; // 3 tracks each have roles
    expect(result.tracks[0].velocity).toBeCloseTo(perTrack, 1);
    expect(result.tracks[0].usedBootstrap).toBe(true);
  });

  it("does not bootstrap velocity for tracks without any roles", () => {
    const result = computePlannerResult(
      makeInputs({
        velocityHistory: [],
        roles: [{ name: "Backend", trackId: "back", headcount: 2, absences: 0 }],
      }),
    );
    expect(result.tracks.find((t) => t.id === "back")?.usedBootstrap).toBe(true);
    expect(result.tracks.find((t) => t.id === "front")?.usedBootstrap).toBe(false);
    expect(result.tracks.find((t) => t.id === "front")?.velocity).toBe(0);
  });

  it("scales each track separately when absences hit one track only", () => {
    const result = computePlannerResult(
      makeInputs({
        roles: [
          { name: "Backend", trackId: "back", headcount: 3, absences: 22 }, // 1 person fully out
          { name: "Frontend", trackId: "front", headcount: 3, absences: 0 },
          { name: "QA", trackId: "qa", headcount: 3, absences: 0 },
        ],
      }),
    );
    const back = result.tracks.find((t) => t.id === "back")!;
    const front = result.tracks.find((t) => t.id === "front")!;
    // Back scale = 44/66 ≈ 0.667 → 60 × 0.667 = 40 SP
    expect(back.adjustedVelocity).toBe(40);
    expect(back.planLimit).toBe(32);
    // Front not affected
    expect(front.scale).toBe(1);
    expect(front.adjustedVelocity).toBe(40);
  });

  it("never returns negative netCapacity for absences exceeding base", () => {
    const result = computePlannerResult(
      makeInputs({
        roles: [{ name: "Solo", trackId: "back", headcount: 1, absences: 999 }],
        velocityHistory: [{ label: "S1", storyPointsByTrack: { back: 30 } }],
      }),
    );
    expect(result.totalNetCapacity).toBe(0);
    const back = result.tracks.find((t) => t.id === "back")!;
    expect(back.netCapacity).toBe(0);
    expect(back.planLimit).toBe(0);
  });

  it("clamps buffer at 0..80 percent", () => {
    const high = computePlannerResult(makeInputs({ bufferPercent: 200 }));
    // Buffer clamped to 80 → planLimit per track = adjusted × 0.2
    expect(high.tracks[0].planLimit).toBe(11.1); // 55.5 × 0.2

    const low = computePlannerResult(makeInputs({ bufferPercent: -10 }));
    expect(low.tracks[0].planLimit).toBe(55.5); // 0% buffer
  });

  it("re-homes roles whose track was deleted onto the first remaining track", () => {
    const result = computePlannerResult(
      makeInputs({
        // No "front" track defined, but a role still references it.
        tracks: [
          { id: "back", label: "Backend" },
          { id: "qa", label: "QA" },
        ],
        roles: [
          { name: "Backend", trackId: "back", headcount: 2, absences: 0 },
          { name: "Mobile", trackId: "front", headcount: 2, absences: 0 },
          { name: "QA", trackId: "qa", headcount: 1, absences: 0 },
        ],
      }),
    );
    // Mobile re-homed onto "back" — back baseCapacity now covers 4 headcount × 22.
    const back = result.tracks.find((t) => t.id === "back")!;
    expect(back.baseCapacity).toBe(88);
  });

  it("falls back to default dev/test tracks for malformed inputs with no tracks at all", () => {
    const result = computePlannerResult(
      makeInputs({ tracks: [], roles: [], velocityHistory: [] }),
    );
    expect(result.tracks.map((t) => t.id)).toEqual(DEFAULT_TRACKS.map((t) => t.id));
    expect(result.tracks.map((t) => t.id)).toEqual(["dev", "test"]);
  });

  it("supports custom tracks beyond back/front/qa", () => {
    const result = computePlannerResult(
      makeInputs({
        tracks: [
          { id: "back", label: "Backend" },
          { id: "front", label: "Frontend" },
          { id: "qa", label: "QA" },
          { id: "design", label: "Design" },
        ],
        roles: [
          { name: "Backend", trackId: "back", headcount: 2, absences: 0 },
          { name: "Frontend", trackId: "front", headcount: 2, absences: 0 },
          { name: "QA", trackId: "qa", headcount: 1, absences: 0 },
          { name: "Designer", trackId: "design", headcount: 1, absences: 0 },
        ],
        velocityHistory: [
          { label: "S1", storyPointsByTrack: { back: 30, front: 20, qa: 15, design: 8 } },
        ],
      }),
    );
    const design = result.tracks.find((t) => t.id === "design")!;
    expect(design.label).toBe("Design");
    expect(design.velocity).toBe(8);
    expect(design.planLimit).toBe(6.4); // 8 × 1.0 × 0.8
  });
});

describe("computePlannerResult — actual vs plan", () => {
  it("returns null actualSp + zero totals when nothing entered", () => {
    const result = computePlannerResult(makeInputs());
    expect(result.hasActuals).toBe(false);
    expect(result.totalActualSp).toBeNull();
    for (const track of result.tracks) {
      expect(track.actualSp).toBeNull();
      expect(track.deltaSp).toBe(0);
      expect(track.deltaRatio).toBe(0);
    }
  });

  it("computes delta and ratio for tracks with an actual value", () => {
    const result = computePlannerResult(
      makeInputs({
        actualByTrack: { back: 50, front: 30 }, // qa omitted on purpose
      }),
    );
    const back = result.tracks.find((t) => t.id === "back")!;
    expect(back.actualSp).toBe(50);
    // back.planLimit ≈ 44.4 → delta ≈ +5.6, ratio ≈ 1.13
    expect(back.deltaSp).toBeCloseTo(5.6, 1);
    expect(back.deltaRatio).toBeCloseTo(1.13, 2);

    const qa = result.tracks.find((t) => t.id === "qa")!;
    expect(qa.actualSp).toBeNull();
    expect(qa.deltaSp).toBe(0);

    expect(result.hasActuals).toBe(true);
    expect(result.totalActualSp).toBe(80);
  });

  it("treats zero as an entered value (under-plan), not as missing", () => {
    const result = computePlannerResult(
      makeInputs({ actualByTrack: { back: 0, front: 0, qa: 0 } }),
    );
    expect(result.hasActuals).toBe(true);
    expect(result.totalActualSp).toBe(0);
    for (const track of result.tracks) {
      expect(track.actualSp).toBe(0);
      expect(track.deltaSp).toBe(-track.planLimit);
    }
  });

  it("ignores negative / NaN garbage in actualByTrack", () => {
    const result = computePlannerResult(
      makeInputs({
        actualByTrack: { back: -10, front: Number.NaN, qa: 25 },
      }),
    );
    expect(result.tracks.find((t) => t.id === "back")!.actualSp).toBeNull();
    expect(result.tracks.find((t) => t.id === "front")!.actualSp).toBeNull();
    expect(result.tracks.find((t) => t.id === "qa")!.actualSp).toBe(25);
  });
});

describe("summarizePlannerResult", () => {
  it("renders one segment per non-empty track with the global buffer", () => {
    const result = computePlannerResult(makeInputs());
    expect(summarizePlannerResult(result)).toBe(
      "Backend 44.4 / Frontend 32 / QA 24 SP · буфер 25.1",
    );
  });

  it("hides tracks with no roles and no velocity from the summary", () => {
    const result = computePlannerResult(
      makeInputs({
        tracks: [
          { id: "back", label: "Backend" },
          { id: "front", label: "Frontend" },
          { id: "qa", label: "QA" },
          { id: "design", label: "Design" },
        ],
        roles: [
          { name: "Backend", trackId: "back", headcount: 2, absences: 0 },
          { name: "QA", trackId: "qa", headcount: 1, absences: 0 },
        ],
        velocityHistory: [{ label: "S1", storyPointsByTrack: { back: 30, qa: 15 } }],
      }),
    );
    expect(summarizePlannerResult(result)).not.toMatch(/Frontend|Design/);
  });

  it("returns a friendly placeholder when nothing is defined", () => {
    const result = computePlannerResult({
      workingDays: 0,
      bufferPercent: DEFAULT_BUFFER_PERCENT,
      tracks: [],
      roles: [],
      velocityHistory: [],
      actualByTrack: {},
    });
    expect(summarizePlannerResult(result)).toBe("Нет данных");
  });
});
