// src/components/images/__tests__/ImageGallery.test.ts
import { cleanup, render, screen, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageGallery from "@/components/images/ImageGallery.vue";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { createBook } from "@/services/book/create";

const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
]);
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  const book = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  useProjectStore().setBook({
    ...book,
    chapters: [{ id: "chapter1", source: "![](images/used.png)" }],
    metadata: { ...book.metadata, cover: "images/cover.png" },
    resources: new Map([
      ["images/used.png", { mediaType: "image/png", bytes: png }],
      ["images/cover.png", { mediaType: "image/png", bytes: png }],
      ["images/spare.png", { mediaType: "image/png", bytes: png }],
    ]),
  });
});
afterEach(cleanup);
const mountGallery = () =>
  render(ImageGallery, {
    props: {
      onImport: vi.fn<() => Promise<void>>(async () => {}),
      onDropFiles: vi.fn<(files: unknown[]) => Promise<void>>(async () => {}),
    },
    global: { plugins: [pinia] },
  });

describe("ImageGallery", () => {
  it("shows one tile per image with cover and unused marks", () => {
    mountGallery();
    const tiles = screen.getAllByRole("gridcell");
    expect(tiles).toHaveLength(3);
    expect(
      within(screen.getByRole("gridcell", { name: /cover\.png/ })).getByText(/^cover$/i),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("gridcell", { name: /spare\.png/ })).getByText(/not used/i),
    ).toBeTruthy();
  });

  it("filters unused images", async () => {
    mountGallery();
    await userEvent.click(screen.getByRole("button", { name: /^unused$/i }));
    expect(screen.getAllByRole("gridcell")).toHaveLength(1);
  });

  it("opens an image on click and on Enter", async () => {
    mountGallery();
    await userEvent.click(screen.getByRole("gridcell", { name: /used\.png/ }));
    expect(useLayoutStore().center).toEqual({ kind: "image", path: "images/used.png" });
    useLayoutStore().center = { kind: "images" };
    screen.getByRole("gridcell", { name: /spare\.png/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(useLayoutStore().center).toEqual({ kind: "image", path: "images/spare.png" });
  });

  it("moves focus with the arrow keys", async () => {
    mountGallery();
    screen.getAllByRole("gridcell")[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getAllByRole("gridcell")[1]);
  });
});
