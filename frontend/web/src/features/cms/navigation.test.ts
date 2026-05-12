import { describe, expect, it } from "vitest";
import type { CmsPrincipal } from "./api/cmsTypes";
import { CMS_PERMISSIONS, hasPermission, visibleCmsTabs } from "./navigation";

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
      "sessions",
      "users",
      "votes",
      "tokens",
      "web",
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

  it("falls back to static order when pages are not present in auth payload", () => {
    const admin = principal({
      permissions: [CMS_PERMISSIONS.votes, CMS_PERMISSIONS.sessions],
    });

    expect(visibleCmsTabs(admin).map((tab) => tab.key)).toEqual(["sessions", "votes"]);
  });
});
