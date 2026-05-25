import { describe, expect, it } from "vitest";
import type { CmsPermission } from "../../api/cmsTypes";
import {
  filterPermissions,
  formatRelativeTime,
  groupPermissionsByPrefix,
  groupPrefixOf,
  labelForGroup,
} from "./helpers";

function perm(key: string, label = key, description = ""): CmsPermission {
  return { key, label, description };
}

describe("groupPrefixOf", () => {
  it("strips the last dotted segment", () => {
    expect(groupPrefixOf("cms.access.view")).toBe("cms.access");
    expect(groupPrefixOf("app.sessions.manage")).toBe("app.sessions");
  });
  it("returns empty for single-segment keys", () => {
    expect(groupPrefixOf("solo")).toBe("");
  });
});

describe("labelForGroup", () => {
  it("uses pretty labels for known prefixes", () => {
    expect(labelForGroup("cms.access")).toBe("Доступы");
    expect(labelForGroup("app.sessions")).toBe("Сессии планинга");
  });
  it("falls back to the literal prefix for unknown groups", () => {
    expect(labelForGroup("totally.new.feature")).toBe("totally.new.feature");
  });
  it("uses 'Прочее' for empty prefixes", () => {
    expect(labelForGroup("")).toBe("Прочее");
  });
});

describe("groupPermissionsByPrefix", () => {
  it("buckets permissions by prefix and sorts both groups and items", () => {
    const groups = groupPermissionsByPrefix([
      perm("cms.access.view"),
      perm("app.sessions.manage"),
      perm("cms.access.manage"),
      perm("cms.tasks.manage"),
    ]);
    // Groups are sorted by Russian label (Доступы, Задачи, Сессии планинга).
    expect(groups.map((group) => group.key)).toEqual([
      "cms.access",
      "cms.tasks",
      "app.sessions",
    ]);
    const accessGroup = groups.find((g) => g.key === "cms.access");
    expect(accessGroup?.permissions.map((p) => p.key)).toEqual([
      "cms.access.manage",
      "cms.access.view",
    ]);
  });

  it("places ungrouped permissions into 'Прочее' at the end", () => {
    const groups = groupPermissionsByPrefix([
      perm("cms.access.view"),
      perm("orphan"),
    ]);
    expect(groups[groups.length - 1]?.key).toBe("_other");
    expect(groups[groups.length - 1]?.label).toBe("Прочее");
  });
});

describe("filterPermissions", () => {
  const all = [
    perm("cms.access.view", "Просмотр доступов", "Чтение списка ролей"),
    perm("cms.access.manage", "Управление доступами"),
    perm("app.sessions.manage", "Управление сессиями"),
  ];

  it("returns the full list when query is empty", () => {
    expect(filterPermissions(all, "")).toHaveLength(3);
    expect(filterPermissions(all, "   ")).toHaveLength(3);
  });

  it("matches against key, label and description (case-insensitive)", () => {
    expect(filterPermissions(all, "access").map((p) => p.key)).toEqual([
      "cms.access.view",
      "cms.access.manage",
    ]);
    expect(filterPermissions(all, "сесси").map((p) => p.key)).toEqual([
      "app.sessions.manage",
    ]);
    expect(filterPermissions(all, "Чтение").map((p) => p.key)).toEqual([
      "cms.access.view",
    ]);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-05-22T12:00:00Z").getTime();

  it("returns 'никогда' when value is missing or invalid", () => {
    expect(formatRelativeTime(null, now)).toBe("никогда");
    expect(formatRelativeTime(undefined, now)).toBe("никогда");
    expect(formatRelativeTime("not-a-date", now)).toBe("никогда");
  });

  it("returns relative phrases inside the week window", () => {
    expect(formatRelativeTime(new Date(now - 30 * 1000).toISOString(), now)).toBe("только что");
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe("5 минут назад");
    expect(formatRelativeTime(new Date(now - 1 * 60 * 60 * 1000).toISOString(), now)).toBe("1 час назад");
    expect(formatRelativeTime(new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe("2 дня назад");
  });

  it("falls back to a full date past the week boundary", () => {
    const old = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(old, now)).not.toMatch(/назад/);
  });
});
