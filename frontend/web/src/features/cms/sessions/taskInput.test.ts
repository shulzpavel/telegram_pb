import { describe, expect, it } from "vitest";
import { normalizeOptionalNumber, normalizeOptionalText } from "./taskInput";

describe("task input normalizers", () => {
  it("normalizes optional text fields", () => {
    expect(normalizeOptionalText("  x ")).toBe("x");
    expect(normalizeOptionalText("  ")).toBeNull();
  });

  it("normalizes optional non-negative numbers", () => {
    expect(normalizeOptionalNumber("13")).toBe(13);
    expect(normalizeOptionalNumber("-1")).toBeNull();
    expect(normalizeOptionalNumber("abc")).toBeNull();
  });
});
