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

  it("keeps one tab stop after the filter shrinks the list", async () => {
    mountGallery();
    screen.getAllByRole("gridcell")[2]!.focus();
    await userEvent.click(screen.getByRole("button", { name: /^unused$/i }));
    const stops = screen.getAllByRole("gridcell").filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("toggles with Mod+click and numbers the tiles in selection order", async () => {
    const { container } = mountGallery();
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("gridcell", { name: /spare\.png/ }));
    await user.click(screen.getByRole("gridcell", { name: /cover\.png/ }));
    await user.keyboard("{/Meta}");
    expect(container.querySelector("[data-selection-bar]")).not.toBeNull();
    expect(
      within(screen.getByRole("gridcell", { name: /spare\.png/ })).getByText("1"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("gridcell", { name: /cover\.png/ })).getByText("2"),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(container.querySelector("[data-selection-bar]")).toBeNull();
  });

  it("offers Set as cover only for a single selected image", async () => {
    const { container } = mountGallery();
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("gridcell", { name: /spare\.png/ }));
    await user.keyboard("{/Meta}");
    await user.click(container.querySelector<HTMLElement>("[data-selection-cover]")!);
    expect(useProjectStore().book!.metadata.cover).toBe("images/spare.png");

    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("gridcell", { name: /used\.png/ }));
    await user.keyboard("{/Meta}");
    expect(container.querySelector("[data-selection-cover]")).toBeNull();
  });

  it("drops selected images that leave the filtered list and hides the bar", async () => {
    const { container } = mountGallery();
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("gridcell", { name: /spare\.png/ }));
    await user.keyboard("{/Meta}");
    expect(container.querySelector("[data-selection-bar]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /^used$/i }));
    expect(container.querySelector("[data-selection-bar]")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^all$/i }));
    expect(container.querySelector("[data-selection-bar]")).toBeNull();
    expect(container.querySelector("[data-selection-order]")).toBeNull();
  });

  it("reserves the selection bar's space so selecting never reflows the grid", async () => {
    const { container } = mountGallery();
    const slot = container.querySelector("[data-selection-bar-slot]");
    expect(slot).not.toBeNull();
    expect(slot?.nextElementSibling?.getAttribute("role")).toBe("grid");
    expect(slot?.className).toMatch(/\bh-8\b/);
  });
});
