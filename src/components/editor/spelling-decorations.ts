import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Misspelling } from "@/types/spelling";

export const setMisspellings = StateEffect.define<readonly Misspelling[]>();

/** Misspellings of the shown text; separate from @codemirror/lint so NovLang warnings don't mix. */
export const misspellingField = StateField.define<readonly Misspelling[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMisspellings)) return effect.value;
    if (!tr.docChanged) return value;
    return value.flatMap((item) => {
      if (tr.changes.touchesRange(item.from, item.to)) return [];
      return [{ ...item, from: tr.changes.mapPos(item.from), to: tr.changes.mapPos(item.to) }];
    });
  },
});

export function misspellingAt(state: EditorState, pos: number): Misspelling | null {
  return (
    state.field(misspellingField, false)?.find((item) => item.from <= pos && pos <= item.to) ?? null
  );
}

const mark = Decoration.mark({ class: "cm-misspelled" });
function build(view: EditorView): DecorationSet {
  const items = view.state.field(misspellingField);
  const visible = items.filter((item) =>
    view.visibleRanges.some((range) => item.to > range.from && item.from < range.to),
  );
  return Decoration.set(
    visible.map((item) => mark.range(item.from, item.to)),
    true,
  );
}
const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.field(misspellingField) !== update.state.field(misspellingField)
      )
        this.decorations = build(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);
const theme = EditorView.theme({
  ".cm-misspelled": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "var(--spelling)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
});
export const spellingExtensions = [misspellingField, plugin, theme];
