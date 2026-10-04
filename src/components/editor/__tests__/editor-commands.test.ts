import { undoDepth } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  activeMarkup,
  chapterEditorStates,
  createChapterEditor,
  insertFootnote,
  insertImageReference,
  insertSceneBreak,
  registerChapterEditorView,
  replaceChapterEditorText,
  resetChapterEditors,
  toggleBlockquote,
  toggleHeading,
  toggleMarkup,
} from "@/components/editor/editor-commands";

describe("editor commands", () => {
  it("wraps a selected range in bold markup", () => {
    const state = EditorState.create({ doc: "read this" });
    const transaction = toggleMarkup(state, "**", { from: 5, to: 9 });

    expect(transaction.state.doc.toString()).toBe("read **this**");
    expect(
      transaction.state.sliceDoc(
        transaction.state.selection.main.from,
        transaction.state.selection.main.to,
      ),
    ).toBe("this");
  });

  it("removes an existing italic wrapper instead of nesting it", () => {
    const state = EditorState.create({ doc: "read *this*" });
    const transaction = toggleMarkup(state, "*", { from: 6, to: 10 });

    expect(transaction.state.doc.toString()).toBe("read this");
    expect(transaction.state.selection.main).toMatchObject({ from: 5, to: 9 });
  });

  it("inserts the next free footnote and places the cursor in its definition", () => {
    const state = EditorState.create({
      doc: "A [^1].\n\n[^1]: Existing",
      selection: { anchor: 1 },
    });
    const transaction = insertFootnote(state);

    expect(transaction.state.doc.toString()).toContain("[^2]");
    expect(transaction.state.doc.toString()).toContain("[^2]: ");
    expect(transaction.state.selection.main.from).toBe(transaction.state.doc.length);
  });

  it("replaces against the live view state rather than a stale snapshot", () => {
    resetChapterEditors();
    const state = createChapterEditor("one", "hero walks");
    const view = new EditorView({ state });
    registerChapterEditorView("one", view);
    // Only doc changes are written back to chapterEditorStates, so any other
    // transaction desynchronises the map from the view. mountEditor always
    // dispatches two of them: the reconfigure effect and the diagnostics.
    view.dispatch({ selection: { anchor: 0 } });

    const result = replaceChapterEditorText("one", [{ from: 0, to: 4, insert: "champion" }]);

    expect(result).toBe("champion walks");
    expect(view.state.doc.toString()).toBe("champion walks");
    expect(chapterEditorStates.get("one")?.doc.toString()).toBe("champion walks");
    view.destroy();
  });

  it("replaces through the map when no view is mounted", () => {
    resetChapterEditors();
    createChapterEditor("one", "hero walks");

    expect(replaceChapterEditorText("one", [{ from: 0, to: 4, insert: "champion" }])).toBe(
      "champion walks",
    );
    expect(chapterEditorStates.get("one")?.doc.toString()).toBe("champion walks");
  });

  it("can leave an edit out of the undo history", () => {
    resetChapterEditors();
    createChapterEditor("one", "hero walks");
    replaceChapterEditorText("one", [{ from: 0, to: 4, insert: "champion" }], {
      addToHistory: false,
    });
    expect(undoDepth(chapterEditorStates.get("one")!)).toBe(0);
    replaceChapterEditorText("one", [{ from: 0, to: 8, insert: "hero" }]);
    expect(undoDepth(chapterEditorStates.get("one")!)).toBe(1);
  });

  it("keeps one editor state per chapter and can reset the lifecycle", () => {
    resetChapterEditors();
    const first = createChapterEditor("one", "text");
    expect(createChapterEditor("one", "different")).toBe(first);
    expect(chapterEditorStates.get("one")).toBe(first);

    resetChapterEditors();
    expect(chapterEditorStates.size).toBe(0);
  });
});

const at = (doc: string, anchor: number, head = anchor) =>
  EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
const text = (tr: { state: EditorState }) => tr.state.doc.toString();

describe("toggleHeading", () => {
  it("adds and removes the heading marker on the first line wherever the cursor is", () => {
    expect(text(toggleHeading(at("Title\n\nBody", 9)))).toBe("# Title\n\nBody");
    expect(text(toggleHeading(at("# Title\n\nBody", 9)))).toBe("Title\n\nBody");
  });
});

describe("toggleBlockquote", () => {
  it("quotes every non-empty selected line, and unquotes when all are quoted", () => {
    const quoted = toggleBlockquote(at("a\n\nb\nc", 0, 6));
    expect(text(quoted)).toBe("> a\n\n> b\n> c");
    expect(text(toggleBlockquote(at("> a\n\n> b", 0, 8)))).toBe("a\n\nb");
  });
});

describe("insertSceneBreak", () => {
  it("inserts *** as its own paragraph", () => {
    expect(text(insertSceneBreak(at("one two", 3)))).toBe("one\n\n***\n\n two");
    expect(text(insertSceneBreak(at("one\n\ntwo", 5)))).toBe("one\n\n***\n\ntwo");
    expect(text(insertSceneBreak(at("", 0)))).toBe("***\n\n");
  });
});

describe("insertImageReference", () => {
  it("inserts an image paragraph and puts the cursor inside the alt text", () => {
    const tr = insertImageReference(at("Before after", 6), "images/a.png");
    expect(text(tr)).toBe("Before\n\n![](images/a.png)\n\n after");
    expect(tr.state.selection.main.head).toBe(10);
  });
});

describe("activeMarkup", () => {
  it("reports bold and italic around the cursor", () => {
    expect(activeMarkup(at("a **bold** b", 5))).toEqual({ bold: true, italic: false });
    expect(activeMarkup(at("a *it* b", 4))).toEqual({ bold: false, italic: true });
    expect(activeMarkup(at("a ***both*** b", 6))).toEqual({ bold: true, italic: true });
    expect(activeMarkup(at("plain", 2))).toEqual({ bold: false, italic: false });
  });
});
