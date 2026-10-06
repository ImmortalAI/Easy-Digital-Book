import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("many CSS findings keep export controls reachable on a small window", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("treeitem", { name: "Styles (create)" }).click();
  await page
    .locator(".cm-content")
    .fill(Array.from({ length: 30 }, (_, i) => `.sample${i} { color:red; width:2vw; }`).join("\n"));
  await page.getByRole("button", { name: /^Export/ }).click();
  const dialog = page.getByRole("dialog", { name: "Export EPUB" });
  const button = dialog.getByRole("button", { name: "Export…" });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(600);
  await button.click();
  await expect(dialog.getByRole("status")).toContainText("EPUB saved");
});
