import { describe, expect, it } from "vitest";
import { teamDisplayLabel } from "./TeamBadge";
import { needsTeamPicker, resolveDefaultTeamId } from "./TeamSelect";
import { teamFilterParams } from "./TeamFilter";

describe("team UI helpers", () => {
  it("labels legacy rows", () => {
    expect(teamDisplayLabel(null, null)).toBe("Без команды");
  });

  it("auto-selects the only team", () => {
    expect(resolveDefaultTeamId([{ id: 3, slug: "a", name: "A", description: "", is_active: true, created_at: "", updated_at: "" }])).toBe(3);
  });

  it("requires picker for multi-team non-superuser", () => {
    const teams = [
      { id: 1, slug: "a", name: "A", description: "", is_active: true, created_at: "", updated_at: "" },
      { id: 2, slug: "b", name: "B", description: "", is_active: true, created_at: "", updated_at: "" },
    ];
    expect(needsTeamPicker(teams, false)).toBe(true);
    expect(needsTeamPicker(teams, true)).toBe(true);
    expect(needsTeamPicker(teams.slice(0, 1), false)).toBe(false);
  });

  it("maps team filter params", () => {
    expect(teamFilterParams("")).toEqual({});
    expect(teamFilterParams("legacy")).toEqual({});
    expect(teamFilterParams("12")).toEqual({ team_id: 12 });
  });
});
