import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins only truthy class names", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
