import { expect, type Page } from "playwright/test";
import { test } from "./fixtures/platform";

// A 1x1 transparent PNG: enough for the import to recognise the signature.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function newBookWithImage(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await page.locator('[data-action="new-project"]').click();
  await page.locator(".cm-content").waitFor();
  await page.getByRole("treeitem", { name: /^Images/ }).click();
  const gallery = page.locator("[data-image-gallery]");
  await gallery.waitFor();
  await gallery.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "pic.png", { type: "image/png" }));
    element.dispatchEvent(
      new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
    );
  }, PNG);
  await expect(page.locator('[data-gallery-path="images/pic.png"]')).toBeVisible();
  // Importing from the gallery keeps the gallery on screen.
  await expect(gallery).toBeVisible();
  await page.getByRole("treeitem", { name: /^1\. / }).click();
  await page.locator(".cm-content").waitFor();
}

async function expectPickerStaysOpenAndInserts(page: Page) {
  const pick = page.getByRole("button", { name: "images/pic.png" });
  await expect(pick).toBeVisible();
  await page.waitForTimeout(500);
  await expect(pick).toBeVisible();
  // Focus lands inside the picker, not back on the toolbar.
  const focusInside = await page
    .locator("[data-slot=popover-content]")
    .evaluate((element) => element.contains(document.activeElement));
  expect(focusInside).toBe(true);
  await pick.click();
  await expect(pick).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("![](images/pic.png)");
}

test("the book image picker opened from the image menu stays open", async ({ page }) => {
  await newBookWithImage(page, 1280);
  await page.getByRole("button", { name: "Insert image" }).click();
  await page.getByRole("menuitem", { name: "From the book…" }).click();
  await expectPickerStaysOpenAndInserts(page);
});

test("the book image picker opened by keyboard stays open", async ({ page }) => {
  await newBookWithImage(page, 1280);
  await page.getByRole("button", { name: "Insert image" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "From file…" }).waitFor();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "From the book…" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expectPickerStaysOpenAndInserts(page);
});

test("the book image picker opened from the More menu stays open", async ({ page }) => {
  await newBookWithImage(page, 800);
  await page.getByRole("button", { name: "More formatting" }).click();
  await page.getByRole("menuitem", { name: "Insert image" }).click();
  await page.getByRole("menuitem", { name: "From the book…" }).click();
  await expectPickerStaysOpenAndInserts(page);
});
