# easy-digital-book — specification v1

- **Date:** 2026-09-15
- **Updated:** 2026-10-03 (endnotes, content header, image gallery and
  rename; roadmap specs linked below)
- **Status:** design approved by sections; technical bootstrap underway,
  new implementation plan not yet written
- **Solution source:** brainstorm 2026-09-14/15 (context — `AGENTS.md`)

## 1. Goal and scope

A minimalist desktop editor that transforms novel texts written in NovLang
markup language into EPUB3 for reading on Kindle Paperwhite. Existing tools
(FB2 Editor + Calibre, Sigil) are overkill for this narrow task. The project
is open-source.

**Included in v1**

- One project = one book, project file `.edb` (zip).
- NovLang editor with preview, find and replace across the book.
- Metadata, cover, images, optional `custom.css`.
- Export `.epub` to disk with Kindle image optimization.
- Manual save + autosave to recovery storage.
- UI in Russian, English, and Simplified Chinese.
- Windows, macOS, Linux; release builds via GitHub Actions.

**Not included in v1**

- Import txt / html / docx; chapter splitting and merging.
- Book library, multiple projects in one window, chapter tabs.
- Send to Kindle (email, USB), web and mobile versions.
- Opening `.edb` by dragging file to window (see 13.3).
- Separate cover page in EPUB. (Image renaming was moved into v1 on
  2026-10-03, see 9.4.)
- Auto-update (`tauri-plugin-updater`), build signing and notarization,
  e2e tests on real WebView (tauri-driver).
- Telemetry.

## 2. Stack

| Layer           | Choice                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Shell           | Tauri 2 (Rust only where there's no ready plugin)                            |
| UI              | Vue 3 (`<script setup>`), Vite, TypeScript, pnpm, Tailwind CSS 4, shadcn-vue |
| State           | Pinia                                                                        |
| Editor          | CodeMirror 6                                                                 |
| Markup          | `novlang-js` (npm)                                                           |
| Containers      | JSZip (`.edb` and `.epub`)                                                   |
| Manifest schema | valibot                                                                      |
| i18n            | vue-i18n                                                                     |
| Autosave        | IndexedDB via `idb`                                                          |
| XML validation  | `fast-xml-parser` (`XMLValidator`)                                           |
| Tests           | Vitest, @vue/test-utils, happy-dom, fake-indexeddb, Playwright, epubcheck    |
| Code quality    | Oxfmt (`pnpm format:check`), Oxlint (`pnpm lint`)                            |

**Tauri plugins:** `opener`, `dialog`, `fs`, `store`, `log`,
`single-instance`, `persisted-scope`, `window-state`.

The existing template already sets `identifier = com.immortalai.edb`. **This must
not be changed:** the WebView origin is tied to it, and so are IndexedDB data.

## 3. NovLang: what the app takes from `novlang-js`

- `parse(source) → { document, diagnostics }` never throws.
  `diagnostics[i] = { severity: "warning", message, position?: { line, column } }`,
  positions are 1-based.
- `renderToHTML(document, { xhtmlMode? })`.
- AST blocks: `heading | paragraph | sceneBreak | blockquote | footnoteDef`;
  inlines: `text | emphasis | strong | image | footnoteRef`. **AST nodes have no
  positions.**
- `# heading` is permitted only in the first line of a chapter.
- `column` is counted from the block text without prefix (`# `, `> `,
  `[^id]: `) — the app adds the prefix width itself.
- XHTML mode requires `xmlns:epub` on `<html>` and CSS
  `@namespace epub "http://www.idpf.org/2007/ops"; aside[epub|type~="footnote"] { display: none; }`.
  **The app no longer uses this rule** (2026-10-03): footnotes are exported as
  endnotes, see 11.6 and 11.7.
- Styles on the app side: scene break — `p.novlang-scene-break`;
  footnote in HTML mode — `div.footnote-def`, in XHTML — `aside` without class
  (the app extracts footnote definitions itself and renders them as endnotes,
  so these two classes are not styled).

Future issues for `novlang-js` (do not block v1): block positions in AST
(exact scroll synchronization), fix `column` offset.

## 4. Project structure

Standard Vue 3 structure; architectural boundaries are expressed through import
rules, not custom directory layers.

```
src/
├── main.ts            createApp + pinia + i18n; platform adapter wiring
├── App.vue            WelcomeView / EditorView by projectStore state (no vue-router)
├── assets/
│   ├── styles/        UI styles
│   └── epub/          book theme.css, preview.css, XHTML templates and custom.css (?raw)
├── components/
│   ├── ui/            components added by shadcn-vue CLI
│   ├── layout/        AppToolbar, ResizableSplit, StatusBadge, Breadcrumbs
│   ├── sidebar/       ActivityBar, ExplorerView, ExplorerSection, ChapterItem,
│   │                  ImageItem, SearchView, SearchResultItem
│   ├── editor/        SourceEditor, PreviewPane, WarningsPopover, CssEditor, ImageView
│   ├── metadata/      MetadataForm, CoverPicker, ContributorsList, LanguageCombobox
│   ├── export/        ExportDialog
│   ├── settings/      SettingsView
│   └── common/        IconButton, ConfirmDialog, ContextMenu, UndoToast, ToastStack
├── views/             WelcomeView.vue, EditorView.vue
├── composables/       useAutosave, useShortcuts, useResizable, useNovlangParse,
│                      useUnsavedGuard, useBookSearch, useImageImport
├── stores/            project.ts, layout.ts, diagnostics.ts, settings.ts, notifications.ts
├── services/
│   ├── book/          Book operations (chapters, metadata, resources, extractTitle)
│   ├── edb/           readEdb / writeEdb, manifest schema, migrations
│   ├── epub/          buildEpub: resources, chapter, titlePage, opf, nav, ncx,
│   │                  container, zip, fileName, labels
│   ├── search/        find and replace across Book
│   ├── checks/        book-level checks
│   └── platform/      fs, dialogs, settings, images, recovery, logger, opener, updates
├── workers/           image.worker.ts
├── plugins/           i18n.ts
├── locales/           ru.json, en.json, zh-CN.json
├── types/             book.ts, manifest.ts, platform.ts, diagnostics.ts, errors.ts
└── utils/             debounce, xml-escape, paths, uuid, bytes, plural
src-tauri/             see section 14
e2e/                   Playwright
scripts/               build test EPUBs for epubcheck
```

**Rules (import boundaries are checked by Oxlint via
`eslint/no-restricted-imports`):**

- `services/{book,edb,epub,search,checks}` and `utils` do not import `vue`,
  `pinia`, `@tauri-apps/*`, and do not use the DOM. Everything that depends on
  the environment (image processing, time, progress, cancellation) comes as
  parameters.
- `@tauri-apps/*` is imported **only** in `services/platform/`.
- Stores and composables receive platform services through interfaces from
  `types/platform.ts`; in tests and e2e builds, in-memory implementations are
  substituted.
- Components work through stores and composables and do not call
  `services/platform` directly.
- `src/components/ui/**` is added by shadcn-vue CLI. Oxfmt does not format these
  files to preserve minimal diff with the registry; Oxlint does not exclude them.
- Tests are located next to code in `__tests__/`.

## 5. Data model and `.edb` format

### 5.1. Container

```
my-novel.edb (zip)
├── manifest.json
├── chapters/<id>.nov     id: 8 chars [a-z0-9]; UTF-8, LF
├── images/               all images, including cover
└── styles/custom.css     optional
```

- Chapter files are named by stable id: reordering chapters changes only
  the array in manifest.
- Paths in markup (`![alt](images/x.png)`) are relative to project root.
- Writing is deterministic: fixed entry order, fixed date in zip. Text —
  DEFLATE, JPEG/PNG/GIF/WebP — STORE.

### 5.2. manifest.json

```json
{
  "format": "easy-digital-book",
  "formatVersion": 1,
  "book": {
    "id": "urn:uuid:…",
    "title": "…",
    "version": "ch. 1–150",
    "created": "2026-09-15T10:12:00Z",
    "modified": "2026-09-15T18:40:31Z",
    "language": "ru",
    "authors": ["…"],
    "translators": ["…"],
    "series": { "name": "…", "index": 2 },
    "description": "…",
    "cover": "images/cover.jpg"
  },
  "chapters": [{ "id": "k3f9a2x1" }]
}
```

- `formatVersion` — version of the container format, not the book.
- `version` — optional free-form text string (content version), never parsed
  as a number.
- `created` is set when the project is created. `modified` is updated on
  "Save" / "Save as" if there were changes; autosave does not touch it.
- `series`, `description`, `cover`, `version` can be `null`;
  `translators` can be an empty array; `series.index` is a number (1.5 is allowed).
- `language` — BCP 47.
- Chapter titles are not in manifest. Chapters are stored as objects to
  extend the format without migration.
- Schema is described in valibot, TS types are derived from it.

### 5.3. In-memory model

```ts
interface Book {
  metadata: BookMetadata; // = manifest.book
  chapters: Chapter[]; // order = array order
  resources: Map<string, Resource>; // "images/x.png" → { bytes, mediaType }
  customCss: string | null;
}
interface Chapter {
  id: string;
  source: string;
}
```

Chapter title is the text `# heading` from the first line
(`services/book/extractTitle`). If there is no heading, "Chapter N" (where N
is the position in the book) is used in the UI and EPUB, and a warning is issued.

### 5.4. Reading

User data is not lost.

- **Fatal errors** (current project untouched): not a zip, no manifest,
  corrupt JSON, foreign `format`, `formatVersion` newer than supported
  ("update the app").
- `formatVersion` older → chain of in-memory migrations; saved in new version.
- Invalid metadata fields → default values + warning.
- Missing `created` / `modified` → current time.
- Chapter in manifest without file → empty chapter + warning.
- Chapter file not in manifest → added to the end + warning.
- `cover` points to missing file → `null` + warning.
- Extra files in `images/` remain in the project (do not go into EPUB).
- CRLF is normalized to LF.

Read warnings are shown in a banner "N problems found when opening" with a list.

### 5.5. New project

One chapter `# Chapter 1` (localized), title "Untitled", language = UI language,
new UUID, `created` = now.

## 6. Main window

### 6.1. Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ path-to-sword.edb •               [Text|Split|Preview] [Export]    │
├──┬──────────────┬──────────────────────────┬───────────────────────┤
│📄│ EXPLORER     │ Chapters › 2 Trial     │                       │
│🔍│ ▾ BOOK       │                          │                       │
│  │ ▾ CHAPTERS +  │   NovLang source         │   preview            │
│  │ ▾ IMAGES     │                          │                       │
│⚙ │              │            ⚠ 2 · 1 243 wd│                       │
└──┴──────────────┴──────────────────────────┴───────────────────────┘
```

- **Activity panel** (48 px): Explorer (Mod+Shift+E), Search (Mod+Shift+F),
  Settings ⚙ at the bottom. Click on active icon hides the sidebar;
  Mod+\ toggles sidebar. Search icon shows the count of matches.
- **Sidebar** 160–400 px wide, edge is draggable.
- **Central area** — by `layoutStore.center`:
  `{ kind: 'chapter', id } | { kind: 'metadata' } | { kind: 'css' } |
{ kind: 'image', path } | { kind: 'settings' }`.
  Above it is a breadcrumb row ("Chapters › N Title"). No tabs — novels have
  50–300 chapters.
- **Modes** Text / Split / Preview (buttons and Mod+1/2/3) apply to
  `chapter` and `css`; for other views buttons are inactive. Source and preview
  are not less than 240 px; double-click on edge returns to 50/50.
- A **content header** (breadcrumbs plus the formatting toolbar, 7.5) spans
  source and preview, so the source/preview divider starts under it. This is
  the exception to the rule below; the sidebar divider is still full height.
- Dividers span down to a full-width status bar at the bottom of the window,
  VS Code style, running under the activity bar too. Left: ⚠ warnings for the
  book (opens the warnings list). Right: save state (Saved / Unsaved changes /
  Saving…) and, when a chapter is open, its words and characters.
- Window title: file name and "•" for unsaved changes.
- Widths, sidebar visibility, mode, and active view — in app settings, not
  in `.edb`. Window size and position — `tauri-plugin-window-state`.

### 6.2. WelcomeView

Shown when no project is open: "New book", "Open…", "Recent" list (up to 10;
missing file → "File not found" and removal from list), "Unsaved changes"
section from recovery storage (section 10.3).

### 6.3. Keyboard shortcuts

| Keys                      | Action                                         |
| ------------------------- | ---------------------------------------------- |
| Mod+N / Mod+O             | New book / Open                                |
| Mod+S / Mod+Shift+S       | Save / Save as                                 |
| Mod+E                     | Export EPUB                                    |
| Mod+\                     | Show/hide sidebar                              |
| Mod+Shift+E / Mod+Shift+F | Explorer / Search across book                  |
| Mod+1 / 2 / 3             | Text / Split / Preview                         |
| Mod+B / Mod+I             | Bold `**` / italic `*`                         |
| Mod+Alt+F                 | Footnote                                       |
| Mod+F                     | Find and replace in chapter                    |
| Mod+Alt+Enter             | Replace all (in Search view)                   |
| Alt+↑ / Alt+↓             | Move selected chapter (in Explorer)            |
| Delete                    | Delete selected chapter or image (in Explorer) |

## 7. Editor and preview

### 7.1. Parsing and diagnostics (`useNovlangParse`)

- Each change is immediately written to the store (`revision++`).
- 150 ms after the last change, one `parse()` is executed. Its result updates
  the preview, editor diagnostics (`setDiagnostics` from `@codemirror/lint`,
  without built-in `linter`), and the ⚠ counter.
- When opening a project, all chapters are parsed (for the counter and marks
  in the Explorer).
- Diagnostic position: `line` → line offset + block prefix width; the fragment
  is underlined to the end of the word. Diagnostics without `position` — in
  the list only.

### 7.2. SourceEditor (CodeMirror 6)

- Highlighting — custom line-by-line `StreamLanguage`, markup markers muted.
  Highlighting is purely visual; the parser determines markup definitively.
- Proportional font, soft wrap, no line numbers, `spellcheck="true"`,
  `lang = book.metadata.language`. On Linux (WebKitGTK), spell checking is
  best effort.
- `Map<chapterId, EditorState>`: each chapter has its own undo history. State
  is created when the chapter is first opened and lives in memory only.
- Commands: Mod+B / Mod+I wrap selection in `**` / `*` (or unwrap); Mod+Alt+F
  inserts `[^N]` at cursor position (N — next free number in the chapter) and
  `[^N]: ` at the end of the chapter, cursor moves there; Mod+F — standard
  CodeMirror search panel.

### 7.3. PreviewPane

- `<iframe sandbox="allow-same-origin">`, scripts forbidden. iframe is created
  once via `srcdoc`; CSP is set with `<meta>` inside srcdoc:
  `default-src 'none'; img-src blob:; style-src 'unsafe-inline'`. Then only
  `body.innerHTML` is updated.
- HTML — `renderToHTML` (HTML mode). Styles: `theme.css` + `custom.css` +
  `preview.css` (column ~36em, serif font). Footnotes are shown as in the
  EPUB: `a.noteref` numbers in the text and `div.endnote` blocks at the
  bottom of the chapter (`preview-notes.ts`, same markup classes as
  `notes.xhtml`, numbering continues across the book); clicking a number
  scrolls to the note and the note's backlink scrolls back.
- `images/…` are replaced with `blob:` URLs; URLs are cached and freed when
  resources are deleted and the project is closed. `url(images/…)` in
  `custom.css` are rewritten the same way.
- Scroll is synchronized proportionally (exact synchronization hindered by
  lack of positions in AST).

### 7.4. WarningsPopover

Clicking ⚠ opens a list of two groups: "This chapter" (NovLang diagnostics)
and "Book" (`services/checks`: no chapter heading, link to missing image,
empty book title, no cover, read warnings). Clicking an item opens the chapter
at the right line. Counter is the sum across the book.

### 7.5. Content header and formatting toolbar

Above source and preview (`chapter` and `css` views) there is one header row:
breadcrumbs on the left and the formatting toolbar (`FormatToolbar`) after
them. Buttons: bold (Mod+B), italic (Mod+I), footnote (Mod+Alt+F); the rest
in the "more" menu: chapter heading, quote, scene break, insert image
(`ImagePickerPopover`: existing image or a file); undo / redo (Mod+Z,
Mod+Shift+Z); find in chapter (Mod+F). Bold and italic show a pressed state
for the selection; the toolbar is disabled when no chapter is open. The
commands live in `editor-commands.ts`.

## 8. Sidebar

### 8.1. Explorer

Collapsible sections:

- **Book:** "Metadata", "Styles" — the book's `custom.css` (if the file does
  not exist — "Styles (create)") and "Images" (counter) — opens the image
  gallery (9.4). There is no separate "Images" section any more.
- **Chapters** (counter in header, "+" on hover): number and title; chapter
  without heading — "Chapter N" in italics; chapters with warnings have yellow
  title and warning count. Navigation ↑/↓/Enter, reordering with drag&drop
  and Alt+↑/↓. Context menu: "New chapter after", "Delete".
  Context menu is a custom `common/ContextMenu` component (HTML).

### 8.2. Search across book

- Logic — pure functions in `services/search/` over `Book`; UI —
  `useBookSearch`, `SearchView`, `SearchResultItem`.
- Search field with options: Aa (case), "whole word" (boundaries via
  `\p{L}\p{N}_`, flag `u`), `.*` (regex; on error — "Invalid regex").
- Chevron button reveals replace field. With non-empty replace, results show
  preview ~~was~~ **became**; in regex mode `$1` works.
- Summary "N results in M chapters". Results grouped by chapters (number,
  title, count), groups are collapsible.
- Actions: click result opens chapter and highlights match; "Replace" (one
  match), "Replace all in chapter", "Replace all" (Mod+Alt+Enter), "Hide"
  (match or group).
- Matches in the current chapter are highlighted in the editor while the
  Search view is open.
- Replace is applied as transactions to `EditorState` of each affected
  chapter (state is created for unopened chapters). Mod+Z in a chapter undoes
  replace in that chapter only. Notification "Replaced N in M chapters · Undo"
  (section 9.5) reverts all chapters if no new edits were made over the
  replacement; otherwise "Undo" button is inactive.

## 9. Chapters, metadata, images, styles

### 9.1. Operations

Pure functions in `services/book/`: `addChapter`, `removeChapter`,
`moveChapter`, `updateMetadata`, `importImage`, `removeResource`, `setCover`,
`setCustomCss`. `projectStore` actions call them, increment `revision++`, and
mark changed/deleted chapters and resources for autosave.

### 9.2. Chapters

- "+" adds a chapter at the end with text `# Chapter N` (localized) and opens
  it with cursor at the end; "New chapter after" inserts after the selected
  chapter.
- Deletion — section 9.5.

### 9.3. Metadata (`MetadataForm`, central area)

| Field                   | Behavior                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Title                   | Empty → book warning                                                                   |
| Version                 | Free text, hint "e.g., ch. 1–150"                                                      |
| Language                | `LanguageCombobox`: list of common + free input, check `Intl.getCanonicalLocales`      |
| Authors, translators    | `ContributorsList`: rows, "+", delete, ↑/↓                                             |
| Series                  | Name + number; number available only if name is set                                    |
| Description             | Plain text, paragraphs separated by blank line                                         |
| Cover                   | `CoverPicker`: thumbnail, "Choose…", file drop, "Remove"; hint "recommended 1600×2560" |
| UUID, created, modified | Read-only; UUID can be copied                                                          |

Each change goes to the store immediately; validation errors — below the field.

### 9.4. Images

- **Import** (`services/book/importImage(book, fileName, bytes)`): type is
  determined by byte signature (JPEG, PNG, GIF, WebP; else — error "Format
  not supported"). Name is cleaned (Latin, digits, `-`), on name collision
  suffix `-2`, `-3`… is added; on SHA-256 match (`crypto.subtle`) existing
  file is used.
- **Sources** (`useImageImport`): the gallery's "Add…" button (file picker),
  drag&drop files into editor, paste from clipboard (name
  `pasted-YYYYMMDD-HHmmss.png`). At cursor position, a separate paragraph
  `![](images/x.png)` is inserted, cursor is placed inside `[]`.
- **Gallery** (`components/images/ImageGallery`, opened from Explorer →
  Book → Images): tiles with thumbnails, filter All / Used / Unused, cover is
  marked, unused are marked. "+" adds files; files can be dropped on it.
  - Selection: long press selects a tile, dragging extends the range;
    Mod-click toggles, Shift-click selects a range; Mod+A selects all, Esc
    clears. The selection is limited to the images currently shown: switching
    the filter drops the hidden ones.
  - Delete / Backspace and the Delete button of the selection bar act on the
    selection (or on the focused tile). A batch delete is one undo
    notification.
  - Batch rename (`RenameImagesDialog`, `services/book/rename-resources`):
    names become `<name>_<NN>.<ext>`, `NN` is padded to the width of the
    selection count and follows the **selection order**. References are
    rewritten in chapters (`![](images/…)`), in the cover and in `custom.css`
    `url(...)`. One undo; it is refused (disabled) if an original name was
    taken again in the meantime. Image names may now contain `_`.
- **ImageView:** image, dimensions in pixels, size, list of chapters where
  it is used (click opens chapter). Context menu actions (insert in text,
  make cover, find uses, delete) are available from the gallery tiles.
- Cover is chosen in `CoverPicker` or via "Make cover".
- Rename is in scope since 2026-10-03 (batch only, see Gallery above).

### 9.5. Deletion and "Undo" notifications

- **Confirmation:** `ConfirmDialog` "Delete chapter «…»?" with details (word
  count; for image — which chapters use it) and "Don't ask again" checkbox
  (`settings.confirmDelete = false`; toggled back in Settings). Focus on
  "Delete", Esc — cancel.
- **Deletion happens immediately**, copy (and position) is stored in memory.
  If the selected item is deleted, an adjacent item is opened.
- **Notification** (`common/UndoToast`, queue in `stores/notifications.ts`):
  "Chapter «…» deleted · Undo · ✕".
  - Appear and disappear with bounce (`cubic-bezier(.34,1.56,.64,1)` on enter,
    `cubic-bezier(.36,0,.66,-.56)` on exit).
  - Below, a progress bar of remaining time (8 s by default); at the end of
    the bar, a bright glowing dot that fades and shrinks with progress.
  - Timer is CSS animation itself: notification closes on `animationend` of
    the bar. Pause on hover and when window is not focused
    (`animation-play-state`).
  - No more than 3 notifications in a stack; on the 4th, the oldest closes.
  - `prefers-reduced-motion` → simple fade.
- "Undo" returns the item to its place and briefly highlights it. Save
  performed while the notification is visible does not interfere with undo
  (the book becomes unsaved again).
- The same component is used for "Replace all", "EPUB saved · Show in folder",
  and background errors (with or without bar — a parameter).

### 9.6. custom.css

- Clicking "Styles (create)" creates a file from a commented template
  (which NovLang classes are styled, how footnotes work) and opens it.
- `CssEditor`: CodeMirror + `@codemirror/lang-css`, monospace font, line
  numbers. Text / Split / Preview modes work: preview shows the last opened
  chapter with new styles (debounced update).
- Delete `custom.css` from the item's context menu (same confirmation and
  undo mechanism).

## 10. File scenarios, save, recovery

### 10.1. Project state

`stores/project.ts`: `{ book, filePath, revision, savedRevision, fileMtime,
saving }`, `dirty = revision !== savedRevision`. One window — one project.

### 10.2. Scenarios

- **useUnsavedGuard** — before "New", "Open", window close, open from OS:
  "Save / Don't save / Cancel". If save fails, the action is cancelled.
- **New book (Mod+N):** guard → book in memory, `filePath = null`.
- **Open (Mod+O):** guard → `*.edb` dialog → `readEdb`. Fatal error — dialog,
  current project unchanged. Path is added to "Recent".
- **Save (Mod+S):** if no changes, writes nothing; if no path → "Save as".
  If file mtime changed since open/save — "File modified by another program.
  Overwrite?". Then `writeEdb` → `write_file_atomic` → `savedRevision` =
  revision at start of serialization → delete recovery session. Repeated Mod+S
  during write is ignored. On error — message, `dirty` remains.
- **Save as (Mod+Shift+S):** dialog with name `{title}.edb`.
- **Window close:** `onCloseRequested` → guard → delete recovery session.
- **Open from OS** (`.edb` association): if app is already running,
  `tauri-plugin-single-instance` forwards the path to the window; on macOS
  path comes via `RunEvent::Opened`. Rust puts paths in a queue; frontend
  takes it with `take_pending_open_paths` command after mount, then listens
  to `open-paths` event. Then guard → "Open".
- **Atomic write:** Rust command `write_file_atomic(path, bytes)`: temp file
  nearby → `sync_all` → rename (on Windows — replace with retry on temporary
  lock). Path is checked against fs-scope.
- **File access between sessions:** `tauri-plugin-persisted-scope`; paths from
  OS, Rust adds to scope.

### 10.3. Autosave (IndexedDB)

- `services/platform/recovery.ts` implements `RecoveryStore`, wrapper over
  `idb`, database `edb-recovery`:
  - `sessions` [bookId] → `{ originalPath, title, version, updatedAt, metadata, chapterOrder, customCss }`
  - `chapters` [bookId, chapterId] → `source`
  - `resources` [bookId, path] → `{ bytes, mediaType }`
- Writing is incremental: store maintains sets of changed/deleted chapters and
  resources, autosave writes only them in one transaction. First autosave after
  opening writes the entire book.
- Frequency: while `dirty` — 5 s after edit pause, but no less than once per
  30 s.
- Session is deleted after successful save, "Don't save", window close, project
  switch.
- **Start:** WelcomeView shows "Unsaved changes" ("Recover" → book from session,
  `filePath = originalPath`, `dirty = true`; "Delete"). When opening `.edb`
  for which a session exists whose `updatedAt` is newer than the file mtime,
  recovery is offered.
- Corrupted session is deleted, error is logged.
- Write error (e.g., quota) — notification once per session, attempts continue.
- Limitations: data is available to the app only, tied to WebView origin;
  dev and prod don't overlap.

## 11. EPUB export

### 11.1. API

```ts
buildEpub(book: Book, options: ExportOptions, deps: {
  imageProcessor: ImageProcessor
  now: () => Date
  onProgress?: (p: { stage: 'chapters' | 'images' | 'zip'; done: number; total: number }) => void
  signal?: AbortSignal
}): Promise<Uint8Array>

interface ExportOptions {
  imagePreset: 'kindle-paperwhite' | 'original'
  grayscale: boolean
  titlePage: boolean
  versionInTitle: boolean
}
```

- Works on a `Book` snapshot (arrays are copied, resource bytes are immutable
  and not copied) — editing can happen during export. Export does not change
  `dirty` and does not require saving.
- Modules: `resources.ts` (image plan, path map), `chapter.ts`,
  `titlePage.ts`, `opf.ts`, `nav.ts`, `ncx.ts`, `container.ts`, `zip.ts`,
  `fileName.ts`, `labels.ts` (labels in book language).

### 11.2. Archive structure

```
mimetype                   first, STORE, no extra fields
META-INF/container.xml
OEBPS/content.opf
OEBPS/nav.xhtml
OEBPS/toc.ncx
OEBPS/theme.css
OEBPS/custom.css           if present
OEBPS/title.xhtml          if title page enabled
OEBPS/c-<id>.xhtml         one file per chapter
OEBPS/notes.xhtml          endnotes, only if any chapter has a note
OEBPS/images/…
```

Structure is flat, so paths `images/x.png` from markup and `custom.css` work
without rewriting. Zip is deterministic (order, date).

### 11.3. Chapters

1. `parse(source)`.
2. Walk AST, `image` nodes: `src` changes by path map (if optimization changed
   format — extension changes); link to missing image — node is deleted (warning
   already in editor).
3. `renderToHTML(document, { xhtmlMode: true })`.
4. Template: XML declaration, `<html xmlns xmlns:epub xml:lang lang>`,
   `<title>`, links to `theme.css` and `custom.css`,
   `<body><section epub:type="chapter" role="doc-chapter">…</section></body>`.
5. XML validation via `XMLValidator.validate` (`fast-xml-parser`). Error is
   fatal: "Chapter N «…»: invalid XHTML (line, column)".

**Footnotes are endnotes.** `[^id]` references become
`<sup><a epub:type="noteref" class="noteref" id="fnref-N" href="notes.xhtml#fn-N">N</a></sup>`
(`id` only on the first reference to a note). Numbering is sequential across
the whole book, not per chapter. Definitions are moved out of the chapter into
`notes.xhtml`, grouped by chapter (a heading linking to the chapter); each
note is a `div.endnote` (`epub:type="endnote"`, `id="fn-N"`) whose first
paragraph starts with a backlink `a.endnote-backlink` (`N.` →
`c-<id>.xhtml#fnref-N`); a note that is never referenced gets a plain number
instead. `notes.xhtml` is **last in the spine** and in nav and ncx. Reason:
Calibre's MOBI conversion and Kindle never showed hidden `aside` footnotes,
whereas internal links to a notes page become popups on Kindle.

Chapter without `# heading` gets "Chapter N" only in `<title>` and TOC;
heading is not inserted in text.

### 11.4. Title page

If `options.titlePage`: `title.xhtml` first in spine, `<section
epub:type="titlepage">`. Content: title, authors, translators, series and
number, version, description (paragraphs by blank lines). Labels ("Translator",
"Series", "Version") — in **book** language from `labels.ts` (ru / en / zh;
for other languages — en).

### 11.5. content.opf

- `dc:identifier id="bookid"` = `urn:uuid:…` (does not change between versions).
- `dc:title` = title, or "Title (version)" if `versionInTitle` and version
  is set.
- `dc:language`; `dc:creator` for each author with
  `<meta refines property="role" scheme="marc:relators">aut</meta>`;
  `dc:contributor` for translators with role `trl`.
- `dc:description` — description.
- `<meta property="dcterms:modified">` = export moment (UTC, seconds).
- Series: `<meta property="belongs-to-collection" id="series">` +
  `collection-type = series` + `group-position`; additionally
  `<meta name="calibre:series">` and `<meta name="calibre:series_index">`.
- Cover: resource with `properties="cover-image"` and `<meta name="cover"
content="…">`. No separate cover page.
- Manifest: all archive files; `nav.xhtml` with `properties="nav"`; `toc.ncx`
  in `<spine toc="ncx">`.
- Spine: `title.xhtml` (if present), then chapters in order. `nav.xhtml` not
  in spine.

### 11.6. Navigation

- `nav.xhtml`: `<nav epub:type="toc">` — flat chapter list, followed by the
  notes page (localized title) when `notes.xhtml` exists; `<nav
epub:type="landmarks">` — `titlepage` (if present) and `bodymatter` (first
  chapter).
- `toc.ncx`: same list (with the notes page) for old readers and Calibre, `dtb:uid` = `book.id`.

### 11.7. theme.css

- No `font-family` or font size on `body` — reader controls them.
- `p { margin: 0; text-indent: 1.5em }`; first paragraph after heading and
  scene break without indent.
- `h1` centered, with margins in `em`.
- `p.novlang-scene-break` centered, no indent, vertical margins.
- `blockquote` — left rule `border-left: 0.2em solid` without a colour (the border takes the text colour, so night modes invert it too), `padding-left: 1em`, no right margin.
- `img { max-width: 100%; height: auto }`, paragraph with single image centered.
- Footnotes are **endnotes** (2026-10-03), so there is no `aside` rule. The
  reason: Calibre's MOBI conversion and Kindle never showed the hidden
  `aside` footnotes. Styles for `a.noteref`, `div.endnote`, the backlink and
  the notes page are in `theme.css`, so `custom.css` can restyle them.
- Title page styles.

### 11.8. Images

- Only images used in chapters and the cover go into EPUB.
- Plan (`planImage(meta, options, isCover)` — pure function) determines target
  size and format; execution — `ImageProcessor` (in app — `workers/image.worker.ts`:
  `createImageBitmap` + `OffscreenCanvas`, in tests — processor returning
  bytes unchanged).

| Preset            | Size                                                 | Format                                                                                 |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Kindle Paperwhite | Fit in 1264×1680 (cover — 1600×2560), downscale only | JPEG → JPEG q85; PNG → PNG; GIF → PNG (first frame); WebP → JPEG q85, with alpha → PNG |
| Original          | As is                                                | As is, but WebP converted by rule above                                                |

- "Grayscale" (off by default) — manual pass over `ImageData`
  (`ctx.filter` not supported in Safari).
- Results are cached in memory by key SHA-256 + plan params.
- Progress "Images k/N", cancel via `AbortSignal`.

### 11.9. File name

`{title} ({version}).epub` or `{title}.epub`. Characters `<>:"/\|?*` and
control characters replaced with `_`, leading/trailing spaces and dots trimmed,
Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`LPT9`) get prefix
`_`, length up to 120 characters.

### 11.10. ExportDialog (Mod+E)

1. Summary of book warnings with "Show" link (do not block export).
2. Image preset and "Grayscale".
3. ☑ "Title page" (on by default).
4. ☑ "Add version to title" (available if version is set, on by default).
5. File name preview.
6. "Export…" → save dialog (last export folder remembered) → progress with
   "Cancel" → `write_file_atomic` → notification "EPUB saved · Show in folder"
   (`revealItemInDir` from opener).

Selected options 2–4 are remembered in app settings.

## 12. Errors and logging

### 12.1. Errors

- `types/errors.ts`: `AppError { code, params?, cause? }`; text — key
  `errors.<code>` in locales. Example codes: `edb.notZip`,
  `edb.noManifest`, `edb.badJson`, `edb.foreignFormat`, `edb.tooNew`,
  `fs.notFound`, `fs.permissionDenied`, `fs.diskFull`, `export.invalidXhtml`,
  `image.unsupported`, `recovery.writeFailed`.
- Rust commands return serializable error `{ code, message }` (`thiserror` +
  `serde`); `services/platform` translates it to `AppError`.
- User action errors (open, save, export) — dialog. Background errors
  (autosave, worker) — notification.
- Unexpected errors: `app.config.errorHandler`, `window.onerror`,
  `unhandledrejection` → log + notification "Error occurred · Details".
  "Details" shows text with buttons "Copy", "Log folder", "Report error" (opens
  new GitHub issue with version, OS, and stack; book text not sent).
- No telemetry.

### 12.2. Logs

- `tauri-plugin-log`: file in system log folder with size rotation; in dev —
  also stdout.
- Frontend writes via `services/platform/logger.ts` (interface `Logger`).
- Level: info in prod, debug in dev.
- Logged: startup (version, OS), open/save/export (duration, chapter and image
  count, warning count), errors with stack. Book text not logged.

## 13. Settings, updates, platform details

### 13.1. App settings

`stores/settings.ts`, storage — `tauri-plugin-store` (`settings.json` in
app config folder) via `services/platform/settings.ts`.

| Key                                                                                                     | Default                                              |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `locale`                                                                                                | OS locale (ru / en / zh-CN, else en)                 |
| `layout.sidebarVisible`, `layout.sidebarWidth`, `layout.splitRatio`, `layout.mode`, `layout.activeView` | `true`, 250, 0.5, `split`, `explorer`                |
| `recentFiles`                                                                                           | `[]` (up to 10)                                      |
| `confirmDelete`                                                                                         | `true`                                               |
| `export.imagePreset`, `export.grayscale`, `export.titlePage`, `export.versionInTitle`, `export.lastDir` | `kindle-paperwhite`, `false`, `true`, `true`, `null` |
| `updates.lastCheckedAt`                                                                                 | `null`                                               |

`SettingsView` (⚙ on activity panel): UI language, "Confirm deletion", "Check
for updates", "Open log folder", app version and repository link.

### 13.2. Update check

On startup (no more than once per day) and via Settings button:
`services/platform/updates.ts` queries the latest release via GitHub API and
compares versions. If newer exists — notification with link to release page.
Network error — log only.

### 13.3. Platform details

- **Drag&drop:** `dragDropEnabled: false` on window. Otherwise HTML5 drag&drop
  doesn't work in WebView on Windows (chapter reordering, image dragging).
  Consequence — opening `.edb` by dragging to window is not supported in v1.
- **App CSP** (`tauri.conf.json`): `default-src 'self'; img-src 'self'
blob: data:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:;
connect-src ipc: http://ipc.localhost https://api.github.com`.
- **File association:** `bundle.fileAssociations` for `.edb`.
- Window: minimum size ~900×560.
- **Minimum OS:** macOS 12 (`bundle.macOS.minimumSystemVersion`),
  Windows 10 (WebView2), Linux with WebKitGTK 4.1 level ubuntu-22.04.
  Confirmed by prototype 2 (section 17).

## 14. Rust (`src-tauri`)

- Plugin registration: `single-instance` (first), `log`, `window-state`,
  `store`, `dialog`, `fs`, `persisted-scope`, `opener`.
- Commands: `write_file_atomic(path, bytes)`, `take_pending_open_paths()`.
- Handle `RunEvent::Opened` (macOS), launch arguments (Windows/Linux) and
  single-instance callback → path queue + `open-paths` event; paths added to
  fs-scope.
- Narrow capabilities: only needed plugin commands for window `main`; fs —
  read/write in scope, no arbitrary access.
- Command errors — `enum` on `thiserror` with serialization `{ code, message }`.
- Template command `greet` is removed.

## 15. Testing

| Level                 | Tools                                                               | Coverage                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                  | Vitest (node)                                                       | `services/*`, `utils`: `.edb` read/write roundtrip, corrupt fixtures, migrations; `buildEpub` (OPF, nav, ncx, title page, path map, bad image removal, file name); `planImage`; search and replace (case, whole word with Cyrillic, regex with `$1`); book operations; `importImage` (signatures, names, dedup); book checks; key set match ru / en / zh-CN |
| Stores, composables   | Vitest + platform fakes, `fake-indexeddb`, fake timers              | dirty/revision, guard, autosave (incremental, frequency), recovery, deletion with undo, notifications                                                                                                                                                                                                                                                       |
| Components (selected) | @vue/test-utils + happy-dom                                         | ContributorsList, UndoToast (close on `animationend`, pause), ExportDialog, unsaved changes dialog, ConfirmDialog with "Don't ask again"                                                                                                                                                                                                                    |
| Editor commands       | Vitest + `EditorState` without view                                 | bold/italic, footnote, replace across book with undo history                                                                                                                                                                                                                                                                                                |
| e2e                   | Playwright against `vite --mode e2e` (Chromium, in-memory platform) | new book → text → save → open → search and replace → delete and undo → export                                                                                                                                                                                                                                                                               |
| EPUB                  | `scripts/build-fixture-epubs` + epubcheck (Java, pinned version)    | test books: series, translators, footnotes, images, cover, chapter without heading, title page; any errors and warnings fail CI                                                                                                                                                                                                                             |
| Rust                  | `cargo test`                                                        | `write_file_atomic` (replace existing file, refuse outside scope), path queue                                                                                                                                                                                                                                                                               |
| Real WebView          | manual checklist `docs/release-checklist.md`                        | run on 3 OS, open from OS, drag&drop, paste image from clipboard, export with optimization, EPUB check on Kindle via Send to Kindle                                                                                                                                                                                                                         |

## 16. CI and releases

### 16.1. `ci.yml` (pull request and push)

- **ubuntu:** pnpm install with cache → `vue-tsc --noEmit` → Oxlint
  (including import boundaries) → `pnpm format:check` → Vitest with coverage
  → build test EPUBs + epubcheck → Playwright.
- **Rust, matrix ubuntu / macOS / windows:** `cargo fmt --check`,
  `cargo clippy -- -D warnings`, `cargo test`.
- Dependabot (or Renovate) weekly, updates in groups (npm, cargo, actions).

### 16.2. `release.yml` (tag `v*`)

- `tauri-apps/tauri-action`, matrix:
  - macOS: universal (`universal-apple-darwin`), `.dmg`;
  - Windows: NSIS `.exe`;
  - ubuntu-22.04 (old glibc for compatibility): AppImage, `.deb`, `.rpm`.
- GitHub Release draft with artifacts; notes from `CHANGELOG.md`.
- Version in one place: `package.json`; `tauri.conf.json` references it
  (`"version": "../package.json"`), `Cargo.toml` synced by release script.
- **Signing:** in v1 builds are not signed or notarized. In `release.yml`
  signing steps (Apple, Windows) are present and run only if secrets exist.
  README contains first-run instructions: macOS — "System Settings →
  Privacy and Security → Open Anyway"; Windows — SmartScreen "More info →
  Run anyway".

## 17. Risks and first-priority prototypes

The first plan tasks are short prototypes whose results may change implementation
details:

1. **fs-scope + `write_file_atomic` + persisted-scope:** write to path from
   dialog, path from OS, and after restart; scope check in Rust command.
2. **Images in worker:** `createImageBitmap` + `OffscreenCanvas` 2D +
   `convertToBlob` in WKWebView (macOS 12), WebView2, and
   WebKitGTK (ubuntu-22.04). Fallback — Rust command on crate `image` with
   same `ImageProcessor` interface.
3. **HTML5 drag&drop and paste images from clipboard** with `dragDropEnabled:
false` on three OS.
4. **Send to Kindle:** test EPUB (footnotes, images, series, title page)
   accepted and displays correctly on Paperwhite.

Known limitations: spell check on Linux is best effort; preview scroll
synchronization is approximate.

## 18. Roadmap (after v1)

Separate specs written on 2026-10-03 from the user feedback session; not
scheduled, no implementation plans yet:

- `docs/superpowers/specs/2026-10-03-azw3-export-design.md` — AZW3 export.
- `docs/superpowers/specs/2026-10-03-kindle-css-checker-design.md` — Kindle
  CSS checker for `custom.css`.
