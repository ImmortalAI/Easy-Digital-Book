# PR #11 review and fixes — 2026-10-06

Reviewed `feat/kindle-css-check` at `b4569b32e1a30613353ebb3de88100f2e61ab155`
against `feat/azw3-export`. GitHub reported the PR open and its existing CI
checks successful. An independent reviewer examined the implementation and
the subsequent fixes.

## Findings addressed

- P2: URL syntax errors could disappear because all Lezer errors inside a
  CSS Tree URL node were suppressed. CSS Tree accepts unterminated strings
  and URLs at EOF, and Lezer can also accept an unterminated unquoted URL.
  Incomplete URLs now produce one syntax finding. Complete URLs are adapted
  before structural parsing, preserving source offsets and original semantic
  nodes. Escaped closing delimiters have regression coverage.
- P2: valid filtered positional selectors such as
  `p:nth-child(2n of .a)` produced a syntax finding because Lezer's generic
  function argument grammar does not handle their selector lists. CSS Tree's
  validated `Nth` arguments are adapted before structural parsing to prevent
  both local and cascading errors. Malformed selectors still report syntax.
- P2: CSS Tree stores variable fallbacks as `Raw`, so external URLs and units
  inside `var(--bg, url(https://example.com/a))` were not checked. Fallbacks
  are now parsed as values at their original offsets, including nested
  fallbacks. Arbitrary fallback tokens remain advisory; custom-property
  definitions retain their existing conservative handling.
- P3: keyword lookup inherited `constructor` from the JavaScript object
  prototype and reported it as a table override. Overrides now require an
  own property, otherwise the property's normal support finding applies.

## Verification

Ten regression cases were added. Each affected behavior was reproduced with
failing tests before its fix. The independent reviewer found no remaining
actionable defect in the final fixes.

- `pnpm check`: 643 tests in 103 files; type checking, lint and formatting pass.
- `pnpm test:e2e`: all 24 Chromium scenarios pass.
- `pnpm build`: passes; Vite retains its warning about a chunk above 500 kB.
- `git diff --check`: passes.

Production support-table statuses were not changed. Physical Paperwhite 3/12
checks and packaged-app release gates remain open. Existing local device
results, CSV files and AGENTS.md changes were preserved separately.
