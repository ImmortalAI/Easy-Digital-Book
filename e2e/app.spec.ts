import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("new book, save/open, search/replace, undo delete, and export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();

  const editor = page.locator(".cm-content");
  await editor.fill("# Chapter 1\nhero");
  await page.keyboard.press("Control+s");
  // The first save names the untitled book after its file; the path itself is not shown.
  await expect(page.getByRole("button", { name: /^book/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Status bar" })).toContainText("Saved");

  await page.keyboard.press("Control+o");
  await expect(editor).toContainText("hero");

  await page.keyboard.press("Control+Shift+f");
  await page.getByRole("searchbox").fill("hero");
  await expect(page.getByText("1 results in 1 chapters")).toBeVisible();
  const group = page.getByRole("group", { name: "Chapter 1" });
  await expect(group.getByText("1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show replace" }).click();
  await page.getByRole("textbox", { name: "Replace" }).fill("champion");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(editor).toContainText("champion");

  await page.locator('[data-activity="explorer"]').click();
  const chapters = page.getByRole("treeitem", { name: /^\d+\. / });
  await page.getByRole("button", { name: "New chapter", exact: true }).click();
  await expect(chapters).toHaveCount(2);

  await page
    .getByRole("treeitem", { name: /^2\. / })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  // Replace all registers an undo notification of its own, so the stack holds
  // that one as well; the chapter deletion is the one to undo.
  const deleteToast = page
    .getByRole("region", { name: /notifications/i })
    .getByRole("listitem")
    .filter({ hasText: "Chapter deleted" });
  await expect(deleteToast).toBeVisible();
  await deleteToast.getByRole("button", { name: "Undo" }).click();
  await expect(chapters).toHaveCount(2);

  await page.getByRole("button", { name: /export/i }).click();
  const dialog = page.getByRole("dialog", { name: "Export EPUB" });
  await dialog.getByRole("button", { name: /export/i }).click();
  await expect(dialog.getByText("EPUB saved")).toBeVisible();
});

test("the collapsed editor takes no focus and no keystrokes in Preview mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const editor = page.locator(".cm-content");
  await editor.fill("# Chapter 1\nhero");

  await page.keyboard.press("Control+3");
  // The editor had focus when the pane collapsed; keystrokes must not reach it.
  await expect(editor).not.toBeFocused();
  await page.keyboard.type("zzz");
  // Tab backwards through the window: the 0-width editor must never be reached.
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Shift+Tab");
    await expect(editor).not.toBeFocused();
  }

  await page.keyboard.press("Control+1");
  await expect(editor).toHaveText(/hero/);
  await expect(editor).not.toContainText("zzz");
});
