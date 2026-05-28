import { describe, expect, it } from "vitest";
import { isTextEntryInputType, resolveKeyboardInset } from "./mobileKeyboard";

describe("resolveKeyboardInset", () => {
  it("returns 0 when viewport and layout heights match", () => {
    expect(resolveKeyboardInset(800, 800, 0)).toBe(0);
  });

  it("calculates inset from viewport delta and offset", () => {
    expect(resolveKeyboardInset(900, 620, 20)).toBe(260);
  });

  it("never returns negative values", () => {
    expect(resolveKeyboardInset(700, 730, 0)).toBe(0);
  });
});

describe("isTextEntryInputType", () => {
  it("treats empty type as text entry", () => {
    expect(isTextEntryInputType(undefined)).toBe(true);
    expect(isTextEntryInputType("")).toBe(true);
  });

  it("accepts text-like input types", () => {
    expect(isTextEntryInputType("text")).toBe(true);
    expect(isTextEntryInputType("email")).toBe(true);
    expect(isTextEntryInputType("number")).toBe(true);
  });

  it("rejects non-text controls", () => {
    expect(isTextEntryInputType("checkbox")).toBe(false);
    expect(isTextEntryInputType("radio")).toBe(false);
    expect(isTextEntryInputType("file")).toBe(false);
  });
});
