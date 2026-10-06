# Kindle CSS checker — implementation report

Branch: `feat/kindle-css-check`. Plan: `../plans/2026-10-05-kindle-css-checker.md`.

## Implemented

- Pure analysis with Lezer structural syntax checks and CSS Tree semantic parsing/walking with precise UTF-16 ranges, one syntax finding per document, continued checks of recovered declarations, keyword overrides, units, selectors, at-rules and resource URLs.
- CSS Tree public subpaths provide grammar/recovery/tokenization and decode CSS identifiers/strings/URL; CodeMirror owns diagnostics, tooltips and range rendering; VueUse owns debounce.
- Book-level lifecycle independent of the visible editor, cancellation on replacement/dispose, no changes to project revisions from diagnostics.
- Warning/info lint, dotted info underline, live translations, Styles expansion and focus navigation including Preview mode.
- Fresh synchronous export findings for both formats, with no export gating or CSS rewriting.
- Initial support rows have sources but remain partial: both target devices are unverified. Sources describe evidence leads, not device verdicts. Unknown properties/resources have separate warning messages.
- Four AZW3 fixtures retained; Images/CSS gains a sample catalog. Isolated editable `.edb` projects cover every row and keyword override.

## Verification before final review

- Baseline: 587 tests in 98 files passed.
- `pnpm check`: 622 tests in 103 files; type checking, lint and formatting passed.
- `pnpm build`: passed. Existing large-chunk advisory remains (main JS about 1.49 MB).
- `pnpm test:coverage`: passed; lines 94.95%, branches 83.17%, functions 94.50%, statements 93.14%. CSS service lines 97.54%, branches 86.89%.
- `pnpm build:fixture-azw3`: four deterministic AZW3 fixtures and companion `.edb` samples generated.
- `pnpm test:verify-azw3`: 16 tests passed.
- Calibre 9.15.0 independent inspect/round-trip: all four fixtures resolved resources and matched expected chapter/TOC/note/image semantics, including the added catalog.
- Production Vite module audit: five CSS Tree helper/tokenizer modules, summed `renderedLength` 5,213 bytes before final output compression. No CSS Tree parser/lexer or mdn-data in emitted chunk modules. This differs from the isolated esbuild bundle metric; it is not a whole-app bundle delta.

## Decision during execution

Device samples use isolated editable `.edb` files beside the four AZW3
fixtures plus a catalog chapter. NovLang has no arbitrary HTML classes,
and simultaneous test rules would affect one another. The cost is more
manual exports. Context-sensitive/inapplicable rules, unreachable input
states and missing external fonts/stylesheets remain inconclusive, never
automatic unsupported verdicts.

## Open release checks

Paperwhite 3/12 firmware-specific rendering and packaged-app UI/export
checks on macOS, Windows and Linux remain open in `docs/release-checklist.md`.
No physical device result was fabricated or inferred from Calibre.

## Final review and fix verification

One independent read-only whole-branch reviewer found five Important
issues: malformed declaration recovery, escaped dimensions, equivalent URL
spellings, reparsing unchanged CSS on chapter changes, and unbounded export
warnings. Legacy pseudo-elements and empty custom property values were
regraded Important because they produced false diagnostics for valid CSS.
All were covered in the same regression fix pass; no second review dispatch.

- Regression RED: 10 newly failing unit cases plus a failing real-browser
  test with export controls below a 900×600 viewport.
- GREEN: 633 tests / 103 files; `pnpm check` and `pnpm build` passed.
- Coverage: lines 94.99%, branches 83.86%, functions 94.56%, statements 93.44%.
- Full Chromium suite: 24 scenarios passed (6.8s).
- Chromium regression: 90 CSS findings, Export button inside viewport and
  EPUB successfully saved.
- CSS Tree parser/walker/tokenizer were enabled after confirmed parser
  limitations. JS bundle grew about 63 KB minified / 17 KB gzip compared
  with the initial utils implementation; no CSS Tree lexer/MDN dictionaries.
  See the updated library analysis for measurement limits.
- Fresh CSS diagnostics remain unchanged during chapter and metadata edits.
- Context-sensitive device findings remain inconclusive and physically
  unverified; there are no deferred code-review minors.
