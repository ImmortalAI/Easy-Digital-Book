# Task 8 report: persisted format and shared export controller

## Implementation

- Added `ExportSettings.format: ExportFormat`, defaulting to `epub`. Settings loading accepts only `epub` and `azw3`; missing or invalid values fall back to `epub`.
- Added `makeExportFileName(metadata, versionInTitle, format)` and moved the existing sanitizer into it. `makeEpubFileName` remains a compatibility wrapper, preserving EPUB filename behavior.
- Added `format` and `exportBook(request?)` to the shared controller. Builders can be injected by format; otherwise the controller selects `buildEpub` or `buildAzw3`. `ExportOptions` remains format-free.
- Captured format, options, and a cloned book before awaiting the save dialog. Dialog filters and suggested extensions follow the captured format. The controller supplies `yieldControl`, checks cancellation immediately before the atomic write, and persists captured settings only after success.
- Kept `exportEpub` as a temporary alias for the existing ExportDialog consumer; Task 9 should migrate the consumer and remove the alias.
- Made export and reveal log messages format-neutral.

## TDD evidence

- **RED:** `pnpm vitest run src/stores/__tests__/stores.test.ts src/services/export/__tests__/file-name.test.ts src/composables/__tests__/use-export.test.ts` failed before implementation: missing shared filename module, persisted format was absent, and the controller lacked `format`/`exportBook`. Output included `5 failed | 17 passed` plus the expected module-resolution failure.
- **GREEN:** the same focused command passed after implementation and final adjustments: `3` files passed, `27/27` tests passed.
- The dialog race test changes format, options, title, and chapter source while the save dialog is pending; it asserts the writer receives the operation's original parameters. Additional regression cases cover retry after cancellation and builder failure, no write after abort, and preserving `lastOutput` after atomic write failure.

## Verification

- `pnpm vitest run src/stores/__tests__/stores.test.ts src/services/export/__tests__/file-name.test.ts src/composables/__tests__/use-export.test.ts` — passed, 27/27.
- `pnpm check` — passed: `vue-tsc`, Oxlint, Oxfmt, and full Vitest suite (98 files, 575 tests).
- `git diff --check` — passed.

## Files changed

- `src/stores/settings.ts`
- `src/stores/__tests__/stores.test.ts`
- `src/composables/use-export.ts`
- `src/composables/__tests__/use-export.test.ts`
- `src/services/export/file-name.ts`
- `src/services/export/__tests__/file-name.test.ts`
- `src/services/epub/file-name.ts`

## Concerns

- The `exportEpub` alias intentionally remains until Task 9 migrates the UI consumer.
- Commit SHA is provided in the implementer handoff after commit creation.
