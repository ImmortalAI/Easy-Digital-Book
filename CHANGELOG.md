# Changelog

All notable changes to Easy Digital Book are documented here.

## [Unreleased]

### Added

- The project is licensed under GPL-3.0-or-later.

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
