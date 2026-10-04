import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { highlightActiveLine, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Colours come from theme tokens, so a theme switch needs no reconfigure. */
export const cssHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  {
    tag: [
      tags.tagName,
      tags.className,
      tags.labelName,
      tags.constant(tags.className),
      tags.attributeName,
      tags.definitionOperator,
    ],
    color: "var(--syntax-selector)",
  },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  {
    tag: [tags.atom, tags.number, tags.unit, tags.color, tags.variableName],
    color: "var(--syntax-value)",
  },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: [tags.keyword, tags.definitionKeyword], color: "var(--syntax-keyword)" },
  { tag: tags.modifier, color: "var(--syntax-keyword)", fontWeight: "600" },
]);

export function cssEditingExtensions(): Extension[] {
  return [
    css(),
    syntaxHighlighting(cssHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    autocompletion(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    keymap.of([
      { key: "Mod-f", run: openSearchPanel },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
    ]),
  ];
}
