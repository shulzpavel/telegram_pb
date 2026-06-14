import { describe, expect, it } from "vitest";
import type { CmsPrincipal } from "./api/cmsTypes";
import {
  CMS_PERMISSIONS,
  cmsTabs,
  groupVisibleTabs,
  hasPermission,
  visibleCmsTabs,
} from "./navigation";

function principal(overrides: Partial<CmsPrincipal>): CmsPrincipal {
  return {
    id: 1,
    username: "admin",
    display_name: null,
    is_superuser: false,
    permissions: [],
    roles: [],
    pages: [],
    ...overrides,
  };
}

describe("CMS navigation", () => {
  it("allows every permission for a superuser", () => {
    const admin = principal({ is_superuser: true });

    expect(hasPermission(admin, CMS_PERMISSIONS.accessManage)).toBe(true);
    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual([
      "overview",
      "planner",
      "sessions",
      "scope",
      "retro",
      "users",
      "tokens",
      "events",
      "access",
    ]);
  });

  it("shows only allowed pages in database order", () => {
    const admin = principal({
      permissions: [CMS_PERMISSIONS.users, CMS_PERMISSIONS.sessions],
      pages: [
        {
          key: "users",
          label: "Users",
          path: "/cms/users",
          permission_key: CMS_PERMISSIONS.users,
          sort_order: 10,
        },
        {
          key: "sessions",
          label: "Sessions",
          path: "/cms/sessions",
          permission_key: CMS_PERMISSIONS.sessions,
          sort_order: 20,
        },
        {
          key: "access",
          label: "Access",
          path: "/cms/access",
          permission_key: CMS_PERMISSIONS.access,
          sort_order: 30,
        },
      ],
    });

    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual(["users", "sessions"]);
  });

  it("appends newly permitted frontend tabs when backend pages payload is stale", () => {
    const admin = principal({
      permissions: [
        CMS_PERMISSIONS.users,
        CMS_PERMISSIONS.sessions,
        CMS_PERMISSIONS.planner,
        CMS_PERMISSIONS.retro,
      ],
      pages: [
        {
          key: "users",
          label: "Users",
          path: "/cms/users",
          permission_key: CMS_PERMISSIONS.users,
          sort_order: 10,
        },
        {
          key: "sessions",
          label: "Sessions",
          path: "/cms/sessions",
          permission_key: CMS_PERMISSIONS.sessions,
          sort_order: 20,
        },
      ],
    });

    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual(["users", "sessions", "planner", "scope", "retro"]);
  });

  it("falls back to static order when pages are not present in auth payload", () => {
    const admin = principal({
      permissions: [CMS_PERMISSIONS.users, CMS_PERMISSIONS.sessions],
    });

    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual(["sessions", "users"]);
  });

  it("hides legacy votes/web pages even if backend still grants the permission", () => {
    const admin = principal({
      permissions: ["cms.votes.view", "cms.web.view", CMS_PERMISSIONS.sessions],
    });

    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual(["sessions"]);
  });

  it("keeps the canonical tab count stable", () => {
    expect(cmsTabs).toHaveLength(9);
  });
});

describe("groupVisibleTabs", () => {
  it("returns an empty list when the principal has no permissions", () => {
    expect(groupVisibleTabs(principal({}))).toEqual([]);
  });

  it("groups permitted tabs in the declared group order", () => {
    const admin = principal({
      is_superuser: true,
    });

    const grouped = groupVisibleTabs(admin);
    expect(grouped.map((g) => g.group.key)).toEqual(["core", "operations", "security"]);
    expect(grouped.find((g) => g.group.key === "operations")?.items.map((t) => t.key)).toEqual([
      "planner",
      "sessions",
      "scope",
      "retro",
      "users",
      "tokens",
    ]);
  });

  it("returns one item per group when only two tabs across two groups are visible", () => {
    const admin = principal({
      permissions: [CMS_PERMISSIONS.sessions, CMS_PERMISSIONS.access],
    });

    const grouped = groupVisibleTabs(admin);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].group.key).toBe("operations");
    expect(grouped[0].items.map((t) => t.key)).toEqual(["sessions"]);
    expect(grouped[1].group.key).toBe("security");
    expect(grouped[1].items.map((t) => t.key)).toEqual(["access"]);
  });

  it("drops empty groups entirely", () => {
    const admin = principal({
      permissions: [CMS_PERMISSIONS.overview],
    });

    const grouped = groupVisibleTabs(admin);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group.key).toBe("core");
  });
});
