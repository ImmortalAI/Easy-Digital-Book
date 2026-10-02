import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator(".cm-content").waitFor();
});

test("the file menu closes the project, asking about unsaved changes first", async ({ page }) => {
  await page.getByRole("button", { name: /Untitled book/ }).click();
  await page.getByRole("menuitem", { name: /^Close project/ }).click();

  // A new project is unsaved: cancelling keeps it open.
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-shell]")).toBeVisible();

  await page.getByRole("button", { name: /Untitled book/ }).click();
  await page.getByRole("menuitem", { name: /^Close project/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Don't save" }).click();

  await expect(page.locator("[data-shell]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
});

test("Mod+W closes the project from the editor", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+w");
  await page.getByRole("alertdialog").getByRole("button", { name: "Don't save" }).click();

  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
});
