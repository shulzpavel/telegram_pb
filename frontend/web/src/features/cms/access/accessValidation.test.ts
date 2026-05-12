import { describe, expect, it } from "vitest";
import { parseOptionalTelegramUserId, validateCreateAdminInput } from "./accessValidation";

describe("validateCreateAdminInput", () => {
  it("accepts a valid CMS user form", () => {
    expect(
      validateCreateAdminInput({
        username: "lead.user@example.com",
        password: "password123",
        roleIds: [1],
        telegramUserId: "123456",
      })
    ).toEqual([]);
  });

  it("explains why the form cannot be submitted", () => {
    expect(
      validateCreateAdminInput({
        username: "bad user",
        password: "short",
        roleIds: [],
        telegramUserId: "abc",
      })
    ).toEqual([
      "Username may contain only letters, numbers, dot, underscore, dash, and @.",
      "Password must be at least 8 characters.",
      "Select at least one role.",
      "Telegram user_id must be a positive integer.",
    ]);
  });
});

describe("parseOptionalTelegramUserId", () => {
  it("normalizes empty and numeric values", () => {
    expect(parseOptionalTelegramUserId("")).toBeNull();
    expect(parseOptionalTelegramUserId(" 42 ")).toBe(42);
  });
});
