import { describe, expect, it } from "vitest";
import { staggerDelay } from "./motion";

describe("design-system motion", () => {
  it("returns zero stagger when reduced motion is enabled", () => {
    expect(staggerDelay(10, true)).toBe(0);
  });

  it("caps stagger for large lists", () => {
    expect(staggerDelay(50, false)).toBe(staggerDelay(12, false));
  });
});
