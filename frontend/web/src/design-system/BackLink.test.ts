import { describe, expect, it } from "vitest";
import { resolveBackTarget } from "./BackLink";

describe("resolveBackTarget", () => {
  it("renders an explicit link when `to` is provided", () => {
    expect(resolveBackTarget({ to: "/cms/sessions", locationKey: "default" })).toEqual({
      kind: "link",
      to: "/cms/sessions",
    });
  });

  it("prefers `to` even when history is available", () => {
    expect(
      resolveBackTarget({ to: "/cms", fallbackTo: "/somewhere", locationKey: "abc123" }),
    ).toEqual({ kind: "link", to: "/cms" });
  });

  it("goes back through history when no `to` is set and the router has navigated", () => {
    expect(resolveBackTarget({ locationKey: "abc123" })).toEqual({ kind: "history-back" });
  });

  it("falls back to the provided URL on a fresh page load", () => {
    expect(
      resolveBackTarget({ fallbackTo: "/cms/sessions", locationKey: "default" }),
    ).toEqual({ kind: "fallback", to: "/cms/sessions" });
  });

  it("defaults to `/` when neither `to` nor `fallbackTo` are provided", () => {
    expect(resolveBackTarget({ locationKey: "default" })).toEqual({
      kind: "fallback",
      to: "/",
    });
  });
});
