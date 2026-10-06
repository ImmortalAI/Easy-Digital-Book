import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  misspellingAt,
  misspellingField,
  setMisspellings,
  spellingExtensions,
} from "../spelling-decorations";

const item = (word: string, from: number) => ({
  word,
  lang: "ru" as const,
  from,
  to: from + word.length,
});

describe("spelling decorations", () => {
  it("stores, maps and finds misspellings", () => {
    let state = EditorState.create({ doc: "мир превет мир", extensions: [misspellingField] });
    state = state.update({ effects: setMisspellings.of([item("превет", 4)]) }).state;
    expect(misspellingAt(state, 6)?.word).toBe("превет");
    expect(misspellingAt(state, 1)).toBeNull();
    state = state.update({ changes: { from: 0, insert: "Он " } }).state;
    expect(state.field(misspellingField)).toEqual([item("превет", 7)]);
  });
  it("drops a misspelling the user edits until it is checked again", () => {
    let state = EditorState.create({ doc: "превет", extensions: [misspellingField] });
    state = state.update({ effects: setMisspellings.of([item("превет", 0)]) }).state;
    state = state.update({ changes: { from: 2, to: 3, insert: "и" } }).state;
    expect(state.field(misspellingField)).toEqual([]);
  });
  it("renders marks with the misspelled class", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "мир превет", extensions: spellingExtensions }),
    });
    view.dispatch({ effects: setMisspellings.of([item("превет", 4)]) });
    expect(view.contentDOM.querySelector(".cm-misspelled")?.textContent).toBe("превет");
    view.dispatch({ effects: setMisspellings.of([]) });
    expect(view.contentDOM.querySelector(".cm-misspelled")).toBeNull();
    view.destroy();
  });
});
