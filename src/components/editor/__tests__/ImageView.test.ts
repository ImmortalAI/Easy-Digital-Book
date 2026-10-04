import { createPinia, setActivePinia } from "pinia";
import { cleanup, render, screen, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ImageView from "@/components/editor/ImageView.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { createBook } from "@/services/book/create";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";

function openBook(source: string) {
  const book = createBook({
    locale: "en",
    now: "2026-01-01T00:00:00.000Z",
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  book.chapters[0]!.source = source;
  book.resources.set("images/cover.png", {
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
  });
  useProjectStore().setBook(book);
}

function renderImage() {
  return render(ImageView, {
    props: { path: "images/cover.png" },
    global: { plugins: [createI18nPlugin("en")] },
  });
}

describe("ImageView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it("names the image and links to the chapters that use it", async () => {
    openBook("# Chapter 1\n\n![](images/cover.png)");
    renderImage();

    expect(screen.getByRole("img", { name: "images/cover.png" })).toBeVisible();
    expect(screen.getByText("3 bytes")).toBeVisible();
    const usedIn = screen.getByRole("list", { name: /used in/i });
    await userEvent.click(within(usedIn).getByRole("button", { name: /chapter 1/i }));
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("says so when no chapter uses the image", () => {
    openBook("# Chapter 1");
    renderImage();

    expect(screen.getByText("not used")).toBeVisible();
    expect(screen.queryByRole("list", { name: /used in/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /chapter/i })).toBeNull();
  });

  it("caps a tall image to the window height", () => {
    openBook("# Chapter 1");
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(bytes.buffer).setUint32(16, 1000);
    new DataView(bytes.buffer).setUint32(20, 3000);
    useProjectStore().book!.resources.set("images/cover.png", { bytes, mediaType: "image/png" });
    const { container } = renderImage();

    const box = container.querySelector("[data-image-frame]")!;
    expect(box.getAttribute("style")).toContain("max-width: calc(70vh * 0.3333");
  });

  it("makes the image the cover", async () => {
    openBook("# Chapter 1");
    renderImage();
    await userEvent.click(screen.getByRole("button", { name: "Make cover" }));
    expect(useProjectStore().book!.metadata.cover).toBe("images/cover.png");
    expect(screen.getByRole("button", { name: "Make cover" })).toBeDisabled();
  });

  it("renames the image and keeps showing it", async () => {
    openBook("# Chapter 1\n\n![](images/cover.png)");
    useLayoutStore().center = { kind: "image", path: "images/cover.png" };
    renderImage();
    await userEvent.click(screen.getByRole("button", { name: "Rename…" }));
    const field = await screen.findByRole("textbox", { name: /new name/i });
    await userEvent.clear(field);
    await userEvent.type(field, "front{Enter}");
    expect(useProjectStore().book!.resources.has("images/front.png")).toBe(true);
    expect(useLayoutStore().center).toEqual({ kind: "image", path: "images/front.png" });
  });
});
