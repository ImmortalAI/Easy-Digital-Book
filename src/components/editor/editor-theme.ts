import { EditorView } from "@codemirror/view";

/**
 * Colours for every CodeMirror surface, taken from the app's theme tokens so
 * the editors follow the light and dark palettes without their own palette.
 * The tokens resolve through CSS, so switching theme needs no reconfigure.
 */
export const editorColorTheme = EditorView.theme({
  "&": { color: "var(--foreground)", backgroundColor: "var(--background)" },
  ".cm-content": { caretColor: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklch, var(--ring) 45%, transparent)" },
  ".cm-gutters": {
    color: "var(--muted-foreground)",
    backgroundColor: "var(--muted)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--accent)" },
  ".cm-panels": { color: "var(--foreground)", backgroundColor: "var(--muted)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-panel .cm-textfield, .cm-panel .cm-button": {
    color: "var(--foreground)",
    backgroundColor: "var(--background)",
    backgroundImage: "none",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  ".cm-panel .cm-button:hover": { backgroundColor: "var(--accent)" },
  ".cm-panel .cm-textfield:focus": { outline: "2px solid var(--ring)", outlineOffset: "-1px" },
  ".cm-panel button[name=close]": { color: "var(--muted-foreground)" },
  ".cm-chapter-search": { display: "flex", flexDirection: "column", gap: "4px" },
  ".cm-chapter-search-row": {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flexWrap: "wrap",
  },
  ".cm-panel .cm-button[aria-pressed=true]": {
    backgroundColor: "var(--accent)",
    borderColor: "var(--ring)",
  },
  ".cm-search-counter": {
    minWidth: "7em",
    color: "var(--muted-foreground)",
    fontSize: "0.85em",
  },
  ".cm-search-counter-empty": { color: "var(--destructive)" },
  ".cm-tooltip": {
    color: "var(--popover-foreground)",
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
  },
});

/** Tells CodeMirror's base theme which palette its own defaults should use. */
export function editorColorScheme(resolved: "light" | "dark") {
  return EditorView.darkTheme.of(resolved === "dark");
}
