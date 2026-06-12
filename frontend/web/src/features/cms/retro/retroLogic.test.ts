import { describe, expect, it } from "vitest";
import {
  allRetroSectionsOpened,
  canAddToSection,
  cardsBySection,
  formatCountdown,
  isCountdownExpired,
  mergeRetroState,
  nextSectionId,
  nextUnopenedSection,
  phaseLabel,
  type RetroLiveState,
} from "./retroLogic";

function makeState(overrides: Partial<RetroLiveState> = {}): RetroLiveState {
  return {
    retro_id: 1,
    title: "Retro",
    phase: "collecting",
    active_section_id: "a",
    section_deadline: null,
    visited_section_ids: ["a"],
    votes_per_person: 5,
    default_section_seconds: 300,
    sections: [
      { section_id: "a", title: "A" },
      { section_id: "b", title: "B" },
      { section_id: "c", title: "C" },
    ],
    cards: [
      { card_id: "c1", section_id: "a", text: "one", vote_count: 2 },
      { card_id: "c2", section_id: "a", text: "two", vote_count: 0 },
      { card_id: "c3", section_id: "b", text: "three", vote_count: 1 },
    ],
    groups: [],
    action_items: [],
    participants_count: 3,
    ai_summary: null,
    my_votes: [],
    my_votes_used: 0,
    my_votes_remaining: 5,
    version: 1,
    ...overrides,
  };
}

describe("phaseLabel", () => {
  it("maps known phases to Russian labels", () => {
    expect(phaseLabel("collecting")).toBe("Сбор карточек");
    expect(phaseLabel("voting")).toBe("Голосование");
    expect(phaseLabel("done")).toBe("Завершено");
  });
});

describe("cardsBySection", () => {
  it("groups cards under each section preserving order, with empty buckets", () => {
    const grouped = cardsBySection(makeState());
    expect(grouped.get("a")?.map((c) => c.card_id)).toEqual(["c1", "c2"]);
    expect(grouped.get("b")?.map((c) => c.card_id)).toEqual(["c3"]);
    expect(grouped.get("c")).toEqual([]);
  });
});

describe("nextSectionId", () => {
  const sections = makeState().sections;
  it("returns the first section when nothing is active", () => {
    expect(nextSectionId(sections, null)).toBe("a");
  });
  it("returns the following section", () => {
    expect(nextSectionId(sections, "a")).toBe("b");
    expect(nextSectionId(sections, "b")).toBe("c");
  });
  it("returns null past the last section", () => {
    expect(nextSectionId(sections, "c")).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(nextSectionId([], "a")).toBeNull();
  });
});

describe("retro section progress", () => {
  it("detects whether every section was opened", () => {
    expect(allRetroSectionsOpened(makeState({ visited_section_ids: ["a", "b"] }))).toBe(false);
    expect(allRetroSectionsOpened(makeState({ visited_section_ids: ["a", "b", "c"] }))).toBe(true);
  });

  it("returns the next unopened section", () => {
    expect(nextUnopenedSection(makeState({ visited_section_ids: ["a"] }))?.section_id).toBe("b");
    expect(nextUnopenedSection(makeState({ visited_section_ids: ["a", "b", "c"] }))).toBeNull();
  });
});

describe("mergeRetroState", () => {
  it("ignores older snapshots", () => {
    const current = makeState({ version: 5, active_section_id: "b" });
    const stale = makeState({ version: 4, active_section_id: null });
    expect(mergeRetroState(current, stale)).toBe(current);
  });
  it("applies newer snapshots", () => {
    const current = makeState({ version: 4, active_section_id: null });
    const newer = makeState({ version: 5, active_section_id: "b" });
    expect(mergeRetroState(current, newer).active_section_id).toBe("b");
  });
  it("preserves local vote hints on anonymous broadcasts", () => {
    const current = makeState({
      version: 3,
      my_votes: ["c1"],
      my_votes_used: 1,
      my_votes_remaining: 4,
    });
    const broadcast = makeState({
      version: 4,
      my_votes: [],
      my_votes_used: 0,
      my_votes_remaining: 5,
    });
    const merged = mergeRetroState(current, broadcast, { preserveMyVotes: true });
    expect(merged.version).toBe(4);
    expect(merged.my_votes).toEqual(["c1"]);
    expect(merged.my_votes_used).toBe(1);
    expect(merged.my_votes_remaining).toBe(4);
  });
});

describe("canAddToSection", () => {
  it("allows only the active section while collecting", () => {
    const state = makeState({ phase: "collecting", active_section_id: "a" });
    expect(canAddToSection(state, "a")).toBe(true);
    expect(canAddToSection(state, "b")).toBe(false);
  });
  it("rejects outside the collecting phase", () => {
    const state = makeState({ phase: "voting", active_section_id: "a" });
    expect(canAddToSection(state, "a")).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("returns null without a deadline", () => {
    expect(formatCountdown(null)).toBeNull();
  });
  it("formats remaining time as M:SS", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const deadline = "2026-01-01T00:01:05Z";
    expect(formatCountdown(deadline, now)).toBe("1:05");
  });
  it("clamps to 0:00 once expired", () => {
    const now = Date.parse("2026-01-01T00:05:00Z");
    const deadline = "2026-01-01T00:00:00Z";
    expect(formatCountdown(deadline, now)).toBe("0:00");
  });
});

describe("isCountdownExpired", () => {
  it("is false without a deadline", () => {
    expect(isCountdownExpired(null)).toBe(false);
  });
  it("detects an expired deadline", () => {
    const now = Date.parse("2026-01-01T00:05:00Z");
    expect(isCountdownExpired("2026-01-01T00:00:00Z", now)).toBe(true);
    expect(isCountdownExpired("2026-01-01T00:10:00Z", now)).toBe(false);
  });
});
