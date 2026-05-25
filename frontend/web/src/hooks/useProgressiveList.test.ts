import { describe, expect, it } from "vitest";
import { applyPage, isCapped } from "./useProgressiveList";

// The hook itself relies on real React renders + DOM globals which aren't
// part of this project's test setup (no jsdom, no RTL — see theme.test.ts
// for the same pattern). The tests below pin the deterministic state
// transitions that drive the hook so the listed contract holds:
//
//   1. Param change -> items/cursor reset (covered by replace=true case).
//   2. After first page, prefetch is triggered if cursor !== null and
//      we are not capped (asserted indirectly via state.cursor / reachedCap).
//   3. loadMore commits prefetched page synchronously (covered by the
//      replace=false applyPage branch returning a new items array without
//      awaiting anything).
//   4. softCap blocks further loading (reachedCap flips when items hit cap).

const baseState = {
  items: [] as string[],
  cursor: null as string | null,
  total: null as number | null,
  loading: false,
  loadingMore: false,
  error: null as string | null,
  reachedCap: false,
};

describe("isCapped", () => {
  it("returns false when softCap is null/undefined", () => {
    expect(isCapped(500, null)).toBe(false);
    expect(isCapped(500, undefined)).toBe(false);
  });

  it("returns true when items reach or exceed softCap", () => {
    expect(isCapped(199, 200)).toBe(false);
    expect(isCapped(200, 200)).toBe(true);
    expect(isCapped(201, 200)).toBe(true);
  });
});

describe("applyPage", () => {
  it("replaces items on the first page (params reset behaviour)", () => {
    const previous = { ...baseState, items: ["stale-1", "stale-2"], cursor: "c1" };
    const next = applyPage(
      previous,
      { items: ["a", "b"], next_cursor: "c2", total: 50 },
      true,
      200,
    );
    expect(next.items).toEqual(["a", "b"]);
    expect(next.cursor).toBe("c2");
    expect(next.total).toBe(50);
    expect(next.error).toBeNull();
    expect(next.reachedCap).toBe(false);
  });

  it("appends items on loadMore", () => {
    const previous = { ...baseState, items: ["a"], cursor: "c1" };
    const next = applyPage(
      previous,
      { items: ["b", "c"], next_cursor: "c2", total: 7 },
      false,
      200,
    );
    expect(next.items).toEqual(["a", "b", "c"]);
    expect(next.cursor).toBe("c2");
    expect(next.reachedCap).toBe(false);
  });

  it("flips reachedCap when softCap is reached after a loadMore", () => {
    const previous = { ...baseState, items: Array.from({ length: 3 }, (_, i) => `item-${i}`), cursor: "c1" };
    const next = applyPage(
      previous,
      { items: ["d", "e"], next_cursor: "c2", total: 100 },
      false,
      5,
    );
    expect(next.items).toHaveLength(5);
    expect(next.reachedCap).toBe(true);
  });

  it("clears error and resets loading flags after successful page", () => {
    const previous = { ...baseState, error: "boom", loading: true, loadingMore: true };
    const next = applyPage(
      previous,
      { items: ["x"], next_cursor: null },
      true,
      null,
    );
    expect(next.error).toBeNull();
    expect(next.loading).toBe(false);
    expect(next.loadingMore).toBe(false);
    expect(next.cursor).toBeNull();
  });

  it("normalizes total to null when backend omits it", () => {
    const next = applyPage(baseState, { items: ["a"], next_cursor: null }, true, null);
    expect(next.total).toBeNull();
  });

  it("keeps reachedCap=false when softCap is disabled (null)", () => {
    const huge = Array.from({ length: 1000 }, (_, i) => `i-${i}`);
    const next = applyPage(
      { ...baseState, items: huge },
      { items: ["new"], next_cursor: null },
      false,
      null,
    );
    expect(next.items).toHaveLength(1001);
    expect(next.reachedCap).toBe(false);
  });

  it("does not append to itself when given the same items array (replace=true)", () => {
    const previous = { ...baseState, items: ["a", "b"] };
    const next = applyPage(
      previous,
      { items: ["a", "b"], next_cursor: null },
      true,
      null,
    );
    expect(next.items).toEqual(["a", "b"]);
    expect(next.items).not.toBe(previous.items);
  });
});
