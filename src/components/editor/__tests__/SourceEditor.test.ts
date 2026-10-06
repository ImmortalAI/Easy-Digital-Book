import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { addChapter } from "@/services/book/chapters";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import SourceEditor from "@/components/editor/SourceEditor.vue";
import type { ImageFile, ImageImportIdentity } from "@/composables/use-image-import";
import {
  chapterEditorStates,
  chapterEditorViews,
  resetChapterEditors,
} from "@/components/editor/editor-commands";
import { chapterParseResults, resetChapterParseResults } from "@/composables/use-novlang-parse";
import { EditorView } from "@codemirror/view";
import { createI18nPlugin } from "@/plugins/i18n";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";
import { nextTick } from "vue";
import { screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { undo } from "@codemirror/commands";
import { createInMemoryPlatformServices, setRuntimePlatformServices } from "@/services/platform";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

function deferredImageFile(name: string) {
  let resolve!: (bytes: ArrayBuffer) => void;
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => new Promise<ArrayBuffer>((done) => (resolve = done)),
  });
  return { file, resolve: () => resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer) };
}

function dispatchImageEvent(target: Element, type: "paste" | "drop", file: File) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
    value: { files: [file] },
  });
  target.dispatchEvent(event);
}

function makeBook() {
  const initial = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  return addChapter(initial, { newId: () => "chapter2" }).book;
}

describe("SourceEditor lifecycle", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetChapterEditors();
    resetChapterParseResults();
    setRuntimePlatformServices(createInMemoryPlatformServices({ spellWords: ["привет", "мир"] }));
    useProjectStore().setBook(makeBook());
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("rebinds parser callbacks when a cached chapter editor is remounted", async () => {
    const first = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    first.unmount();
    const second = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const view = EditorView.findFromDOM(second.find(".cm-editor").element as HTMLElement);
    view?.dispatch({ changes: { from: view.state.doc.length, insert: "\n*bad" } });

    vi.advanceTimersByTime(150);
    await second.vm.$nextTick();
    await second.vm.$nextTick();

    expect(second.find(".cm-lintRange-warning").exists()).toBe(true);
    second.unmount();
  });

  it("unregisters the previous chapter's view when switching chapters", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const first = chapterEditorViews.get("chapter1");
    expect(first).toBeDefined();

    await wrapper.setProps({ chapterId: "chapter2" });

    // chapter1's view is destroyed on switch; leaving it registered keeps its
    // DOM alive and routes later edits for that chapter into a dead view.
    expect(chapterEditorViews.get("chapter1")).toBeUndefined();
    expect(chapterEditorViews.get("chapter2")).toBeDefined();
    expect(chapterEditorViews.get("chapter2")).not.toBe(first);

    wrapper.unmount();
    expect(chapterEditorViews.size).toBe(0);
  });

  it("switches chapters without cross-writing and retains each chapter undo state", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    let view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "chapter one edited" },
    });

    await wrapper.setProps({ chapterId: "chapter2" });
    view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    expect(view.state.doc.toString()).toBe("# Chapter 2");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "chapter two edited" },
    });

    await wrapper.setProps({ chapterId: "chapter1" });
    view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    expect(view.state.doc.toString()).toBe("chapter one edited");
    expect(useProjectStore().book?.chapters.map((chapter) => chapter.source)).toEqual([
      "chapter one edited",
      "chapter two edited",
    ]);
    expect(chapterEditorStates.get("chapter1")?.doc.toString()).toBe("chapter one edited");
    wrapper.unmount();
  });

  async function mountMisspelled() {
    const project = useProjectStore();
    project.book!.chapters[0]!.source = "мир превет";
    const wrapper = mount(SourceEditor, {
      props: { chapterId: "chapter1" },
      attachTo: document.body,
    });
    useSpellingStore().setChapter("chapter1", "мир превет", [
      { word: "превет", lang: "ru", from: 4, to: 10 },
    ]);
    await nextTick();
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    return { wrapper, view, project };
  }

  it("opens the menu on a misspelling with Mod+. and replaces in one undoable step", async () => {
    vi.useRealTimers();
    const { wrapper, view, project } = await mountMisspelled();
    view.dispatch({ selection: { anchor: 6 } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: ".", ctrlKey: true, bubbles: true }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "привет" }));
    expect(view.state.doc.toString()).toBe("мир привет");
    expect(project.book!.chapters[0]!.source).toBe("мир привет");
    undo(view);
    expect(view.state.doc.toString()).toBe("мир превет");
    wrapper.unmount();
  });

  it("adds a word to the book dictionary from the menu", async () => {
    vi.useRealTimers();
    const { wrapper, project } = await mountMisspelled();
    const target = wrapper.find(".cm-misspelled").element as HTMLElement;
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 1, clientY: 1 }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Add to book dictionary" }));
    expect(project.book!.dictionary).toEqual(["превет"]);
    wrapper.unmount();
  });

  it("keeps the default context menu outside misspelled words", async () => {
    vi.useRealTimers();
    const { wrapper, view } = await mountMisspelled();
    // happy-dom has no layout, so pin the clicked position to the word "мир".
    vi.spyOn(view, "posAtCoords").mockReturnValue(1);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    view.contentDOM.querySelector(".cm-line")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("does not open the spelling menu for a right-click outside the underline", async () => {
    vi.useRealTimers();
    const { wrapper, view } = await mountMisspelled();
    // Pin the hit-test position to the misspelled word while the target is a plain line.
    vi.spyOn(view, "posAtCoords").mockReturnValue(6);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    view.contentDOM.querySelector(".cm-line")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menuitem")).toBeNull();
    wrapper.unmount();
  });

  it("turns off WebView spellcheck and shows store misspellings for the current text only", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const source = useProjectStore().book!.chapters[0]!.source;
    expect(wrapper.find(".cm-content").attributes("spellcheck")).toBe("false");
    const spelling = useSpellingStore();
    spelling.setChapter("chapter1", "old text", [{ word: "old", lang: "en", from: 0, to: 3 }]);
    await nextTick();
    expect(wrapper.find(".cm-misspelled").exists()).toBe(false);
    spelling.setChapter("chapter1", source, [{ word: "Chapter", lang: "en", from: 2, to: 9 }]);
    await nextTick();
    expect(wrapper.find(".cm-misspelled").text()).toBe("Chapter");
    wrapper.unmount();
  });

  it("reconfigures the content language when book metadata changes", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const project = useProjectStore();
    project.book!.metadata.language = "ru";
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".cm-content").attributes("lang")).toBe("ru");
    wrapper.unmount();
  });

  it("names its text box in the interface language and follows a live locale switch", async () => {
    const i18n = createI18nPlugin("ru");
    const wrapper = mount(SourceEditor, {
      props: { chapterId: "chapter1" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find(".cm-content").attributes("aria-label")).toBe("Текст главы");

    i18n.global.locale.value = "zh-CN";
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".cm-content").attributes("aria-label")).toBe("章节文本");
    wrapper.unmount();
  });

  it("switches CodeMirror to its dark palette with the app theme", async () => {
    const settings = useSettingsStore();
    settings.theme = "light";
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    expect(view.state.facet(EditorView.darkTheme)).toBe(false);

    settings.theme = "dark";
    await wrapper.vm.$nextTick();
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);
    wrapper.unmount();
  });

  it("rebinds the mounted editor when the project generation changes", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const project = useProjectStore();
    const replacement = makeBook();
    replacement.chapters[0] = { id: "chapter1", source: "replacement source" };
    project.setBook(replacement);

    await wrapper.vm.$nextTick();

    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    expect(view.state.doc.toString()).toBe("replacement source");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "replacement edit" },
    });

    expect(project.book?.chapters[0]?.source).toBe("replacement edit");
    wrapper.unmount();
  });

  it("cancels a pending parse when switching chapters", async () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\n*bad" } });

    await wrapper.setProps({ chapterId: "chapter2" });
    vi.advanceTimersByTime(150);

    expect(chapterParseResults.get("chapter1")?.diagnostics).toHaveLength(0);
    wrapper.unmount();
  });

  it("cancels a pending parse when unmounted", () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\n*bad" } });

    wrapper.unmount();
    vi.advanceTimersByTime(150);

    expect(chapterParseResults.get("chapter1")?.diagnostics).toHaveLength(0);
  });

  it("renders subdued NovLang token styling for stream-language tokens", () => {
    const project = useProjectStore();
    project.book!.chapters[0] = { id: "chapter1", source: "> quoted text" };
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });

    expect(wrapper.find(".cm-line span").exists()).toBe(true);
    wrapper.unmount();
  });

  it("focuses and selects a requested diagnostic position", async () => {
    const project = useProjectStore();
    project.book!.chapters[0] = { id: "chapter1", source: "# Chapter 1\n*unclosed" };
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    await wrapper.setProps({
      focusPosition: { line: 2, column: 1 },
      focusRequest: 1,
    } as never);

    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    expect(view.state.selection.main.from).toBeGreaterThan(0);
    expect(view.state.selection.main.to).toBeGreaterThan(view.state.selection.main.from);
    wrapper.unmount();
  });

  it("discards a pasted image when its byte read outlives the project", async () => {
    const importImage = vi.fn<
      (file: ImageFile, position: number, identity: ImageImportIdentity) => Promise<void>
    >(async () => undefined);
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1", importImage } });
    const deferred = deferredImageFile("pasted.png");

    dispatchImageEvent(wrapper.get(".cm-content").element, "paste", deferred.file);
    useProjectStore().setBook(makeBook());
    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(importImage).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("leaves the document untouched on Ctrl+O, reserving it for the app's open shortcut", () => {
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1" } });
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element as HTMLElement)!;
    const before = view.state.doc.toString();

    // @codemirror/commands' defaultKeymap binds Ctrl-o to splitLine (an
    // Emacs-style binding CodeMirror only activates on macOS); the app
    // reserves Ctrl/Cmd+O for its own "open a book" shortcut (use-shortcuts.ts)
    // and must not have the document mutated (and thus marked dirty) before
    // that shortcut runs. preserveOpenShortcutKeymap intercepts the key ahead
    // of defaultKeymap on every platform, so `handled` (false means the
    // keydown's default was prevented, i.e. something claimed it) pins that
    // interception directly, regardless of this test environment's platform.
    const handled = wrapper
      .get(".cm-content")
      .element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true, cancelable: true }),
      );

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(before);
    wrapper.unmount();
  });

  it("discards a dropped image when its byte read outlives the project", async () => {
    const importImage = vi.fn<
      (file: ImageFile, position: number, identity: ImageImportIdentity) => Promise<void>
    >(async () => undefined);
    const wrapper = mount(SourceEditor, { props: { chapterId: "chapter1", importImage } });
    const deferred = deferredImageFile("dropped.png");
    const editor = EditorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    vi.spyOn(editor, "posAtCoords").mockReturnValue(0);

    dispatchImageEvent(wrapper.get(".cm-content").element, "drop", deferred.file);
    useProjectStore().setBook(makeBook());
    deferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(importImage).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
