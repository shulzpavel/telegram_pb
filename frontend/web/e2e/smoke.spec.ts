import { expect, test } from "@playwright/test";

// -----------------------------------------------------------------------------
// Smoke suite
// -----------------------------------------------------------------------------
// Each test exercises a critical user path that *must* keep working between
// releases. They are intentionally short and assertion-light: smoke is about
// "does it render and react?", deeper behaviour is covered by unit tests and
// (eventually) full integration suites.
//
// All tests run against a static `vite preview` build — no backend — so they
// avoid any state that could leak between runs.
// -----------------------------------------------------------------------------

test.describe("public surfaces", () => {
  test("landing hub presents entry paths for manager and player", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Выберите, что нужно сделать сейчас/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть менеджерский экран" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть демо для игрока" })).toBeVisible();
  });

  test("unknown URL falls back to the 404 mascot", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByRole("heading", { name: /Бибизяныч не нашёл эту страницу/ }),
    ).toBeVisible();
  });
});

test.describe("CMS routing", () => {
  test("unauthenticated /cms shows the CMS login form", async ({ page }) => {
    await page.goto("/cms");

    await expect(page.getByRole("heading", { name: /Админка Planning Poker/ })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти" })).toBeDisabled();
  });

  test("/manage without auth redirects into the unified CMS login", async ({ page }) => {
    // Phase 2 / A1 — the standalone `/manage` landing was retired in
    // favour of the CMS sessions list as a single entry-point.
    await page.goto("/manage");

    await expect(page).toHaveURL(/\/cms\/sessions$/);
    await expect(page.getByRole("heading", { name: /Админка Planning Poker/ })).toBeVisible();
  });

  test("/cms/sessions/:id/cockpit shows the CMS login when not authed", async ({ page }) => {
    // Deep-link to a session detail without a cookie: the auth-unification
    // logic in ManagerPage routes this through CmsLoginPage rather than the
    // legacy ManagerLogin so the framing matches the rest of CMS.
    await page.goto("/cms/sessions/424242/cockpit");

    await expect(page.getByRole("heading", { name: /Админка Planning Poker/ })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
  });
});

test.describe("participant flow", () => {
  test("demo mock join flow reaches the voting screen and accepts a vote", async ({ page }) => {
    await page.goto("/demo?mock=1");

    // JoinPage is rendered with a mock task. Form labels are stable
    // across UI iterations, so we assert on them rather than on the
    // task title or marketing copy.
    await expect(page.getByLabel("Корпоративная почта")).toBeVisible();
    await page.getByLabel("Корпоративная почта").fill("qa.user@betboom.com");

    // Role chips are buttons. The "QA" label is shared across the chip
    // text and the assistive icon — `getByRole` with exact match keeps
    // us aimed at the actual button.
    await page.getByRole("button", { name: "QA" }).click();
    await page.getByRole("button", { name: "Войти в сессию" }).click();

    // VotePage exposes the card grid; clicking "5" should transition
    // to the "Вы проголосовали!" success state.
    await expect(page.getByText("Выберите оценку")).toBeVisible();
    await page.getByRole("button", { name: "5" }).click();
    await expect(page.getByText("Вы проголосовали!")).toBeVisible();
  });
});

test.describe("retro participant flow", () => {
  test("/r/:token renders the anonymous join form", async ({ page }) => {
    // No backend in the preview build — the state fetch fails and the page
    // stays on the join step. We assert the stable join affordances render.
    await page.goto("/r/smoke-token");

    await expect(page.getByRole("heading", { name: /Ретроспектива команды/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "QA" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти в ретро" })).toBeVisible();
  });
});
