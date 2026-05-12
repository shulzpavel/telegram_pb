import { expect, test } from "@playwright/test";

test("demo join flow reaches voting screen", async ({ page }) => {
  await page.goto("/demo?mock=1");

  await expect(page.getByRole("heading", { name: /Добавить авторизацию/ })).toBeVisible();
  await page.getByLabel("Ваше имя").fill("QA User");
  await page.getByRole("button", { name: "QA" }).click();
  await page.getByRole("button", { name: "Войти в сессию" }).click();

  await expect(page.getByText("Выберите оценку")).toBeVisible();
  await page.getByRole("button", { name: "5" }).click();
  await expect(page.getByText("Вы проголосовали!")).toBeVisible();
});

test("cms unauthenticated route renders login on desktop and mobile", async ({ page }) => {
  await page.goto("/cms");

  await expect(page.getByRole("heading", { name: "CMS" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
});

test("manager route renders product login without CMS shell", async ({ page }) => {
  await page.goto("/manage");

  await expect(page.getByRole("heading", { name: "Вход менеджера" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти" })).toBeDisabled();
});
