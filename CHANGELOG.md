# Changelog

All notable changes to easy-digital-book are documented here.

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
