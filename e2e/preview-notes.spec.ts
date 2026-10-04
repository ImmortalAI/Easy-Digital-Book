import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("a note link scrolls the preview instead of navigating it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.locator('[data-action="new-project"]').click();
  const filler = Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1}.`).join("\n\n");
  await page
    .locator(".cm-content")
    .fill(`# Chapter 1\nHero[^1] walks.\n\n${filler}\n\n[^1]: The note.`);

  const frame = page.frameLocator('[data-pane="preview"] iframe');
  const noteref = frame.locator("a.noteref");
  await expect(noteref).toBeVisible();
  const iframe = page.locator('[data-pane="preview"] iframe');
  const scrollY = () => iframe.evaluate((el: HTMLIFrameElement) => el.contentWindow!.scrollY);
  expect(await scrollY()).toBe(0);

  await noteref.click();
  await expect.poll(scrollY).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const state = await iframe.evaluate((el: HTMLIFrameElement) => ({
    url: el.contentWindow!.location.href,
    styled: Boolean(el.contentDocument!.querySelector("style[data-preview]")),
    csp: Boolean(el.contentDocument!.querySelector("meta[http-equiv='Content-Security-Policy']")),
  }));
  expect(state).toEqual({ url: "about:srcdoc", styled: true, csp: true });

  // The back link returns to the reference near the top of the chapter.
  const atNote = await scrollY();
  await frame.locator("a.endnote-backlink").click();
  await expect.poll(scrollY).toBeLessThan(atNote / 2);
});
