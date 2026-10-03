# AZW3 (KF8) export — specification

- **Date:** 2026-10-03
- **Status:** roadmap, after v1. Not scheduled. No implementation plan yet.
- **Source:** user feedback session 2026-10-03
  (`docs/superpowers/notes/2026-10-03-issues.md`, items 2, 2a, 2b)
- **Base spec:** `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`

## 1. Why

The user puts books on a Kindle Paperwhite with Calibre's "Send to device",
which converts EPUB to MOBI. The app should be able to write the Kindle
format itself, so the book on the device is exactly what the app built:
footnotes, table of contents, cover and styles, with no third-party
conversion step in between.

This revises the base decision "output is EPUB only". EPUB stays the
primary format; AZW3 is a second export target.

## 2. Target devices and format

|                 | Paperwhite 3 (7th gen, 2015)                      | Paperwhite 12th gen (2024)        |
| --------------- | ------------------------------------------------- | --------------------------------- |
| Reads natively  | AZW3 (KF8), AZW, MOBI without DRM, PRC, TXT, PDF  | same                              |
| EPUB            | only after conversion (Send to Kindle or Calibre) | same                              |
| Screen          | 6″, 1072×1448, 300 ppi, greyscale                 | 7″, 1264×1680, 300 ppi, greyscale |
| Popup footnotes | yes, with bidirectional links                     | yes                               |

- The target is **AZW3 (KF8)**. Legacy MOBI 6 (the "joint" MOBI 6 + KF8
  file) is out of scope: it handles CSS poorly and both devices read KF8.
- KFX is out of scope. Amazon does not document it, and Send to Kindle
  produces it from EPUB anyway.
- The existing "Kindle Paperwhite" image preset (1264×1680, cover
  1600×2560) already suits both devices and is reused unchanged.

## 3. How we learn the format: Calibre as a reference only

The KF8 format is poorly documented. Calibre has a complete open-source
writer, and we use it **only as a reference for the file structure**.

- **The project licence is not GPL.** Calibre is GPL v3. We read its code to
  learn the format; we do not translate it. A line-by-line Python → TS
  translation would be a derivative work. The facts of a file format are
  not.
- Work order:
  1. Study Calibre and public format descriptions (the MobileRead wiki on
     MOBI, KF8, EXTH and PalmDOC). Write our own format description in
     `docs/formats/azw3.md`, in our own words, with byte layouts and
     examples taken from files we build and inspect ourselves.
  2. Implement the writer from `docs/formats/azw3.md` with our own
     architecture. Calibre's code is not open in the editor while the
     writer is written.
- The project still needs a licence file (none exists today: no `LICENSE`,
  no `license` in `package.json` or `Cargo.toml`). Choose and add it before
  this work starts. This is independent of AZW3.

### Reference locations in Calibre's source

- Output plugin: `src/calibre/ebooks/conversion/plugins/mobi_output.py`,
  class `AZW3Output` (around line 297, `name = 'AZW3 Output'`). It declares
  the format and its conversion options and calls the writer.
- KF8 writer: `src/calibre/ebooks/mobi/writer8/`
  - `main.py` — main KF8 build logic;
  - `skeleton.py` — splitting HTML into a skeleton and fragments;
  - `index.py`, `toc.py`, `tbs.py` — indexes, table of contents and
    trailing byte sequences for navigation;
  - `exth.py`, `header.py`, `mobi.py` — MOBI/EXTH headers and container
    packing;
  - `cleanup.py` — preparing the OEB before writing.
- Shared parts (compression, serialisation) partly come from
  `src/calibre/ebooks/mobi/writer2/`, the legacy MOBI 6 writer.

## 4. What the format description must cover

`docs/formats/azw3.md` must describe, at minimum:

- the PalmDB container: header, record list, record size limits;
- record 0: PalmDOC header, MOBI header (KF8 version), EXTH block (title,
  authors, language, ASIN/UUID, cover offset, `cdetype` = `EBOK`);
- text records: PalmDOC (LZ77) compression, the 4096-byte record size and
  trailing entries (multibyte overlap, TBS);
- KF8 text layout: the skeleton/fragment split, `aid` attributes, `kindle:pos:fid:…:off:…`
  links, the FDST table;
- indexes: skeleton (SKEL), fragment (FRAG), NCX (table of contents) and the
  INDX/TAGX/IDXT structures;
- resources: images (JPEG/PNG/GIF), cover and thumbnail records,
  CSS as flow records (`kindle:flow:…`), fonts are out of scope;
- the end-of-file records (FLIS, FCIS, DATP, EOF);
- how footnotes must look to get Kindle popups: a `noteref` link and a
  target that begins with a link back to the reference.

Each section ends with a worked example: a hex dump of that structure from
a fixture book built by our own code.

## 5. Architecture

- New module `src/services/azw3/`, next to `services/epub/`, under the same
  rules: pure functions, no `vue`, `pinia` or `@tauri-apps/*` imports
  (enforced by Oxlint `no-restricted-imports`).
- **Input is the book model, not an EPUB file.** The writer reuses the EPUB
  pipeline's intermediate results: rendered chapter XHTML (`renderChapter`),
  the endnotes document, the image plan from `services/epub/resources.ts`,
  metadata and the navigation list. Shared steps are extracted from
  `services/epub/build.ts` into a format-neutral stage instead of being
  copied.
- Proposed files: `palmdb.ts`, `palmdoc.ts` (compression), `headers.ts`
  (PalmDOC/MOBI/EXTH), `skeleton.ts` (skeleton/fragment split),
  `indexes.ts` (SKEL/FRAG/NCX), `links.ts` (rewrite `href` to `kindle:pos`),
  `build.ts` (`buildAzw3(book, options, deps) → Uint8Array`, the same
  `deps` shape as `buildEpub`: `imageProcessor`, `now`, `onProgress`,
  `signal`).
- Deterministic output: the same book and options produce the same bytes,
  except for the build date in EXTH.

## 6. UI

- ExportDialog gets a format choice: **EPUB / AZW3**. It is remembered in
  app settings. The file name extension follows the format.
- Everything else in the dialog (preset, greyscale, title page, version in
  the title, progress, cancel, "Show in folder") works the same for both
  formats.
- Copying to the device over USB and sending to Kindle stay out of scope:
  the app writes a file to disk.

## 7. Verification

- Unit tests for every structure (headers, compression round-trip, index
  encoding) against byte layouts from `docs/formats/azw3.md`.
- CI smoke test: build fixture books → read them back with Calibre
  (`ebook-convert book.azw3 book.epub` and
  `calibre-debug --inspect-mobi book.azw3`) and assert that chapters,
  TOC entries, the cover and every footnote anchor survive. Calibre is a
  test-only dependency, never a runtime one.
- Manual check on a Paperwhite before release: the TOC opens and jumps
  correctly, footnotes open as popups and link back, the cover shows in
  the library, images are sharp, `custom.css` applies. Added to
  `docs/release-checklist.md`.

## 8. Related work

- The Kindle CSS checker
  (`docs/superpowers/specs/2026-10-03-kindle-css-checker-design.md`) uses
  what this work learns about which CSS survives KF8.
- The endnotes rework (plan
  `docs/superpowers/plans/2026-10-03-user-feedback-fixes.md`, tasks 1–4)
  must land first: AZW3 inherits its footnote markup.

## 9. Open questions

- Should the writer split a long chapter into several KF8 text flows, or is
  the fragment split enough for 300-chapter novels? Decide from
  measurements on a real book.
- Should an embedded thumbnail record be generated for the Kindle library
  view, or does the cover record suffice on both devices?
