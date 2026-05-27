import { describe, expect, it } from "vitest";
import { resolveHeaderVisible, resolveScrollDirection } from "./scrollHideHeader";

describe("resolveScrollDirection", () => {
  it("returns none when delta is below threshold", () => {
    expect(resolveScrollDirection(100, 108, 12)).toBe("none");
  });

  it("returns down when scrolling down", () => {
    expect(resolveScrollDirection(100, 130, 12)).toBe("down");
  });

  it("returns up when scrolling up", () => {
    expect(resolveScrollDirection(200, 150, 12)).toBe("up");
  });
});

describe("resolveHeaderVisible", () => {
  it("is always visible at scroll top", () => {
    expect(resolveHeaderVisible("down", true, 0)).toBe(true);
    expect(resolveHeaderVisible("down", false, 0)).toBe(true);
  });

  it("hides on scroll down and shows on scroll up", () => {
    expect(resolveHeaderVisible("down", true, 120)).toBe(false);
    expect(resolveHeaderVisible("up", false, 120)).toBe(true);
  });

  it("keeps current visibility when direction is none", () => {
    expect(resolveHeaderVisible("none", true, 120)).toBe(true);
    expect(resolveHeaderVisible("none", false, 120)).toBe(false);
  });
});
