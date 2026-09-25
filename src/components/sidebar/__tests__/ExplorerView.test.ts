import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useLayoutStore } from "@/stores/layout";
import ExplorerView from "@/components/sidebar/ExplorerView.vue";
import { createI18nPlugin } from "@/plugins/i18n";

function twoChapterBook() {
  const book = createBook({
    locale: "en",
    now: new Date(),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  book.chapters.push({ id: "chapter2", source: "# Chapter 2" });
  return book;
}

describe("ExplorerView boundaries", () => {
  beforeEach(() => setActivePinia(createPinia()));
  // ContextMenuContent teleports to document.body and some of these tests
  // render more than once; without cleanup the next render's query could
  // match a leftover menu from a previous test.
  afterEach(() => cleanup());

  it("folds a section row from the keyboard as well as by click", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProjectStore().setBook(twoChapterBook());
    render(ExplorerView, { global: { plugins: [pinia] } });
    const user = userEvent.setup();
    const chapters = screen.getByRole("treeitem", { name: /^chapters/i });
    expect(chapters).toHaveAttribute("aria-expanded", "true");

    chapters.focus();
    await user.keyboard("{Enter}");
    expect(chapters).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(chapters).toHaveAttribute("aria-expanded", "true");

    // A click toggles once, not twice.
    await user.click(chapters);
    expect(chapters).toHaveAttribute("aria-expanded", "false");
  });

  it("names an untitled chapter with the localised fallback and its number", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = twoChapterBook();
    book.chapters[1]!.source = "no heading";
    useProjectStore().setBook(book);
    render(ExplorerView, { global: { plugins: [pinia, createI18nPlugin("ru")] } });

    expect(screen.getByRole("treeitem", { name: /^2\. Глава 2/ })).toBeTruthy();
  });

  it.each([
    ["en", null, "Styles (create)"],
    ["en", "p { margin: 0 }", "Styles"],
    ["ru", "p { margin: 0 }", "Стили"],
  ] as const)("names the stylesheet row in %s (customCss %s) as %s", (locale, css, name) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = twoChapterBook();
    book.customCss = css;
    useProjectStore().setBook(book);
    render(ExplorerView, { global: { plugins: [pinia, createI18nPlugin(locale)] } });

    expect(screen.getByRole("treeitem", { name })).toBeTruthy();
    expect(screen.queryByText(/custom\.css/)).toBeNull();
  });

  it("does not dirty the project when moving the first/last chapter out of bounds", async () => {
    const project = useProjectStore();
    const book = createBook({
      locale: "en",
      now: new Date(),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters.push({ id: "chapter2", source: "# Two" });
    project.setBook(book);
    const wrapper = mount(ExplorerView);
    const rows = wrapper.findAll('[role="treeitem"]').filter((row) => /^\d+\. /.test(row.text()));
    expect(rows).toHaveLength(2);
    await rows[0]!.trigger("keydown", { key: "ArrowUp", altKey: true });
    await rows[1]!.trigger("keydown", { key: "ArrowDown", altKey: true });
    expect(project.revision).toBe(0);
    expect(project.dirty).toBe(false);
  });

  it("opens the image actions menu from a right click without changing the cover", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    const book = createBook({
      locale: "en",
      now: new Date(),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    project.setBook(book);

    render(ExplorerView, { global: { plugins: [pinia] } });
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByText("a.png") });

    expect(await screen.findByRole("menuitem", { name: /make cover/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /find usages/i })).toBeVisible();
    expect(project.book?.metadata.cover).toBeNull();
  });

  it("forwards image contextmenu with its path alongside opening the menu", async () => {
    const project = useProjectStore();
    const book = createBook({
      locale: "en",
      now: new Date(),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    project.setBook(book);
    const wrapper = mount(ExplorerView);

    const image = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes("a.png"));
    await image!.trigger("contextmenu");

    expect(wrapper.emitted("image-context-menu")?.[0]?.[0]).toBe("images/a.png");
    expect(await screen.findByRole("menuitem", { name: /make cover/i })).toBeVisible();
    expect(project.book?.metadata.cover).toBeNull();
    wrapper.unmount();
  });

  it("offers the chapter actions from a right click", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.setBook(
      createBook({
        locale: "en",
        now: new Date(),
        newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
        newChapterId: () => "chapter1",
      }),
    );

    render(ExplorerView, { global: { plugins: [pinia] } });
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByText("Chapter 1") });
    expect(await screen.findByRole("menuitem", { name: /new chapter after/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeVisible();
  });

  it("passes chapter warning counts to chapter rows", () => {
    const project = useProjectStore();
    project.setBook(
      createBook({
        locale: "en",
        now: new Date(),
        newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
        newChapterId: () => "chapter1",
      }),
    );
    useDiagnosticsStore().setChapterDiagnostics("chapter1", [
      { severity: "warning", message: "Warning" },
      { severity: "warning", message: "Another warning" },
    ]);

    const wrapper = mount(ExplorerView);

    expect(wrapper.findComponent({ name: "ChapterItem" }).props("warningCount")).toBe(2);
  });
  it("moves the roving focus across sections with the arrow keys", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProjectStore().setBook(twoChapterBook());
    render(ExplorerView, { global: { plugins: [pinia] } });
    expect(screen.getByRole("tree", { name: /explorer/i })).toBeVisible();
    const book = screen.getByRole("treeitem", { name: /book/i });
    book.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAccessibleName(/metadata/i);
  });

  it("still reorders chapters with Alt and the arrow keys", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.setBook(twoChapterBook());
    render(ExplorerView, { global: { plugins: [pinia] } });
    screen.getByRole("treeitem", { name: /1\. Chapter 1/ }).focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(project.book!.chapters[1]!.id).toBe("chapter1");
  });

  it("collapses and expands a section from its tree row", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProjectStore().setBook(twoChapterBook());
    render(ExplorerView, { global: { plugins: [pinia] } });
    const chapters = screen.getByRole("treeitem", { name: /^chapters$/i });
    expect(chapters).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(chapters);
    expect(chapters).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: /Chapter 1/ })).toBeNull();

    chapters.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(chapters).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: /1\. Chapter 1/ })).toBeVisible();
  });

  it("selects the row the center pane shows and opens rows on click", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useProjectStore().setBook(twoChapterBook());
    const layout = useLayoutStore();
    render(ExplorerView, { global: { plugins: [pinia] } });

    await userEvent.click(screen.getByRole("treeitem", { name: /2\. Chapter 2/ }));
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
    expect(screen.getByRole("treeitem", { name: /2\. Chapter 2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(screen.getByRole("treeitem", { name: /metadata/i }));
    expect(layout.center).toEqual({ kind: "metadata" });
    expect(screen.getByRole("treeitem", { name: /metadata/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: /2\. Chapter 2/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    // A section row only toggles; it never takes the selection.
    await userEvent.click(screen.getByRole("treeitem", { name: /^book$/i }));
    expect(layout.center).toEqual({ kind: "metadata" });
    expect(screen.getByRole("treeitem", { name: /^book$/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("opens the neighbouring chapter with plain arrows and focuses its row", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const project = useProjectStore();
    project.setBook(twoChapterBook());
    const layout = useLayoutStore();
    render(ExplorerView, { global: { plugins: [pinia] } });

    screen.getByRole("treeitem", { name: /1\. Chapter 1/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
    expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: /2\. Chapter 2/ }));
    expect(project.book!.chapters.map((chapter) => chapter.id)).toEqual(["chapter1", "chapter2"]);

    // At the boundary nothing opens, as before; roving focus moves on as usual.
    await userEvent.keyboard("{ArrowDown}");
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
    expect(document.activeElement).toHaveAccessibleName(/^images$/i);

    screen.getByRole("treeitem", { name: /2\. Chapter 2/ }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter1" });
    expect(document.activeElement).toBe(screen.getByRole("treeitem", { name: /1\. Chapter 1/ }));
  });
});
