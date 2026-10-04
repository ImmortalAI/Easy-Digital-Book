/**
 * Preview-only "dark old paper" layer. Never added to the EPUB: readers set
 * their own colours. Values come from the --paper-* variables that
 * components/editor/preview-theme.ts derives from the app's theme tokens.
 */
export const previewPaperCss = `:root { color-scheme: dark; }
html { background: var(--paper-bg); }
body { color: var(--paper-fg); }
h1, section.endnotes-chapter h2 { color: var(--paper-accent); }
a, a.noteref, a.endnote-backlink { color: var(--paper-link); }
blockquote, p.novlang-scene-break { color: var(--paper-muted); }
section.preview-notes { border-top-color: var(--paper-border); }
::selection { background: var(--paper-selection); }`;

export const previewDimImagesCss = `img { filter: brightness(0.8) sepia(0.15); }`;
