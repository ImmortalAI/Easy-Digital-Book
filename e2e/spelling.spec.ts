import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("misspelled word → add to dictionary → save → reopen → still accepted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\nОн сказал Минжуи и вышел.");
  const underline = page.locator(".cm-misspelled", { hasText: "Минжуи" });
  await expect(underline).toBeVisible();
  await underline.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to book dictionary" }).click();
  await expect(underline).toHaveCount(0);
  await expect(page.getByRole("button", { name: /spelling issue/ })).toContainText("0");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("region", { name: "Status bar" })).toContainText("Saved");
  await page.keyboard.press("ControlOrMeta+o");
  await expect(editor).toContainText("Минжуи");
  await expect(page.locator(".cm-misspelled")).toHaveCount(0);

  await page.getByRole("treeitem", { name: /Dictionary/ }).click();
  await expect(
    page.locator("section[aria-labelledby=dictionary-title]").getByRole("listitem"),
  ).toHaveText(["Минжуи"]);
});

test("the spelling popover keeps each row's actions inside the popover", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n\nОн сказал Минжуи и Дзюнъитиро и Кацураги.");
  await expect(page.locator(".cm-misspelled")).toHaveCount(3);

  await page.getByRole("button", { name: /spelling issue/ }).click();
  const popover = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Ignore" }).first() });
  await expect(popover).toBeVisible();
  const box = await popover.boundingBox();
  expect(box).not.toBeNull();
  for (const name of ["Add to book dictionary", "Ignore"]) {
    const buttons = popover.getByRole("button", { name });
    await expect(buttons).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(buttons.nth(i)).toBeVisible();
      const b = await buttons.nth(i).boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(box!.x);
      expect(b!.x + b!.width).toBeLessThanOrEqual(box!.x + box!.width + 0.5);
    }
  }
});
