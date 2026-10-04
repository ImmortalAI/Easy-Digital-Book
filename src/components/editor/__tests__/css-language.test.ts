import { acceptCompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { highlightingFor } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { cssEditingExtensions } from "@/components/editor/css-language";

function cssView(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: cssEditingExtensions(),
    }),
    parent: document.body,
  });
}

describe("cssEditingExtensions", () => {
  it("lets Tab accept a completion before anything else", () => {
    const view = cssView("p {}", 0);
    const tab = view.state
      .facet(keymap)
      .flat()
      .find((binding) => binding.key === "Tab");
    expect(tab?.run).toBe(acceptCompletion);
    view.destroy();
  });

  it("indents with Tab and outdents with Shift-Tab instead of leaving the editor", () => {
    const view = cssView("p {\ncolor: red;\n}", 5);
    runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Tab" }), "editor");
    expect(view.state.doc.line(2).text).toMatch(/^\s+color: red;$/);
    runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }), "editor");
    expect(view.state.doc.line(2).text).toBe("color: red;");
    view.destroy();
  });

  it("assigns a highlight class to every CSS token family", () => {
    const state = EditorState.create({
      doc: "p { color: red; }",
      extensions: cssEditingExtensions(),
    });
    const unstyled = [
      tags.comment,
      tags.tagName,
      tags.className,
      tags.propertyName,
      tags.number,
      tags.string,
      tags.keyword,
      tags.definitionKeyword,
      tags.atom,
    ].filter((tag) => !highlightingFor(state, [tag]));
    expect(unstyled).toEqual([]);
  });

  it("offers property completions", () => {
    const state = EditorState.create({ doc: "p { col", extensions: cssEditingExtensions() });
    expect(state.languageDataAt("autocomplete", 6).length).toBeGreaterThan(0);
  });
});
