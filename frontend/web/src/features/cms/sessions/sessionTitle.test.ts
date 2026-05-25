import { describe, expect, it } from "vitest";
import { displaySessionTitle, sessionKeyChip } from "./sessionTitle";

describe("displaySessionTitle", () => {
  it("returns the trimmed title when set", () => {
    expect(displaySessionTitle({ id: 42, title: "  Planning Poker  " })).toBe(
      "Planning Poker"
    );
  });

  it("falls back to `Сессия #<id>` when title is null", () => {
    expect(displaySessionTitle({ id: 7, title: null })).toBe("Сессия #7");
  });

  it("falls back to `Сессия #<id>` when title is empty/whitespace", () => {
    expect(displaySessionTitle({ id: 11, title: "   " })).toBe("Сессия #11");
  });
});

describe("sessionKeyChip", () => {
  it("trims long negative chat ids to the last six digits", () => {
    expect(sessionKeyChip({ chat_id: -1169070794865 })).toBe("#794865");
  });

  it("returns the full id when shorter than seven digits", () => {
    expect(sessionKeyChip({ chat_id: 12345 })).toBe("#12345");
  });

  it("normalises sign for positive ids", () => {
    expect(sessionKeyChip({ chat_id: 1234567 })).toBe("#234567");
  });
});
