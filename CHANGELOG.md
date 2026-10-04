# Changelog

All notable changes to Easy Digital Book are documented here.

## [1.1.0] — 2026-10-04

### Added

- Dark "old paper" preview under the dark theme, derived from the app colours. It is preview-only, and the EPUB is unchanged.
  - Toggles in the preview corner switch the paper style and image dimming.
  - Mod+Alt+P switches back to the original look.
  - The status bar says when the preview is styled.
- Chapter search (Mod+F) has its own panel with a live match counter ("3 of 17"), translated labels, and the same matching rules as book search.
- The cover can be chosen from the book's images in Metadata, and set from the image page and the gallery selection bar.
- "Rename…" on the image page.
- "Show in folder" in the file menu.
- A roadmap section in the README.

### Changed

- The file menu shows the book title instead of the file path.
- The first save of an untitled book takes its title from the file name.
- Renaming a single image no longer adds a number (`cover.jpg`, not `cover_1.jpg`). The dialog starts from the current name.
- Block quotes in the book have a rule on the left.
- The preview has a margin around the text, so the last line is no longer at the very edge.

### Fixed

- Tab in the custom.css editor accepts a completion or indents, instead of moving focus to the splitter.

## [1.0.1] — 2026-10-04

### Added

- The project is licensed under GPL-3.0-or-later.
- A sample book, `docs/sample/the-keeper-of-north-light.edb`, to try the app on.

### Changed

- New app icon on every platform; the macOS icon follows the system icon grid.
- The app is now called "Easy Digital Book" in the window title, bundles, and release names.

## [1.0.0] — 2026-10-04

### Added

- NovLang editor for creating one EPUB3 book per project.
- `.edb` project containers with metadata, chapters, images, and recovery.
- Kindle Paperwhite export presets, title pages, custom CSS, and EPUB validation fixtures.
- Russian, English, and Simplified Chinese interfaces.
- Endnotes collected in `notes.xhtml`, numbered across the book, with back links; the preview follows the same layout.
- Content header with breadcrumbs and a formatting toolbar (bold, italic, footnote, heading, quote, scene break, image).
- Image gallery with filters, multi-selection, batch delete with undo, and batch rename that updates every reference.

### Delivery

- Playwright integration coverage using deterministic in-memory platform adapters.
- GitHub Actions checks for frontend, EPUB, Playwright, and Rust targets.
- Tauri release bundles for macOS, Windows, and Ubuntu 22.04.
