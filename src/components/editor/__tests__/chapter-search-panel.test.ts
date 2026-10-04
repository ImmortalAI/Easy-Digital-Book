import { EditorState } from "@codemirror/state";
import { openSearchPanel, SearchQuery, searchKeymap, setSearchQuery } from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chapterSearch, searchPanelLabels } from "@/components/editor/chapter-search-panel";

const labels = () => searchPanelLabels((_key, fallback) => fallback);
let view: EditorView | undefined;
afterEach(() => view?.destroy());

function open(doc: string, anchor = 0, head = anchor) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [chapterSearch(labels), keymap.of(searchKeymap)],
    }),
    parent: document.body,
  });
  openSearchPanel(view);
  const panel = view.dom.querySelector<HTMLElement>(".cm-chapter-search")!;
  const field = panel.querySelector<HTMLInputElement>("input[main-field]")!;
  const type = (value: string) => {
    field.value = value;
    field.dispatchEvent(new Event("input"));
  };
  const counter = () => panel.querySelector("[data-search-counter]")!.textContent;
  const button = (name: string) =>
    panel.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  return { panel, field, type, counter, button };
}

describe("chapter search panel", () => {
  it("hands the counts to the translator, which fills its own placeholders", () => {
    // vue-i18n interpolates named parameters itself and blanks missing ones.
    const i18n = (_key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? ""));
    const translated = searchPanelLabels(i18n);
    expect(translated.counter({ total: 3, capped: false, current: null })).toBe("3 matches");
    expect(translated.counter({ total: 1000, capped: true, current: 2 })).toBe("2 of 1000+");
  });

  it("counts matches live instead of offering 'select all'", () => {
    const { panel, type, counter } = open("cat cat dog cat");
    type("cat");
    expect(counter()).toBe("3 matches");
    expect(panel.querySelector('button[name="select"]')).toBeNull();
  });

  it("shows the position of the selected match", () => {
    const { field, type, counter } = open("cat cat dog cat");
    type("cat");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(counter()).toBe("1 of 3");
  });

  it("says when nothing matches and when the regexp is broken", () => {
    const { type, counter, button } = open("cat");
    type("dog");
    expect(counter()).toBe("No results");
    button("Regular expression").click();
    type("(");
    expect(counter()).toBe("Invalid regular expression");
  });

  it("applies whole-word with the book search's word boundaries", () => {
    const { type, counter, button } = open("кот котик кот-кот");
    if (button("Whole word").getAttribute("aria-pressed") !== "true") button("Whole word").click();
    type("кот");
    expect(counter()).toBe("3 matches");
  });

  it("starts from the selected text", () => {
    const { field } = open("cat dog", 4, 7);
    expect(field.value).toBe("dog");
  });

  it("replaces all matches", () => {
    const { panel, type } = open("cat cat");
    type("cat");
    const replace = panel.querySelector<HTMLInputElement>('input[name="replace"]')!;
    replace.value = "dog";
    replace.dispatchEvent(new Event("input"));
    panel.querySelector<HTMLButtonElement>('button[name="replaceAll"]')!.click();
    expect(view!.state.doc.toString()).toBe("dog dog");
  });

  it("survives Mod+F while it is already open", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { type, counter } = open("cat cat dog cat");
    type("cat");
    // What openSearchPanel does when focus is in the text: a new query from the selection.
    view!.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "dog" })) });
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
    const panel = view!.dom.querySelector(".cm-chapter-search")!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector<HTMLInputElement>("input[main-field]")!.value).toBe("dog");
    expect(counter()).toBe("1 matches");
    error.mockRestore();
  });

  it("shows the typed text again when a chapter's editor comes back", async () => {
    const { type, button } = open("cat category");
    // Toggles carry over between opens, so set it rather than flip it.
    if (button("Whole word").getAttribute("aria-pressed") !== "true") button("Whole word").click();
    type("cat");
    const state = view!.state;
    view!.destroy();
    view = new EditorView({ state, parent: document.body });
    await Promise.resolve();
    const panel = view.dom.querySelector<HTMLElement>(".cm-chapter-search")!;
    expect(panel.querySelector<HTMLInputElement>("input[main-field]")!.value).toBe("cat");
    expect(panel.querySelector("[data-search-counter]")!.textContent).toBe("1 matches");
  });

  it("keeps the keys it handles away from the window shortcuts", () => {
    const { field } = open("cat cat");
    const windowKeys = vi.fn<(event: KeyboardEvent) => void>();
    window.addEventListener("keydown", windowKeys);
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", altKey: true, ctrlKey: true, bubbles: true }),
    );
    window.removeEventListener("keydown", windowKeys);
    expect(windowKeys).not.toHaveBeenCalled();
  });
});
