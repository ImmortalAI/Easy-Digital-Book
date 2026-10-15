# Project file embedded in exported books — specification

- **Date:** 2026-10-11
- **Status:** implemented (plan: docs/superpowers/plans/2026-10-12-embedded-project.md)
- **Source:** brainstorming session 2026-10-11
- **Base specs:** `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`
  (sections 2, 3, 5), `docs/superpowers/specs/2026-10-03-azw3-export-design.md`

## 1. Why

During editing an author sends a book to an editor. Today that takes two
files: the exported book to read and the `.edb` project to edit. They drift
apart as soon as one of them is re-sent.

Goal: **one exported file that carries both the book and its project.** The
author ticks a box in the export dialog; the editor opens the received `.epub`
or `.azw3` in Easy Digital Book and gets the project. E-readers must not see
or render the embedded project.

This is for the editing loop only. A book with an embedded project contains
the full sources and is not meant to be published.

## 2. Scope

In scope:

- An export option that embeds the project into EPUB and AZW3 output.
- "Open" accepts `.epub` and `.azw3` and opens the embedded project.

Out of scope:

- Importing arbitrary EPUB/AZW3 books that have no embedded project.
- Encrypting or password-protecting the embedded project.
- OS file association for `.epub` / `.azw3`.
- Remembering the option between exports or per book.
- Any warning when a project that was opened from a book is later exported
  without the option.

## 3. Where the project is stored

The embedded payload is exactly the bytes `writeEdb` produces: a normal
`.edb` zip, `formatVersion` unchanged (2). No new container format.

### 3.1 EPUB

The project is the zip entry **`project.edb` in the container root**, written
last, with `STORE` compression (the payload is already compressed). It is
**not** listed in the OPF manifest and nothing references it.

Basis: EPUB 3.3 §4.2.2 lets the creator place any other files in the OCF
container; §5.6.1 requires the manifest to list only publication resources.
Reading systems and converters work from the manifest and spine, so the entry
is invisible to them. `META-INF/` is not used: §4.2.6.1 reserves it for the
listed configuration files.

Rejected: declaring the entry in the manifest as an exempt resource (§3.4).
It is valid, but it makes the project part of the publication, so converters
such as Calibre would carry it into converted output.

### 3.2 AZW3 / KF8

The project is one **`SRCS` record**, the record KindleGen used for a zip of
the book's sources:

| Offset | Size | Value                                          |
| ------ | ---- | ---------------------------------------------- |
| 0      | 4    | `SRCS`                                         |
| 4      | 4    | `0x00000010` (header length)                   |
| 8      | 4    | `0x0000002f` (fixed value in KindleGen output) |
| 12     | 4    | `0x00000001` (count)                           |
| 16     | …    | the `.edb` bytes, to the end of the record     |

The record sits **between FCIS and the end-of-file record**. Record 0 points
at it: SRCS record index at offset 224 and SRCS record count (1) at offset
228 (offsets from the start of record 0, the fields `headers.ts` writes as
`NULL` / `0` today).

`build.ts` currently derives the FLIS and FCIS record numbers from the end of
the record list (`records.length - 3`, `- 2`). With SRCS inserted this would
point at the wrong records, so the indices must be captured when each record
is pushed.

Rejected: bytes appended after the PalmDB, or a private record type. Neither
is described anywhere, and device and Calibre behaviour is unpredictable.

### 3.3 Consequences to document for users

- The project survives only when the file itself is passed on. Send to
  Kindle, KDP and Calibre conversion rebuild the book and drop it.
- File size grows: images are stored twice (optimised in the book, originals
  in the project).
- The project is not secret. Anyone who unpacks the file gets the sources.

## 4. Export

- `ExportOptions` gains **`embedProject?: boolean`**. The field is optional so
  existing literals in tests and `scripts/build-fixture-*.mts` stay valid;
  absent means `false`.
- The option is dialog state only. It starts **off every time the export
  dialog opens** and is never written to app settings or to the `.edb`.
  (`use-export.ts` copies fields by name in both directions, so it does not leak.)
- `ExportDialog`: a checkbox "Embed project file" with a hint: "For editing.
  Do not publish this file: it contains the book's sources."
- The payload is `writeEdb` applied to the same `Book` snapshot the export is
  built from. Saving first is not required; `dirty`, `revision` and
  `metadata.modified` are not touched.
- The export file name does not change. The success notification says the
  project was included, e.g. "EPUB saved · with project file".
- With the option off, output is **byte-identical** to today's.

## 5. Open

- New pure module `services/export/embedded-project.ts`:
  `extractEmbeddedProject(bytes: Uint8Array): Promise<Uint8Array | null>`.
  The container is detected by signature, not by file extension:
  - a zip whose `mimetype` entry is `application/epub+zip` → the bytes of the
    `project.edb` entry, or `null` if it is absent;
  - a PalmDB with type/creator `BOOKMOBI` → read the SRCS index and count from
    record 0; if set, check the `SRCS` magic and return the record from byte
    16; otherwise `null`;
  - anything else → `null`.
    Truncated or inconsistent input returns `null`; it never throws.
- The module also exports `findEmbeddedProject`, which returns the recognised
  container together with the project, so the open flow can tell a book
  without a project from a file that is not a book.
- The Open dialog filter becomes `edb, epub, azw3`.
- `openPathAfterGuard`: bytes that are not an `.edb` go through
  `extractEmbeddedProject`, then through the normal `readEdb`. Whether the
  file is an `.edb` is decided from the bytes as well: try the embedded
  extraction only for EPUB/PalmDB signatures, otherwise read as `.edb` as
  today.
- The result opens as an **unsaved book**: `filePath = null`, `dirty = true`,
  no `fileMtime`. Mod+S leads to "Save as". The book path is **not** added to
  Recent files. Read warnings from `readEdb` are shown as usual.
- **Recovery sessions.** The opened project has the same book UUID as the
  author's original `.edb`, and recovery sessions are keyed by UUID. The
  recovery store keeps an old session's `originalPath` when the new one is
  `null`, so an autosave of the pathless book would inherit the original
  project's path, and a later "Restore" plus Mod+S would silently overwrite
  that project. Therefore: when a project is opened from a book, **any
  existing recovery session with the same UUID is removed before `setBook`**.
- Opening from the OS is unchanged: `lib.rs` and `drainOpenPaths` keep
  accepting only `.edb`.

Errors:

| Case                                         | Result                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| EPUB/AZW3 without an embedded project        | Dialog: "This book does not contain a project file". The current project stays open. |
| Embedded project is not a valid `.edb`       | The existing `readEdb` errors.                                                       |
| Embedded project has a newer `formatVersion` | The existing "update the application" error.                                         |

New texts go to `ru`, `en` and `zh-CN` locales.

## 6. Backward compatibility

- `.edb` format: unchanged, no migration.
- Exports without the option: byte-identical (tested).
- Versions 1.2.x cannot open a book with an embedded project (their dialog
  offers only `.edb`); nothing is corrupted.
- PalmDB limits: one more record; the 4 GB file limit is already enforced in
  `palmdb.ts`.

## 7. Tests

Unit (Vitest):

- Round trip for each format: export with `embedProject` →
  `extractEmbeddedProject` → `readEdb` yields the same book.
- Export without the option equals the current output byte for byte, and
  `extractEmbeddedProject` returns `null` for it.
- AZW3 with SRCS: record 0 points at the right FLIS, FCIS and SRCS records;
  the end-of-file record is still last.
- `extractEmbeddedProject`: non-book input, EPUB without the entry, SRCS
  index out of range, wrong magic, truncated record → `null`.
- Open flow: book with a project opens with `filePath = null`, `dirty = true`,
  not in Recent; book without a project shows the error and keeps the current
  project; a pre-existing recovery session with the same UUID is removed and
  the new session has `originalPath = null`.
- `ExportDialog`: the checkbox is off on every open and is not persisted.

CI:

- A fixture with an embedded project is added to the epubcheck run and to
  `azw3-interoperability` (Calibre must still read the book).

## 8. Risks to resolve first

1. **epubcheck 5.2.1 and an unmanifested container file.** Older epubcheck
   reported it as warning OPF-003; later versions downgraded it to a usage
   message. Our CI fails on warnings, and this has not been run yet. It is the
   **first task of the plan**. If 5.2.1 warns, EPUB falls back to the rejected
   manifest variant (§3.1) and this spec is updated.
   **Result (2026-10-15):** epubcheck 5.2.1 on Temurin 25 exits 0 with
   "No errors or warnings detected" for the fixture with `project.edb`;
   OPF-003 is reported only as a usage message (`-u`). The unmanifested
   variant stays.
2. **Kindle devices and SRCS.** Calibre is covered by CI; a real device is a
   manual check added to `docs/release-checklist.md` next to the open
   Paperwhite 3 / 12 checks.
