import { createPinia, setActivePinia } from "pinia";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { createBook } from "@/services/book/create";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";

function renderBreadcrumbs() {
  return render(Breadcrumbs, { global: { plugins: [createI18nPlugin("en")] } });
}

describe("Breadcrumbs", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it("lists the chapter trail as separate items", () => {
    const book = createBook({
      locale: "en",
      now: "2026-01-01T00:00:00.000Z",
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters[0]!.source = "# Opening\n\nText";
    useProjectStore().setBook(book);
    useLayoutStore().center = { kind: "chapter", id: "chapter1" };
    renderBreadcrumbs();

    const trail = screen.getByRole("navigation", { name: "Breadcrumbs" });
    const items = within(trail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Chapters", "1 Opening"]);
    expect(items[1]).toHaveAttribute("aria-current", "page");
    expect(trail).not.toHaveTextContent("›");
  });

  it("numbers an untitled chapter's fallback name", () => {
    const book = createBook({
      locale: "en",
      now: "2026-01-01T00:00:00.000Z",
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters[0]!.source = "no heading";
    useProjectStore().setBook(book);
    useLayoutStore().center = { kind: "chapter", id: "chapter1" };
    renderBreadcrumbs();

    const trail = screen.getByRole("navigation", { name: "Breadcrumbs" });
    expect(within(trail).getAllByRole("listitem")[1]).toHaveTextContent("1 Chapter 1");
  });

  it("shows a single item for views outside the chapter list", () => {
    useLayoutStore().center = { kind: "metadata" };
    renderBreadcrumbs();

    const trail = screen.getByRole("navigation", { name: "Breadcrumbs" });
    expect(
      within(trail)
        .getAllByRole("listitem")
        .map((item) => item.textContent?.trim()),
    ).toEqual(["Metadata"]);
  });

  it("calls the stylesheet Styles", () => {
    useLayoutStore().center = { kind: "css" };
    renderBreadcrumbs();

    const trail = screen.getByRole("navigation", { name: "Breadcrumbs" });
    expect(within(trail).getByRole("listitem")).toHaveTextContent("Styles");
  });
});
