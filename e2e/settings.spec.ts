import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("switching the interface language does not raise an error", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(String(error)));

  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator('[data-activity="settings"]').click();
  await page.locator("[data-settings-view]").waitFor();

  await page.getByRole("combobox", { name: /interface language/i }).click();
  await page.getByRole("option", { name: "Русский" }).click();
  await expect(page.locator("#settings-title")).toHaveText("Настройки");

  await page.getByRole("combobox", { name: /язык интерфейса/i }).click();
  await page.getByRole("option", { name: "简体中文" }).click();
  await expect(page.locator("#settings-title")).toHaveText("设置");

  // The crash dialog is what the user actually saw.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(crashes).toEqual([]);
});

test("the theme switcher darkens the window", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator('[data-activity="settings"]').click();

  await page.getByRole("combobox", { name: /theme/i }).click();
  await page.getByRole("option", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByRole("combobox", { name: /theme/i }).click();
  await page.getByRole("option", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});

test("settings use two columns on a wide window", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator('[data-activity="settings"]').click();
  const appearance = await page.getByRole("heading", { name: "Appearance" }).boundingBox();
  const exportHeading = await page.getByRole("heading", { name: "Export" }).boundingBox();
  expect(exportHeading!.x).toBeGreaterThan(appearance!.x + 200);
  expect(Math.abs(exportHeading!.y - appearance!.y)).toBeLessThan(4);
});
