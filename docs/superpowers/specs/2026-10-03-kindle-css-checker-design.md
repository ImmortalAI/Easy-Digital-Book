# Kindle CSS checker — specification

- **Date:** 2026-10-03
- **Status:** implementation on `feat/kindle-css-check`; plan: `docs/superpowers/plans/2026-10-05-kindle-css-checker.md`. Device verification remains a release gate.
- **Source:** user feedback session 2026-10-03
  (`docs/superpowers/notes/2026-10-03-issues.md`, item 4a)
- **Base spec:** `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`

## 1. Why

`styles/custom.css` accepts any CSS, but Kindle renders only part of it, and
what it ignores depends on the format (KF8/AZW3 versus KFX) and the
firmware. Today the author finds out on the device. The checker tells them
in the editor: this property, value, selector or at-rule does not work on
Kindle.

Prerequisite: CSS syntax highlighting in the `custom.css` editor (plan
`docs/superpowers/plans/2026-10-03-user-feedback-fixes.md`, task 6).

## 2. Scope

- Checks `custom.css` only. `theme.css` is ours and kept within the
  supported set by a unit test that runs the same checker over it.
- **Warns and never blocks.** The author can still export a book with
  unsupported CSS: an ignored rule is harmless, and Kindle firmware may
  change.
- Targets: AZW3 (KF8) on Paperwhite 3 and Paperwhite 12th gen, the same
  devices as the AZW3 export spec. KFX differences are reported as
  "partly supported", not as errors.

## 3. Support table: the source of truth

- `src/services/css-support/kindle.ts` — a typed, data-only table:

  ```ts
  type Support = "supported" | "partial" | "unsupported";
  interface PropertyRule {
    property: string; // "position"
    support: Support; // overall support for the property
    values?: Record<string, Support>; // per-keyword overrides: { fixed: "unsupported" }
    note: string; // short reason shown to the user, a locale key
    source: string; // where we learned it: guideline section, device test id
  }
  interface SelectorRule {
    pattern: "pseudo-class" | "pseudo-element" | "combinator" | "attribute";
    name: string;
    support: Support;
    note: string;
    source: string;
  }
  interface AtRule {
    name: string;
    support: Support;
    note: string;
    source: string;
  }
  ```

- Data sources, in order of trust:
  1. tests on a real device (the `docs/release-checklist.md` fixture book
     gets a CSS page with one rule per check);
  2. what the AZW3 writer must preserve (AZW3 export spec, §4), and what
     Calibre's KF8 output does with the rule (observed, not copied);
  3. Amazon's Kindle Publishing Guidelines, section on supported CSS.
- Every entry names its source. An entry without a device test is
  `partial` at most.

## 4. Analysis

- `src/services/css-support/check.ts`:
  `checkKindleCss(css: string, table = kindleSupport): CssFinding[]` where
  `CssFinding = { from: number; to: number; severity: "warning" | "info"; code: string; params: Record<string, string> }`.
- Parsing: the Lezer CSS parser (`@lezer/css`, already in the dependency
  tree through `@codemirror/lang-css`). It is a plain parser with no DOM or
  CodeMirror view dependency, so it runs inside `services/` and the same
  check runs both in the editor and at export. Add `@lezer/css` as a direct
  dependency instead of reaching through `lang-css`. Implementation refinement after review: semantic compatibility analysis reuses CSS Tree parser/walker/tokenizer/utils subpaths. Lezer supplements structural syntax errors and recovered fragments. Confirmed Lezer recovery/escaped-token limitations justify the additional parser; no full lexer/MDN dictionaries are bundled. Library evaluation: `docs/superpowers/notes/2026-10-05-css-library-analysis.md`.
- What it checks:
  - property names (unknown to Kindle → warning);
  - keyword values per property (`position: fixed`, `display: grid`, …);
  - units (`vw`, `vh`, `rem` where unsupported, …);
  - selectors (`:hover`, `:nth-child()`, `::before` content, …);
  - at-rules (`@font-face` is out of scope because fonts are not exported;
    `@media` queries Kindle ignores; `@supports`, …);
  - `url(…)` that points outside `images/` (already handled by export, but
    reported here too).
- Syntax errors are reported once as an `info` finding and stop no further
  checks.

## 5. Where findings appear

- **Editor:** `@codemirror/lint` diagnostics in the `custom.css` editor
  (wavy underline, hover tooltip with the note), updated with a debounce
  like NovLang diagnostics.
- **WarningsPopover:** a "Styles" entry in the "Book" group with the count.
  Clicking it opens the CSS editor at the finding.
- **ExportDialog:** shown in the warning summary. It does not block export.
- Text comes from locale keys `cssSupport.<code>`, in ru / en / zh-CN.

## 6. Severity levels

| Level         | Meaning                                                            | UI                      |
| ------------- | ------------------------------------------------------------------ | ----------------------- |
| `unsupported` | Kindle ignores it in KF8                                           | warning, wavy underline |
| `partial`     | works only in KFX, only on newer firmware, or only for some values | info, dotted underline  |
| `supported`   | no finding                                                         | —                       |

## 7. Tests

- Table integrity: every entry has a `note` key present in all three
  locales and a non-empty `source`.
- `checkKindleCss` cases: one per row type, positions point at the exact
  token, nested `@media` blocks, comments and strings are ignored.
- `theme.css` produces no `unsupported` findings.
- Editor: diagnostics appear and disappear as the text changes (via
  `EditorState`, without a view).

## 8. Related work

- AZW3 export (`docs/superpowers/specs/2026-10-03-azw3-export-design.md`):
  shares the knowledge of what KF8 keeps. Whichever ships second updates
  the table from the other's findings.

## 9. Open questions

- Should the checker offer quick fixes (for example, replace `rem` with
  `em`)? Not in the first version.
- Should the table carry per-firmware data, or only "works on both target
  devices"? Start with the latter.
