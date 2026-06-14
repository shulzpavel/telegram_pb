import { describe, expect, it } from "vitest";
import { listDatasetKey } from "./scopeListPaging";

describe("listDatasetKey", () => {
  it("is stable across reordered arrays with the same items", () => {
    const a = [{ key: "FLEX-1" }, { key: "FLEX-2" }];
    const b = [{ key: "FLEX-2" }, { key: "FLEX-1" }];
    expect(listDatasetKey(a)).toBe(listDatasetKey(b));
  });

  it("changes when dataset membership changes", () => {
    const before = [{ key: "FLEX-1" }, { key: "FLEX-2" }];
    const after = [{ key: "FLEX-1" }, { key: "FLEX-3" }];
    expect(listDatasetKey(before)).not.toBe(listDatasetKey(after));
  });
});
