# Kindle CSS checker — implementation report

Branch: `feat/kindle-css-check`. Plan: `../plans/2026-10-05-kindle-css-checker.md`.

## Implemented

- Pure Lezer CSS analysis with precise UTF-16 ranges, one syntax finding per document, continued checks of recovered declarations, keyword overrides, units, selectors, at-rules and resource URLs.
- CSS Tree public utils decode CSS identifiers/strings/URL; CodeMirror owns diagnostics, tooltips and range rendering; VueUse owns debounce.
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
