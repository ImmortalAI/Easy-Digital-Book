import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

declare global {
  interface Window {
    edbE2e?: {
      files: Map<string, Uint8Array>;
      settings: Map<string, unknown>;
      cancelNextSave(): void;
    };
  }
}

test("exports AZW3 PalmDB bytes, remembers the format, and cancels without writing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator(".cm-content").fill("# Chapter 1\nAZW3 fixture text");

  await page.getByRole("button", { name: /export/i }).click();
  let dialog = page.getByRole("dialog", { name: "Export EPUB" });
  await page.getByRole("combobox", { name: /format/i }).click();
  await page.getByRole("option", { name: "AZW3" }).click();
  dialog = page.getByRole("dialog", { name: "Export AZW3" });
  await dialog.getByRole("button", { name: /export/i }).click();
  await expect(dialog.getByRole("status")).toContainText("AZW3 saved");

  const saved = await page.evaluate(() => {
    const entry = [...(window.edbE2e?.files ?? new Map())].find(([path]) => path.endsWith(".azw3"));
    if (!entry) return null;
    const [path, bytes] = entry;
    return { path, signature: Array.from(bytes.slice(60, 68)) };
  });
  expect(saved?.path).toMatch(/\.azw3$/);
  expect(saved?.signature).toEqual(Array.from(new TextEncoder().encode("BOOKMOBI")));
  await expect
    .poll(() => page.evaluate(() => window.edbE2e?.settings.get("export")))
    .toMatchObject({
      format: "azw3",
    });

  await dialog.getByRole("button", { name: /close/i }).click();
  await page.getByRole("button", { name: /export/i }).click();
  dialog = page.getByRole("dialog", { name: "Export AZW3" });
  await expect(page.getByRole("combobox", { name: /format/i })).toContainText("AZW3");
  const filesBeforeCancel = await page.evaluate(() =>
    [...(window.edbE2e?.files ?? new Map())].map(([path, bytes]) => [path, Array.from(bytes)]),
  );
  await page.evaluate(() => window.edbE2e?.cancelNextSave());
  await dialog.getByRole("button", { name: /export/i }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...(window.edbE2e?.files ?? new Map())].map(([path, bytes]) => [path, Array.from(bytes)]),
      ),
    )
    .toEqual(filesBeforeCancel);
  await expect(dialog.getByRole("status")).toHaveCount(0);
});
