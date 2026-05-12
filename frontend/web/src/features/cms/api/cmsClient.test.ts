import { describe, expect, it } from "vitest";
import { buildQuery } from "./cmsClient";

describe("buildQuery", () => {
  it("keeps cursor and serializes supported filter values", () => {
    const query = new URLSearchParams(
      buildQuery(
        {
          q: "alice",
          active: true,
          count: 7,
          empty: "",
          missing: undefined,
          nil: null,
        },
        "next-cursor",
        25
      )
    );

    expect(query.get("limit")).toBe("25");
    expect(query.get("cursor")).toBe("next-cursor");
    expect(query.get("q")).toBe("alice");
    expect(query.get("active")).toBe("true");
    expect(query.get("count")).toBe("7");
    expect(query.has("empty")).toBe(false);
    expect(query.has("missing")).toBe(false);
    expect(query.has("nil")).toBe(false);
  });
});
