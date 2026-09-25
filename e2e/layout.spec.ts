import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

const VIEWPORT = { width: 1280, height: 800 };

const SHELL = "[data-shell]";
const BODY = "[data-shell-body]";
const SIDEBAR = "[data-sidebar]";
const SINGLE_PANE = "[data-single-pane]";
const SINGLE_PANE_CONTENT = "[data-single-pane-content]";
const SETTINGS = "[data-settings-view]";

async function heightOf(page: import("playwright/test").Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("shell fills the window height", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/");
    await page.locator('[data-action="new-project"]').click();
    await page.locator(".cm-content").waitFor();
  });

  test("the split stretches to the full body height in split mode", async ({ page }) => {
    const body = await heightOf(page, BODY);
    const split = await heightOf(page, "[data-resizable-split]");

    expect(body).toBeGreaterThan(VIEWPORT.height * 0.8);
    expect(split).toBeCloseTo(body, 0);
  });

  test("editor and preview panes reach the bottom of the window", async ({ page }) => {
    const shellBottom = await page
      .locator(SHELL)
      .evaluate((el) => el.getBoundingClientRect().bottom);

    for (const pane of ['[data-pane="source"]', '[data-pane="preview"]']) {
      const bottom = await page.locator(pane).evaluate((el) => el.getBoundingClientRect().bottom);
      expect(bottom).toBeCloseTo(shellBottom, 0);
    }
  });

  test("the sidebar stretches to the full split height", async ({ page }) => {
    await page.locator(SIDEBAR).waitFor();

    const split = await heightOf(page, "[data-resizable-split]");
    const sidebar = await heightOf(page, SIDEBAR);
    expect(sidebar).toBeCloseTo(split, 0);
  });

  test("a single pane view stretches to the full body height", async ({ page }) => {
    await page.locator('[data-activity="settings"]').click();
    await page.locator(SETTINGS).waitFor();

    const body = await heightOf(page, BODY);
    const pane = await page
      .locator(SINGLE_PANE)
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(pane).toBeCloseTo(body, 0);
  });

  test("the shell never grows past the window", async ({ page }) => {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBe(VIEWPORT.height);
  });

  test("a long chapter scrolls inside the editor, not the document", async ({ page }) => {
    const long = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of the chapter`).join("\n");
    await page.locator(".cm-content").fill(`# Chapter 1\n${long}`);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(VIEWPORT.height);

    // CodeMirror's own scroller owns the overflow, which is what the preview
    // scroll sync binds to and what keeps long chapters virtualised.
    const scroller = await page.locator(".cm-scroller").evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    expect(scroller.scroll).toBeGreaterThan(scroller.client);
    expect(scroller.client).toBeGreaterThan(VIEWPORT.height * 0.8);
  });

  test("the preview follows the editor when it scrolls", async ({ page }) => {
    const long = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of the chapter`).join("\n");
    await page.locator(".cm-content").fill(`# Chapter 1\n${long}`);
    await page.waitForTimeout(400);

    const previewTop = await page.evaluate(async () => {
      const scroller = document.querySelector(".cm-scroller") as HTMLElement;
      const frame = document.querySelector(".preview-pane iframe") as HTMLIFrameElement;
      scroller.scrollTop = scroller.scrollHeight / 2;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return frame.contentDocument?.documentElement.scrollTop ?? 0;
    });
    expect(previewTop).toBeGreaterThan(0);
  });

  test("settings stay reachable on a short window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.locator('[data-activity="settings"]').click();
    await page.locator(SETTINGS).waitFor();

    const content = page.locator(SINGLE_PANE_CONTENT);
    const box = await content.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    expect(box.scroll).toBeGreaterThan(box.client);

    // The last control can be scrolled into view rather than being clipped away.
    const reachable = await content.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      const view = el.querySelector("[data-settings-view]") as HTMLElement;
      return view.getBoundingClientRect().bottom <= window.innerHeight + 1;
    });
    expect(reachable).toBe(true);
  });
});

test.describe("sidebar geometry", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/");
    await page.locator('[data-action="new-project"]').click();
    await page.locator(".cm-content").waitFor();
  });

  test("activity buttons sit centred in the activity bar", async ({ page }) => {
    // The interior, not the border box: the bar's right border is not part of it.
    const centre = await page
      .locator("[data-activity-bar]")
      .evaluate((el) => el.getBoundingClientRect().x + el.clientWidth / 2);
    for (const activity of ["explorer", "search", "settings"]) {
      const button = await page.locator(`[data-activity="${activity}"]`).boundingBox();
      expect(button!.x + button!.width / 2).toBeCloseTo(centre, 0);
    }
  });

  test("activity buttons are separate buttons, each rounded on every corner", async ({ page }) => {
    for (const activity of ["explorer", "search", "settings"]) {
      const corners = await page.locator(`[data-activity="${activity}"]`).evaluate((el) => {
        const style = getComputedStyle(el);
        return [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => parseFloat(value));
      });
      for (const corner of corners) expect(corner).toBeGreaterThan(0);
      expect(new Set(corners).size).toBe(1);
    }
  });

  test("explorer rows use the sidebar's width, padded only once", async ({ page }) => {
    const sidebar = await page.locator(SIDEBAR).boundingBox();
    const row = await page.getByRole("treeitem").first().boundingBox();
    expect(row!.x - sidebar!.x).toBeLessThanOrEqual(8);
    expect(sidebar!.x + sidebar!.width - (row!.x + row!.width)).toBeLessThanOrEqual(9);
  });
});
