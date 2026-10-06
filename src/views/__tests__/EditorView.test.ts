import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { within } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, watch } from "vue";
import { chapterParseResults, resetChapterParseResults } from "@/composables/use-novlang-parse";
import { useLayoutStore } from "@/stores/layout";
import { createBook } from "@/services/book/create";
import { createInMemoryPlatformServices } from "@/services/platform";
import { writeEdb } from "@/services/edb/write";
import { useProjectStore } from "@/stores/project";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import EditorView from "@/views/EditorView.vue";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { projectFilesKey, createProjectFiles } from "@/composables/use-project-files";

// A 1x1 PNG, recognised by its signature.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

function bookWithTwoChapters() {
  const book = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  book.chapters.push({ id: "chapter2", source: "# Second chapter" });
  return book;
}

const parsedHeading = (value: string) => ({
  document: {
    type: "document" as const,
    children: [{ type: "heading" as const, children: [{ type: "text" as const, value }] }],
  },
  diagnostics: [],
});

describe("EditorView Task 13 integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetChapterParseResults();
    useProjectStore().setBook(bookWithTwoChapters());
  });

  it("retains the same iframe and source editor across mode changes", async () => {
    const layout = useLayoutStore();
    layout.center = { kind: "chapter", id: "chapter2" };
    chapterParseResults.set("chapter2", parsedHeading("Second chapter"));
    const wrapper = mount(EditorView);
    const iframe = wrapper.get("iframe").element;
    const editor = wrapper.get(".cm-editor").element;

    layout.mode = "text";
    await wrapper.vm.$nextTick();
    layout.mode = "preview";
    await wrapper.vm.$nextTick();

    expect(wrapper.get("iframe").element).toBe(iframe);
    expect(wrapper.get(".cm-editor").element).toBe(editor);
    wrapper.unmount();
  });

  it("renders the initial chapter in preview without waiting for an edit", () => {
    const layout = useLayoutStore();
    layout.center = { kind: "chapter", id: "chapter1" };
    const wrapper = mount(EditorView);

    expect(wrapper.get("iframe").attributes("srcdoc")).toContain("<h1>Chapter 1</h1>");
    expect(chapterParseResults.has("chapter2")).toBe(true);
    wrapper.unmount();
  });

  it("parses and selects the first chapter when opening over a non-chapter center view", async () => {
    const services = createInMemoryPlatformServices();
    const files = createProjectFiles({ services, locale: "en" });
    const openedBook = bookWithTwoChapters();
    openedBook.chapters[0]!.source = "# Opened first chapter\n*unclosed";
    const bytes = await writeEdb(openedBook, new Date("2026-01-02"));
    await services.files.writeFile("opened.edb", bytes);

    const layout = useLayoutStore();
    layout.center = { kind: "metadata" };
    const wrapper = mount(EditorView, {
      global: { provide: { [projectFilesKey]: files } },
    });

    await expect(files.openPath("opened.edb")).resolves.toBe(true);
    await nextTick();
    await nextTick();

    expect(layout.center).toEqual({ kind: "chapter", id: "chapter1" });
    expect(chapterParseResults.has("chapter1")).toBe(true);
    expect(chapterParseResults.has("chapter2")).toBe(true);
    expect(useDiagnosticsStore().parse.has("chapter1")).toBe(true);
    expect(useDiagnosticsStore().parse.has("chapter2")).toBe(true);
    expect(wrapper.find(".cm-editor").exists()).toBe(true);
    expect(wrapper.get("iframe").attributes("srcdoc")).toContain("Opened first chapter");
    wrapper.unmount();
  });

  it("keeps a visible activity bar and applies explorer/search toggle semantics", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(EditorView);
    expect(wrapper.get("[data-activity-bar]").attributes("data-width")).toBe("48");

    await wrapper.get('[data-activity="explorer"]').trigger("click");
    expect(layout.sidebarVisible).toBe(false);
    await wrapper.get('[data-activity="explorer"]').trigger("click");
    expect(layout.sidebarVisible).toBe(true);
    await wrapper.get('[data-activity="search"]').trigger("click");
    expect(layout.activeView).toBe("search");
    expect(layout.sidebarVisible).toBe(true);
    await wrapper.get('[data-activity="search"]').trigger("click");
    expect(layout.sidebarVisible).toBe(false);
    wrapper.unmount();
  });

  it("highlights only the sidebar view that is showing", async () => {
    const layout = useLayoutStore();
    layout.activeView = "explorer";
    layout.setSidebarVisible(true);
    const wrapper = mount(EditorView);
    const pressed = () =>
      wrapper
        .findAll("[data-activity]")
        .filter((tile) => tile.attributes("aria-pressed") === "true")
        .map((tile) => tile.attributes("data-activity"));
    expect(pressed()).toEqual(["explorer"]);

    await wrapper.get('[data-activity="explorer"]').trigger("click");

    expect(layout.sidebarVisible).toBe(false);
    expect(pressed()).toEqual([]);
    wrapper.unmount();
  });

  it.each(["explorer", "search"] as const)(
    "leaves settings for the page open before it when %s is chosen",
    async (view) => {
      const layout = useLayoutStore();
      layout.center = { kind: "chapter", id: "chapter2" };
      const wrapper = mount(EditorView);
      const pressed = () =>
        wrapper
          .findAll("[data-activity]")
          .filter((tile) => tile.attributes("aria-pressed") === "true")
          .map((tile) => tile.attributes("data-activity"));

      await wrapper.get('[data-activity="settings"]').trigger("click");
      expect(pressed()).toEqual(["settings"]);
      await wrapper.get(`[data-activity="${view}"]`).trigger("click");

      expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
      expect(layout.activeView).toBe(view);
      expect(layout.sidebarVisible).toBe(true);
      expect(pressed()).toEqual([view]);
      wrapper.unmount();
    },
  );

  it("returns from settings to metadata when metadata was open", async () => {
    const layout = useLayoutStore();
    layout.center = { kind: "metadata" };
    const wrapper = mount(EditorView);

    await wrapper.get('[data-activity="settings"]').trigger("click");
    await wrapper.get('[data-activity="explorer"]').trigger("click");

    expect(layout.center).toEqual({ kind: "metadata" });
    wrapper.unmount();
  });

  it("opens settings as a single-pane activity and persists the global sidebar toggle", async () => {
    const layout = useLayoutStore();
    const services = createInMemoryPlatformServices();
    layout.configure(services.settings);
    const wrapper = mount(EditorView);

    await wrapper.get('[data-activity="settings"]').trigger("click");
    expect(layout.center).toEqual({ kind: "settings" });
    expect(layout.sidebarVisible).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", ctrlKey: true }));
    await nextTick();
    expect(layout.sidebarVisible).toBe(true);
    expect(await services.settings.get("layout", {})).toMatchObject({ sidebarVisible: true });
    wrapper.unmount();
  });

  it("uses one central pane for metadata/image/settings and keeps the last CSS preview chapter", async () => {
    const layout = useLayoutStore();
    layout.center = { kind: "chapter", id: "chapter2" };
    const wrapper = mount(EditorView);
    chapterParseResults.set("chapter2", parsedHeading("Second chapter"));
    wrapper.get("iframe").element.dispatchEvent(new Event("load"));
    await nextTick();
    await nextTick();
    expect(wrapper.findComponent({ name: "PreviewPane" }).props("chapterId")).toBe("chapter2");

    layout.center = { kind: "css" };
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".preview-pane").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "PreviewPane" }).props("chapterId")).toBe("chapter2");

    for (const center of [
      { kind: "metadata" },
      { kind: "image", path: "images/a.png" },
      { kind: "settings" },
    ] as const) {
      layout.center = center;
      await wrapper.vm.$nextTick();
      expect(wrapper.find("[data-single-pane]").exists()).toBe(true);
      expect(wrapper.find(".preview-pane").exists()).toBe(false);
    }
    wrapper.unmount();
  });

  it("navigates to a selected warning chapter and position", async () => {
    const layout = useLayoutStore();
    const project = useProjectStore();
    project.book!.chapters[1]!.source = "# Second chapter\n*unclosed";
    layout.center = { kind: "chapter", id: "chapter1" };
    const wrapper = mount(EditorView);
    const warnings = wrapper.findComponent({ name: "WarningsPopover" });

    await warnings.vm.$emit("select", {
      chapterId: "chapter2",
      position: { line: 2, column: 1 },
    });
    await wrapper.vm.$nextTick();
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
    const editor = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(editor.state.selection.main.from).toBeGreaterThan(0);
    expect(editor.state.selection.main.to).toBeGreaterThan(editor.state.selection.main.from);
    wrapper.unmount();
  });

  it("marks unsaved changes with a labelled indicator", () => {
    useProjectStore().setBook(bookWithTwoChapters(), null, { dirty: true });
    const wrapper = mount(EditorView);

    expect(
      within(wrapper.element as HTMLElement).getByRole("img", { name: "Unsaved changes" }),
    ).toBeTruthy();
    wrapper.unmount();
  });

  it("shows a visible banner when opening reported problems", () => {
    useDiagnosticsStore().setReadWarnings([
      { code: "edb.missingChapter", message: "A chapter is missing" },
      { code: "edb.invalidMetadata", message: "Metadata is invalid" },
    ]);

    const wrapper = mount(EditorView);

    const banner = within(wrapper.element as HTMLElement)
      .getAllByRole("status")
      .find((element) => element.textContent?.includes("problems found when opening"));
    expect(banner).toHaveTextContent("2 problems found when opening");
    wrapper.unmount();
  });

  it("opens export from the global Mod+E shortcut", async () => {
    const services = createInMemoryPlatformServices();
    const files = createProjectFiles({ services });
    const wrapper = mount(EditorView, {
      global: { provide: { [projectFilesKey]: files } },
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
    await nextTick();

    // ExportDialog now teleports its content to document.body (Dialog's
    // portal), so it is no longer reachable through the mounted wrapper's tree.
    const dialog = within(document.body).getByRole("dialog", { name: "Export EPUB" });
    expect(within(dialog).getByRole("button", { name: /export/i })).toBeInTheDocument();
    wrapper.unmount();
  });

  it("inserts an image from file into its own chapter after a chapter switch", async () => {
    const layout = useLayoutStore();
    const project = useProjectStore();
    layout.center = { kind: "chapter", id: "chapter1" };
    let resolvePick!: (file: { name: string; bytes: Uint8Array }) => void;
    const pickImage = () =>
      new Promise<{ name: string; bytes: Uint8Array }>((resolve) => (resolvePick = resolve));
    const wrapper = mount(EditorView, {
      global: { provide: { [projectFilesKey]: { pickImage } } },
    });

    const header = wrapper.findComponent({ name: "ContentHeader" });
    await header.vm.$emit("insert-image-from-file", 11);
    layout.center = { kind: "chapter", id: "chapter2" };
    await nextTick();
    await nextTick();
    resolvePick({ name: "pic.png", bytes: PNG });

    await vi.waitFor(() =>
      expect(project.book!.chapters[0]!.source).toContain("![](images/pic.png)"),
    );
    await nextTick();
    await nextTick();
    expect(project.book!.chapters[1]!.source).toBe("# Second chapter");
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter1" });
    const editor = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(editor.state.doc.toString()).toBe(project.book!.chapters[0]!.source);
    wrapper.unmount();
  });

  it("never writes an import into the chapter on screen when it is another one", async () => {
    const layout = useLayoutStore();
    const project = useProjectStore();
    layout.center = { kind: "chapter", id: "chapter1" };
    let resolvePick!: (file: { name: string; bytes: Uint8Array }) => void;
    const pickImage = () =>
      new Promise<{ name: string; bytes: Uint8Array }>((resolve) => (resolvePick = resolve));
    const wrapper = mount(EditorView, {
      global: { provide: { [projectFilesKey]: { pickImage } } },
    });
    await wrapper.findComponent({ name: "ContentHeader" }).vm.$emit("insert-image-from-file", 11);
    layout.center = { kind: "chapter", id: "chapter2" };
    await nextTick();
    await nextTick();
    // The import navigates back to its chapter; something else immediately
    // takes the screen back to chapter 2, so chapter 2 is the mounted editor
    // when the import finishes.
    let redirected = false;
    const stop = watch(
      () => layout.center,
      (center) => {
        if (redirected || center.kind !== "chapter" || center.id !== "chapter1") return;
        redirected = true;
        layout.center = { kind: "chapter", id: "chapter2" };
      },
      { flush: "sync" },
    );
    resolvePick({ name: "pic.png", bytes: PNG });

    await vi.waitFor(() => expect(redirected).toBe(true));
    await nextTick();
    await nextTick();
    stop();
    expect(project.book!.chapters[1]!.source).toBe("# Second chapter");
    const editor = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(editor.state.doc.toString()).toBe("# Second chapter");
    // Chapter 1's own editor state carries the image for when it is reopened.
    layout.center = { kind: "chapter", id: "chapter1" };
    await nextTick();
    await nextTick();
    const reopened = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(reopened.state.doc.toString()).toContain("![](images/pic.png)");
    wrapper.unmount();
  });

  it("keeps the gallery mounted while it imports dropped files", async () => {
    const layout = useLayoutStore();
    const project = useProjectStore();
    layout.center = { kind: "images" };
    const wrapper = mount(EditorView);
    const gallery = wrapper.get("[data-image-gallery]").element;
    const centers: string[] = [];
    const stop = watch(
      () => layout.center,
      (center) => centers.push(center.kind),
      { flush: "sync" },
    );

    await wrapper.findComponent({ name: "ImageGallery" }).props("onDropFiles")([
      { name: "a.png", bytes: PNG },
      { name: "b.png", bytes: Uint8Array.from([...PNG, 0]) },
    ]);
    await nextTick();
    stop();

    expect(project.book!.resources.size).toBe(2);
    expect(centers).toEqual([]);
    expect(wrapper.get("[data-image-gallery]").element).toBe(gallery);
    wrapper.unmount();
  });
});

it("opens CSS at a warning range from preview mode", async () => {
  setActivePinia(createPinia());
  const book = bookWithTwoChapters();
  book.customCss = "p { mystery: x; }";
  useProjectStore().setBook(book);
  const layout = useLayoutStore();
  layout.center = { kind: "chapter", id: "chapter1" };
  layout.mode = "preview";
  const wrapper = mount(EditorView, { attachTo: document.body });
  wrapper
    .findComponent({ name: "WarningsPopover" })
    .vm.$emit("select", { kind: "css", from: 4, to: 11 });
  await nextTick();
  await nextTick();
  expect(layout.center).toEqual({ kind: "css" });
  expect(layout.mode).toBe("split");
  const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
  expect(view.state.selection.main.from).toBe(4);
  expect(view.state.selection.main.to).toBe(11);
  expect(view.hasFocus).toBe(true);
  wrapper.unmount();
});

it("opens the chapter and selects the word when a spelling issue is picked", async () => {
  const book = bookWithTwoChapters();
  book.chapters[1]!.source = "# Second chapter\nпревет";
  useProjectStore().setBook(book);
  const layout = useLayoutStore();
  layout.center = { kind: "chapter", id: "chapter1" };
  const wrapper = mount(EditorView, { attachTo: document.body });
  wrapper
    .findComponent({ name: "SpellingPopover" })
    .vm.$emit("select", { chapterId: "chapter2", from: 17, to: 23 });
  await nextTick();
  await nextTick();
  expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
  const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
  expect(view.state.selection.main.from).toBe(17);
  expect(view.state.selection.main.to).toBe(23);
  wrapper.unmount();
});
