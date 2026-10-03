import { EditorState } from "@codemirror/state";
import { highlightingFor } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { cssEditingExtensions } from "@/components/editor/css-language";

describe("cssEditingExtensions", () => {
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
