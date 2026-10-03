# User Feedback Fixes (2026-10-03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the problems the user found on 2026-10-03: footnotes that do not work on Kindle, the broken cover thumbnail, the uncoloured CSS editor and the half-empty Settings page. Add a formatting toolbar and replace the Explorer's image list with a gallery that supports multi-select, batch delete and batch rename.

**Architecture:** Footnotes move out of the chapter flow into one `notes.xhtml` at the end of the book, with book-wide numbering and links in both directions. Pure helpers in `services/epub/footnotes.ts` serve both the EPUB build and the preview. UI work follows the existing patterns. Editor commands are pure functions over `EditorState`. Book changes are pure `BookMutation` builders in `services/book/`. Delete and rename get undo toasts through `stores/notifications`. The content header (breadcrumbs plus toolbar) becomes one row over source and preview, rendered through a new `header` slot in `ResizableSplit`.

**Tech Stack:** Vue 3, TypeScript, Pinia, CodeMirror 6 (`@codemirror/*`, `@lezer/highlight`), Tailwind CSS 4 (container queries), shadcn-vue on Reka UI, `@tabler/icons-vue`, novlang-js 0.1.1, JSZip, Vitest + @testing-library/vue + happy-dom, Playwright, Oxfmt, Oxlint.

**Spec:** `docs/superpowers/notes/2026-10-03-issues.md` (items 1, 3, 4, 5, 6, 7; items 2 and 4a are roadmap and have their own specs). Base spec: `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`.

## Global Constraints

- Every task ends with `pnpm check` passing (vue-tsc, Oxlint, `oxfmt --check`, Vitest). Tasks that touch layout also run `pnpm test:e2e`. No task commits red.
- `services/**` and `utils/**` import nothing from `vue`, `pinia` or `@tauri-apps/*` (enforced by Oxlint `no-restricted-imports`).
- Every user-visible string exists in all three locales: `src/locales/{ru,en,zh-CN}.json`. `src/plugins/__tests__/i18n.test.ts` fails on a missing key.
- Icons come from `@tabler/icons-vue`. Icon-only controls have an accessible name. Decorative icons carry `aria-hidden="true"`.
- `src/assets/style.css` keeps its shape: only `@import`s, `@theme inline`, `:root`, `.dark` and `@layer base`. New tokens go into `:root` and `.dark`.
- Image file names: lowercase Latin letters, digits, `_` and `-` only.
- Batch rename produces `<name>_<index>.<original extension>`. The index is zero-padded to `String(count).length` digits (1–9 → `1`, 10–99 → `01`, 100–999 → `001`). Indices follow selection order.
- Footnote numbers are sequential across the whole book (decided in this plan; item 1 left it open with sequential as the proposal). The EPUB and the preview show the same numbers.
- Size constraints stay as they are: sidebar 160–400 px, source and preview at least 240 px, activity bar 48 px.
- Each task commits on a feature branch `fix/user-feedback-2026-10-03`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A footnote referenced twice in a chapter must produce one note, two links to it and exactly one `id="fnref-N"` (duplicate ids break epubcheck). Task 1 pins this.
- A footnote definition that no text references must still appear on the notes page, but without a backlink to a missing anchor. Tasks 1 and 3 pin this.
- A book with no footnotes must produce no `notes.xhtml` and no TOC entry for it. Task 3 pins this.
- Renaming must update references in every chapter, the cover and `url(...)` in custom.css, and must not touch an image that merely shares a name prefix (`a.png` vs `aa.png`). Task 15 pins this.
- Pressing Mod+Z in a chapter after a batch rename must not bring back a reference to a file that no longer exists. Task 15 pins this.

## File Structure

| Area | Files | Responsibility |
| --- | --- | --- |
| Footnotes | `src/services/epub/footnotes.ts` (new) | pull definitions out of a NovLang document, number references, swap markers for links |
| EPUB | `src/services/epub/{chapter,notes(new),opf,nav,ncx,build,labels}.ts`, `src/assets/epub/{theme,custom}.css.ts` | chapter XHTML with note links, `notes.xhtml`, packaging |
| Preview | `src/components/editor/{PreviewPane.vue,preview-notes.ts(new)}` | preview with notes at the chapter end |
| Cover | `src/components/metadata/CoverPicker.vue`, `src/components/editor/ImageView.vue` | thumbnail geometry, real aspect ratio, size hint |
| CSS editor | `src/components/editor/{CssEditor.vue,css-language.ts(new)}`, `src/assets/style.css` | highlighting and editing aids |
| Settings | `src/components/settings/SettingsView.vue` | two-column layout |
| Header | `src/components/layout/{ResizableSplit,Breadcrumbs,ContentHeader(new)}.vue`, `src/views/EditorView.vue` | one header row over the content area |
| Toolbar | `src/components/editor/{editor-commands.ts,FormatToolbar.vue(new),ImagePickerPopover.vue(new)}` | formatting commands and their buttons |
| Images | `src/components/images/{ImageGallery,ImageTile,RenameImagesDialog}.vue` (new), `src/components/images/gallery-selection.ts` (new), `src/composables/{use-resource-urls,use-long-press-select,use-image-actions}.ts` (new) | gallery, selection, delete, rename |
| Book ops | `src/services/book/{resources,rename-resources(new)}.ts`, `src/utils/paths.ts` | `removeResources`, rename planning and application, file name rules |
| Explorer | `src/components/sidebar/ExplorerView.vue`, `src/stores/layout.ts` | Images entry under Book, `center.kind = "images"` |
| Docs | spec, `AGENTS.md`, `docs/release-checklist.md` | record the changed decisions |

---

### Task 1: Footnote extraction helpers

**Files:**
- Create: `src/services/epub/footnotes.ts`
- Test: `src/services/epub/__tests__/footnotes.test.ts`

**Interfaces:**
- Consumes: `parse`, `NovLangDocument`, `BlockNode`, `InlineNode` from `novlang-js`.
- Produces:
  - `interface ExtractedNote { number: number; label: string; referenced: boolean; children: BlockNode[] }`
  - `interface FootnoteExtraction { document: NovLangDocument; notes: ExtractedNote[] }`
  - `extractFootnotes(document: NovLangDocument, firstNumber?: number): FootnoteExtraction`
  - `replaceNoteMarkers(html: string, link: (number: number, first: boolean) => string): string`
  - `prependToFirstParagraph(html: string, prefix: string): string`
  - `countFootnotes(document: NovLangDocument): number`

- [ ] **Step 1: Create the branch**

```bash
git switch -c fix/user-feedback-2026-10-03
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/services/epub/__tests__/footnotes.test.ts
import { describe, expect, it } from "vitest";
import { parse, renderToHTML } from "novlang-js";
import {
  countFootnotes,
  extractFootnotes,
  prependToFirstParagraph,
  replaceNoteMarkers,
} from "@/services/epub/footnotes";

const link = (n: number, first: boolean) => `<a${first ? ` id="r${n}"` : ""}>${n}</a>`;
const render = (source: string, first = 1) => {
  const result = extractFootnotes(parse(source).document, first);
  return { ...result, html: replaceNoteMarkers(renderToHTML(result.document), link) };
};

describe("extractFootnotes", () => {
  it("removes definitions from the flow and numbers references in reading order", () => {
    const { html, notes } = render("A[^x] B[^y]\n\n[^y]: Why\n\n[^x]: Ex", 5);
    expect(html).toBe('<p>A<a id="r5">5</a> B<a id="r6">6</a></p>');
    expect(notes.map((n) => [n.number, n.label, n.referenced])).toEqual([
      [5, "x", true],
      [6, "y", true],
    ]);
    expect(renderToHTML({ type: "document", children: notes[0]!.children })).toBe("<p>Ex</p>");
  });

  it("gives a repeated reference the same number and marks only the first", () => {
    const { html, notes } = render("A[^1] B[^1]\n\n[^1]: One");
    expect(html).toBe('<p>A<a id="r1">1</a> B<a>1</a></p>');
    expect(notes).toHaveLength(1);
  });

  it("numbers unreferenced definitions after referenced ones", () => {
    const { notes } = render("A\n\n[^lost]: Nobody points here");
    expect(notes).toEqual([
      expect.objectContaining({ number: 1, label: "lost", referenced: false }),
    ]);
  });

  it("leaves unresolved references to the renderer", () => {
    expect(render("A[^missing]").html).toBe("<p>A<sup>[missing]</sup></p>");
  });

  it("strips private-use marker characters typed by the author", () => {
    expect(render("A\uE0007\uE001").html).toBe("<p>A7</p>");
  });

  it("turns references inside a note into plain text", () => {
    const { notes } = render("A[^1]\n\n[^1]: See[^1]");
    expect(renderToHTML({ type: "document", children: notes[0]!.children })).toBe(
      "<p>See[1]</p>",
    );
  });
});

describe("helpers", () => {
  it("prepends inside the first paragraph, or adds one", () => {
    expect(prependToFirstParagraph("<p>Text</p>", "<b>1</b> ")).toBe("<p><b>1</b> Text</p>");
    expect(prependToFirstParagraph("<blockquote>\n<p>Q</p>\n</blockquote>", "1.")).toBe(
      "<p>1.</p>\n<blockquote>\n<p>Q</p>\n</blockquote>",
    );
  });

  it("counts unique definitions", () => {
    expect(countFootnotes(parse("A[^1]\n\n[^1]: a\n\n[^2]: b").document)).toBe(2);
  });
});
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `pnpm vitest run src/services/epub/__tests__/footnotes.test.ts`
Expected: FAIL, `Failed to resolve import "@/services/epub/footnotes"`.

- [ ] **Step 4: Implement**

```ts
// src/services/epub/footnotes.ts
import type { BlockNode, InlineNode, NovLangDocument } from "novlang-js";

/**
 * Private-use characters that bracket a note number in rendered HTML until
 * replaceNoteMarkers swaps them for a link. novlang-js renders footnote
 * references itself and cannot be told where the note lives, so references
 * travel through the renderer as marked text instead.
 */
const OPEN = "\uE000";
const CLOSE = "\uE001";
const MARKER_CHARS = /[\uE000\uE001]/g;
const MARKER = /\uE000(\d+)\uE001/g;

export interface ExtractedNote {
  number: number;
  /** The id the author wrote: `1` in `[^1]`. */
  label: string;
  /** False when no text points at the note, so it must not get a backlink. */
  referenced: boolean;
  children: BlockNode[];
}

export interface FootnoteExtraction {
  /** The chapter without its footnote definitions, references replaced by markers. */
  document: NovLangDocument;
  notes: ExtractedNote[];
}

export function extractFootnotes(document: NovLangDocument, firstNumber = 1): FootnoteExtraction {
  const definitions = new Map<string, BlockNode[]>();
  const body: BlockNode[] = [];
  for (const node of document.children) {
    if (node.type !== "footnoteDef") body.push(node);
    else if (!definitions.has(node.id)) definitions.set(node.id, node.children);
  }
  const numbers = new Map<string, number>();
  const referenced = new Set<string>();
  let next = firstNumber;
  const numberFor = (label: string) => {
    let number = numbers.get(label);
    if (number === undefined) {
      number = next++;
      numbers.set(label, number);
    }
    return number;
  };

  const mapInline =
    (inNote: boolean) =>
    (node: InlineNode): InlineNode => {
      if (node.type === "text") return { ...node, value: node.value.replace(MARKER_CHARS, "") };
      if (node.type === "emphasis" || node.type === "strong")
        return { ...node, children: node.children.map(mapInline(inNote)) };
      if (node.type === "footnoteRef" && node.resolved && definitions.has(node.id)) {
        if (inNote) return { type: "text", value: `[${node.id}]` };
        referenced.add(node.id);
        return { type: "text", value: `${OPEN}${numberFor(node.id)}${CLOSE}` };
      }
      return node;
    };
  const mapBlock =
    (inNote: boolean) =>
    (node: BlockNode): BlockNode => {
      if (node.type === "heading" || node.type === "paragraph")
        return { ...node, children: node.children.map(mapInline(inNote)) };
      if (node.type === "blockquote" || node.type === "footnoteDef")
        return { ...node, children: node.children.map(mapBlock(inNote)) };
      return node;
    };

  const children = body.map(mapBlock(false));
  for (const label of definitions.keys()) numberFor(label);
  const notes = [...numbers].map(([label, number]) => ({
    number,
    label,
    referenced: referenced.has(label),
    children: definitions.get(label)!.map(mapBlock(true)),
  }));
  return { document: { ...document, children }, notes };
}

/** Swap each marker for a link; `first` is true once per number, for its anchor id. */
export function replaceNoteMarkers(
  html: string,
  link: (number: number, first: boolean) => string,
): string {
  const seen = new Set<number>();
  return html.replace(MARKER, (_, digits: string) => {
    const number = Number(digits);
    const first = !seen.has(number);
    seen.add(number);
    return link(number, first);
  });
}

/** Kindle opens a note as a popup when the note starts with a link back. */
export function prependToFirstParagraph(html: string, prefix: string): string {
  return html.startsWith("<p>") ? `<p>${prefix}${html.slice(3)}` : `<p>${prefix}</p>\n${html}`;
}

export function countFootnotes(document: NovLangDocument): number {
  return new Set(
    document.children.flatMap((node) => (node.type === "footnoteDef" ? [node.id] : [])),
  ).size;
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `pnpm vitest run src/services/epub/__tests__/footnotes.test.ts`
Expected: PASS, 8 tests. If the unresolved-reference expectation differs, check `novlang-js` `renderInlineNode` (`<sup>[id]</sup>`) and fix the test, not the helper.

- [ ] **Step 6: Commit**

```bash
git add src/services/epub/footnotes.ts src/services/epub/__tests__/footnotes.test.ts
git commit -m "feat(epub): extract and number footnotes outside the chapter flow"
```

---

### Task 2: Chapters link to book-wide endnotes

**Files:**
- Modify: `src/services/epub/chapter.ts` (`RenderedChapter`, `renderChapter`)
- Test: `src/services/epub/__tests__/chapter.test.ts`

**Interfaces:**
- Consumes: `extractFootnotes`, `replaceNoteMarkers` (Task 1).
- Produces:
  - `interface RenderedNote { number: number; referenced: boolean; xhtml: string }`
  - `RenderedChapter` gains `notes: RenderedNote[]`.
  - `renderChapter(chapter, index, book, resourceMap, includeCustomCss = true, firstNoteNumber = 1): RenderedChapter`

- [ ] **Step 1: Write the failing tests** (append to the existing `describe("renderChapter")`)

```ts
  it("moves footnotes out of the chapter and links them to notes.xhtml", () => {
    const result = renderChapter(
      { id: "abc12345", source: "# T\n\nA[^1] and again[^1].\n\n[^1]: Note *text*" },
      0,
      book,
      new Map(),
      true,
      7,
    );
    expect(result.xhtml).not.toContain("<aside");
    expect(result.xhtml).toContain(
      '<sup><a epub:type="noteref" class="noteref" id="fnref-7" href="notes.xhtml#fn-7">7</a></sup>',
    );
    expect(result.xhtml.match(/id="fnref-7"/g)).toHaveLength(1);
    expect(result.xhtml).toContain('href="notes.xhtml#fn-7">7</a></sup>.');
    expect(result.notes).toEqual([
      { number: 7, referenced: true, xhtml: "<p>Note <em>text</em></p>" },
    ]);
  });

  it("keeps images referenced only from a footnote", () => {
    const result = renderChapter(
      { id: "abc12345", source: "A[^1]\n\n[^1]: ![](images/a.png)" },
      0,
      book,
      new Map([["images/a.png", "images/a.jpg"]]),
    );
    expect(result.referencedPaths).toEqual(["images/a.png"]);
    expect(result.notes[0]!.xhtml).toContain('src="images/a.jpg"');
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/services/epub/__tests__/chapter.test.ts`
Expected: FAIL, the chapter still contains `<aside` and `notes` is undefined.

- [ ] **Step 3: Implement** — in `src/services/epub/chapter.ts`:

```ts
import { extractFootnotes, replaceNoteMarkers } from "./footnotes";

export interface RenderedNote {
  number: number;
  referenced: boolean;
  xhtml: string;
}

export interface RenderedChapter {
  id: string;
  title: string;
  xhtml: string;
  referencedPaths: string[];
  notes: RenderedNote[];
}
```

Replace the body of `renderChapter` from `const title =` up to `const xhtml =`:

```ts
export function renderChapter(
  chapter: Chapter,
  index: number,
  book: Book,
  resourceMap: ResourceMap,
  includeCustomCss = true,
  firstNoteNumber = 1,
): RenderedChapter {
  const parsed = parse(chapter.source);
  const referencedPaths: string[] = [];
  const document = {
    ...parsed.document,
    children: parsed.document.children.map((node) =>
      rewriteBlock(node, resourceMap, referencedPaths),
    ),
  };
  const title =
    textOfHeading(document.children[0]) || fallbackTitle(book.metadata.language, index + 1);
  const extracted = extractFootnotes(document, firstNoteNumber);
  const body = replaceNoteMarkers(
    renderToHTML(extracted.document, { xhtmlMode: true }),
    (number, first) =>
      `<sup><a epub:type="noteref" class="noteref"${first ? ` id="fnref-${number}"` : ""} href="notes.xhtml#fn-${number}">${number}</a></sup>`,
  );
  const notes = extracted.notes.map((note) => ({
    number: note.number,
    referenced: note.referenced,
    xhtml: renderToHTML({ type: "document", children: note.children }, { xhtmlMode: true }),
  }));
  const language = book.metadata.language || "en";
  // const xhtml = … unchanged
```

and return `{ id: chapter.id, title, xhtml, referencedPaths, notes }`.

- [ ] **Step 4: Run the chapter tests and the whole EPUB suite**

Run: `pnpm vitest run src/services/epub`
Expected: the new tests PASS. `build.test.ts` may now fail on footnote expectations (`<aside`, `fn-a`). Leave those failures for Task 3 only if they concern `notes.xhtml`. Fix any other failure here.

- [ ] **Step 5: Commit**

```bash
git add src/services/epub/chapter.ts src/services/epub/__tests__/chapter.test.ts
git commit -m "feat(epub): link footnote references to book-wide endnotes"
```

---

### Task 3: `notes.xhtml`, packaging and the theme

**Files:**
- Create: `src/services/epub/notes.ts`
- Modify: `src/services/epub/{labels,opf,nav,ncx,build}.ts`, `src/assets/epub/theme.css.ts`, `src/assets/epub/custom.css.ts`
- Test: `src/services/epub/__tests__/{notes,labels,nav,build}.test.ts`

**Interfaces:**
- Consumes: `RenderedChapter.notes` (Task 2), `prependToFirstParagraph` (Task 1).
- Produces:
  - `notesXhtml(chapters: RenderedChapter[], language: string, includeCustomCss: boolean): string | null`
  - `EpubLabels.notes: string`
  - `opf(book, chapters, resources, includeTitle, exported, versionInTitle, includeNotes = false)`
  - `navXhtml(chapters, titlePage, title, notesTitle: string | null = null)`
  - `ncx(chapters, uid, title, notesTitle: string | null = null)`

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/epub/__tests__/notes.test.ts
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { notesXhtml } from "@/services/epub/notes";
import type { RenderedChapter } from "@/services/epub/chapter";

const chapter = (id: string, title: string, notes: RenderedChapter["notes"]): RenderedChapter => ({
  id,
  title,
  xhtml: "",
  referencedPaths: [],
  notes,
});

describe("notesXhtml", () => {
  it("returns null when the book has no notes", () => {
    expect(notesXhtml([chapter("a", "A", [])], "ru", false)).toBeNull();
  });

  it("groups notes by chapter with backlinks and a localized heading", () => {
    const xhtml = notesXhtml(
      [
        chapter("one", "Один", [{ number: 1, referenced: true, xhtml: "<p>Note</p>" }]),
        chapter("two", "Два", []),
        chapter("three", "Три & co", [{ number: 2, referenced: false, xhtml: "<p>Lost</p>" }]),
      ],
      "ru",
      true,
    )!;
    expect(XMLValidator.validate(xhtml)).toBe(true);
    expect(xhtml).toContain("<title>Примечания</title>");
    expect(xhtml).toContain('<h2><a href="c-one.xhtml">Один</a></h2>');
    expect(xhtml).not.toContain("c-two.xhtml");
    expect(xhtml).toContain('<h2><a href="c-three.xhtml">Три &amp; co</a></h2>');
    expect(xhtml).toContain(
      '<div epub:type="endnote" class="endnote" id="fn-1">\n<p><a class="endnote-backlink" href="c-one.xhtml#fnref-1">1.</a> Note</p>',
    );
    expect(xhtml).toContain('<p><span class="endnote-number">2.</span> Lost</p>');
    expect(xhtml).toContain('href="custom.css"');
  });
});
```

Add to `labels.test.ts`:

```ts
  it("names the notes page in the book language", () => {
    expect(getLabels("ru").notes).toBe("Примечания");
    expect(getLabels("en").notes).toBe("Notes");
    expect(getLabels("zh-CN").notes).toBe("注释");
  });
```

Add to `build.test.ts` (the fixture book's chapter `one` already has `[^a]`):

```ts
  it("puts endnotes last in the spine and in both tables of contents", async () => {
    const deps = { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") };
    const zip = await JSZip.loadAsync(
      await buildEpub(
        book,
        { imagePreset: "original", grayscale: false, titlePage: false, versionInTitle: false },
        deps,
      ),
    );
    const opfText = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opfText).toMatch(/<itemref idref="chapter-2"\/><itemref idref="notes"\/><\/spine>/);
    expect(await zip.file("OEBPS/nav.xhtml")!.async("string")).toContain(
      '<li><a href="notes.xhtml">Notes</a></li>',
    );
    expect(await zip.file("OEBPS/toc.ncx")!.async("string")).toContain(
      '<content src="notes.xhtml"/>',
    );
    const notes = await zip.file("OEBPS/notes.xhtml")!.async("string");
    expect(notes).toContain('id="fn-1"');
    expect(await zip.file("OEBPS/c-one.xhtml")!.async("string")).toContain(
      'href="notes.xhtml#fn-1"',
    );
    expect(await zip.file("OEBPS/theme.css")!.async("string")).not.toContain("display: none");
  });

  it("writes no notes page for a book without footnotes", async () => {
    const plain = { ...book, chapters: [{ id: "two", source: "No heading" }] };
    const zip = await JSZip.loadAsync(
      await buildEpub(
        plain,
        { imagePreset: "original", grayscale: false, titlePage: false, versionInTitle: false },
        { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") },
      ),
    );
    expect(zip.file("OEBPS/notes.xhtml")).toBeNull();
    expect(await zip.file("OEBPS/content.opf")!.async("string")).not.toContain("notes");
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/services/epub`
Expected: FAIL, `notes.ts` is missing and `notes` is undefined.

- [ ] **Step 3: Implement the labels** — `src/services/epub/labels.ts`:

```ts
export interface EpubLabels {
  translation: string;
  series: string;
  version: string;
  notes: string;
}

const labels: Record<string, EpubLabels> = {
  ru: { translation: "Перевод", series: "Серия", version: "Версия", notes: "Примечания" },
  en: { translation: "Translation", series: "Series", version: "Version", notes: "Notes" },
  "zh-CN": { translation: "翻译", series: "系列", version: "版本", notes: "注释" },
};
```

- [ ] **Step 4: Implement `notes.ts`**

```ts
// src/services/epub/notes.ts
import { XMLValidator } from "fast-xml-parser";
import { AppError } from "@/types/errors";
import type { RenderedChapter } from "./chapter";
import { prependToFirstParagraph } from "./footnotes";
import { getLabels } from "./labels";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );

/** The endnotes page, or null when no chapter has a note. */
export function notesXhtml(
  chapters: RenderedChapter[],
  language: string,
  includeCustomCss: boolean,
): string | null {
  const withNotes = chapters.filter((chapter) => chapter.notes.length > 0);
  if (withNotes.length === 0) return null;
  const heading = getLabels(language).notes;
  const lang = esc(language || "en");
  const groups = withNotes
    .map((chapter) => {
      const href = `c-${esc(chapter.id)}.xhtml`;
      const notes = chapter.notes
        .map((note) => {
          const marker = note.referenced
            ? `<a class="endnote-backlink" href="${href}#fnref-${note.number}">${note.number}.</a> `
            : `<span class="endnote-number">${note.number}.</span> `;
          return `<div epub:type="endnote" class="endnote" id="fn-${note.number}">\n${prependToFirstParagraph(note.xhtml, marker)}\n</div>`;
        })
        .join("\n");
      return `<section class="endnotes-chapter"><h2><a href="${href}">${esc(chapter.title)}</a></h2>\n${notes}\n</section>`;
    })
    .join("\n");
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">\n<head><meta charset="UTF-8"/><title>${esc(heading)}</title><link rel="stylesheet" type="text/css" href="theme.css"/>${includeCustomCss ? '<link rel="stylesheet" type="text/css" href="custom.css"/>' : ""}</head>\n<body><section epub:type="endnotes" role="doc-endnotes"><h1>${esc(heading)}</h1>\n${groups}\n</section></body>\n</html>`;
  const validation = XMLValidator.validate(xhtml);
  if (validation !== true)
    throw new AppError(
      "export.invalidXhtml",
      `${heading}: invalid XHTML`,
      { line: validation.err.line, column: validation.err.col },
      { params: { chapter: 0, title: heading } },
    );
  return xhtml;
}
```

- [ ] **Step 5: Wire packaging**

`opf.ts`: add the parameter `includeNotes = false` after `versionInTitle`. Add the manifest item after the chapter items:

```ts
    includeNotes
      ? `<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>`
      : "",
```

and the spine:

```ts
  const spine = `${includeTitle ? '<itemref idref="title-page"/>' : ""}${chapters.map((_, i) => `<itemref idref="chapter-${i + 1}"/>`).join("")}${includeNotes ? '<itemref idref="notes"/>' : ""}`;
```

`nav.ts`: add the parameter `notesTitle: string | null = null`:

```ts
  const entries =
    chapters.map((c) => `<li><a href="c-${esc(c.id)}.xhtml">${esc(c.title)}</a></li>`).join("") +
    (notesTitle ? `<li><a href="notes.xhtml">${esc(notesTitle)}</a></li>` : "");
```

`ncx.ts`: add the parameter `notesTitle: string | null = null`:

```ts
  const notesPoint = notesTitle
    ? `<navPoint id="navPoint-notes" playOrder="${chapters.length + 1}"><navLabel><text>${esc(notesTitle)}</text></navLabel><content src="notes.xhtml"/></navPoint>`
    : "";
```

and emit `<navMap>${points}${notesPoint}</navMap>`.

`build.ts`: number the notes across chapters and add the page:

```ts
import { notesXhtml } from "./notes";
import { getLabels } from "./labels";
// …
  const chapters: RenderedChapter[] = [];
  let nextNote = 1;
  for (let i = 0; i < book.chapters.length; i++) {
    check(deps.signal);
    const rendered = renderChapter(
      book.chapters[i],
      i,
      book,
      allMap,
      Boolean(book.customCss),
      nextNote,
    );
    nextNote += rendered.notes.length;
    chapters.push(rendered);
    deps.onProgress?.({ stage: "chapters", done: i + 1, total: book.chapters.length });
  }
  const notes = notesXhtml(chapters, book.metadata.language, Boolean(book.customCss));
  const notesTitle = notes ? getLabels(book.metadata.language).notes : null;
```

Pass `notes !== null` as the last `opf(...)` argument and `notesTitle` to `navXhtml` and `ncx`. After the chapter entries:

```ts
  if (notes) entries.push(["OEBPS/notes.xhtml", notes]);
```

- [ ] **Step 6: Replace the hiding rule in the theme**

`src/assets/epub/theme.css.ts`: drop the `@namespace` line and the `aside[...] { display: none; }` rule, and add the endnote styles:

```ts
export const themeCss = `p { margin: 0; text-indent: 1.5em; }\np:first-child, h1 + p, p.novlang-scene-break + p { text-indent: 0; }\nh1 { text-align: center; margin: 1em 0; }\np.novlang-scene-break { text-align: center; text-indent: 0; margin: 1em 0; }\nblockquote { margin: 1em 2em; }\np:has(> img:only-child) { text-align: center; text-indent: 0; }\nimg { max-width: 100%; height: auto; }\na.noteref { text-decoration: none; }\nsection.endnotes-chapter h2 { font-size: 1em; margin: 1.5em 0 0.5em; }\ndiv.endnote { margin: 0 0 0.5em; }\ndiv.endnote p { text-indent: 0; }`;
```

In `src/assets/epub/custom.css.ts`, replace the comment line about footnotes with:

```
   Footnotes: references are a.noteref; the notes page (and the preview) uses
   section.endnotes-chapter and div.endnote.
```

Search the tests for the removed rule: `grep -rn "namespace epub\|footnote\"\] { display" src` and update every hit to the new rules.

- [ ] **Step 7: Run the EPUB suite and epubcheck**

Run: `pnpm vitest run src/services/epub src/assets`
Expected: PASS.

Run (needs Java, as in CI): `pnpm build:fixture-epubs && bash scripts/epubcheck.sh`
Expected: no errors or warnings. If Java is not installed locally, note it in the commit body; CI runs it.

- [ ] **Step 8: Commit**

```bash
git add src/services/epub src/assets/epub
git commit -m "feat(epub): collect footnotes on a notes page at the end of the book

The aside elements were hidden with display:none, so neither Calibre
nor Kindle ever showed the note text, and Calibre's MOBI conversion
dropped the anchors. Notes now live on notes.xhtml with links in both
directions, which Kindle needs for popups."
```

---

### Task 4: Preview shows notes at the chapter end with the book's numbers

**Files:**
- Create: `src/components/editor/preview-notes.ts`
- Modify: `src/components/editor/PreviewPane.vue`
- Test: `src/components/editor/__tests__/preview-notes.test.ts`

**Interfaces:**
- Consumes: `extractFootnotes`, `replaceNoteMarkers`, `prependToFirstParagraph`, `countFootnotes` (Task 1); `chapterParseResults` (`src/composables/use-novlang-parse.ts`).
- Produces: `renderPreviewHtml(document: NovLangDocument, firstNumber: number): string`, `firstNoteNumber(chapterIds: string[], chapterId: string, documents: Map<string, { document: NovLangDocument }>): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/editor/__tests__/preview-notes.test.ts
import { describe, expect, it } from "vitest";
import { parse } from "novlang-js";
import { firstNoteNumber, renderPreviewHtml } from "@/components/editor/preview-notes";

describe("renderPreviewHtml", () => {
  it("renders references and a notes block with backlinks", () => {
    const html = renderPreviewHtml(parse("A[^1]\n\n[^1]: Note").document, 3);
    expect(html).toBe(
      '<p>A<sup><a class="noteref" id="fnref-3" href="#fn-3">3</a></sup></p>' +
        '<section class="endnotes-chapter preview-notes"><div class="endnote" id="fn-3">\n' +
        '<p><a class="endnote-backlink" href="#fnref-3">3.</a> Note</p>\n</div></section>',
    );
  });

  it("renders a chapter without notes unchanged", () => {
    expect(renderPreviewHtml(parse("Plain").document, 1)).toBe("<p>Plain</p>");
  });
});

describe("firstNoteNumber", () => {
  it("continues numbering after earlier chapters", () => {
    const docs = new Map([
      ["a", { document: parse("x[^1][^2]\n\n[^1]: a\n\n[^2]: b").document }],
      ["b", { document: parse("y").document }],
      ["c", { document: parse("z[^1]\n\n[^1]: c").document }],
    ]);
    expect(firstNoteNumber(["a", "b", "c"], "c", docs)).toBe(3);
    expect(firstNoteNumber(["a", "b", "c"], "a", docs)).toBe(1);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/editor/__tests__/preview-notes.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement**

```ts
// src/components/editor/preview-notes.ts
import { renderToHTML, type NovLangDocument } from "novlang-js";
import {
  countFootnotes,
  extractFootnotes,
  prependToFirstParagraph,
  replaceNoteMarkers,
} from "@/services/epub/footnotes";

/** The same markup classes as notes.xhtml, so custom.css styles both alike. */
export function renderPreviewHtml(document: NovLangDocument, firstNumber: number): string {
  const extracted = extractFootnotes(document, firstNumber);
  const body = replaceNoteMarkers(
    renderToHTML(extracted.document),
    (n, first) =>
      `<sup><a class="noteref"${first ? ` id="fnref-${n}"` : ""} href="#fn-${n}">${n}</a></sup>`,
  );
  if (extracted.notes.length === 0) return body;
  const notes = extracted.notes
    .map((note) => {
      const marker = note.referenced
        ? `<a class="endnote-backlink" href="#fnref-${note.number}">${note.number}.</a> `
        : `<span class="endnote-number">${note.number}.</span> `;
      const html = renderToHTML({ type: "document", children: note.children });
      return `<div class="endnote" id="fn-${note.number}">\n${prependToFirstParagraph(html, marker)}\n</div>`;
    })
    .join("\n");
  return `${body}<section class="endnotes-chapter preview-notes">${notes}</section>`;
}

export function firstNoteNumber(
  chapterIds: string[],
  chapterId: string,
  documents: Map<string, { document: NovLangDocument }>,
): number {
  let number = 1;
  for (const id of chapterIds) {
    if (id === chapterId) break;
    const parsed = documents.get(id);
    if (parsed) number += countFootnotes(parsed.document);
  }
  return number;
}
```

- [ ] **Step 4: Use it in `PreviewPane.vue`**

Replace both `renderToHTML(currentResult.value.document)` calls with `previewHtml()`, and the `div.footnote-def` rule in `styles()` with the notes block style:

```ts
import { firstNoteNumber, renderPreviewHtml } from "./preview-notes";

function previewHtml() {
  if (!currentResult.value) return "";
  const ids = project.book?.chapters.map((chapter) => chapter.id) ?? [];
  return renderPreviewHtml(
    currentResult.value.document,
    firstNoteNumber(ids, props.chapterId, chapterParseResults),
  );
}

function styles() {
  return `${themeCss}\nsection.preview-notes { margin-top: 2em; padding-top: 0.75em; border-top: 1px solid #ddd; }\n${previewCss}\nbody { font-family: Georgia, 'Times New Roman', serif; }`;
}
```

Remove the now unused `renderToHTML` import. Run `grep -n "footnote-def" src` and update `PreviewPane.test.ts` expectations that mention `footnote-def` to the new markup.

- [ ] **Step 5: Run the editor tests**

Run: `pnpm vitest run src/components/editor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor
git commit -m "feat(preview): show chapter notes at the end with book-wide numbers"
```

---

### Task 5: Cover thumbnail keeps its shape

**Files:**
- Modify: `src/components/metadata/CoverPicker.vue`, `src/components/editor/ImageView.vue`
- Modify: `src/locales/{ru,en,zh-CN}.json` (`metadata.coverSize`, `metadata.coverSmall`)
- Test: `src/components/metadata/__tests__/CoverPicker.test.ts`, `src/components/editor/__tests__/ImageView.test.ts`

**Interfaces:**
- Consumes: `imageDimensions(bytes, mediaType)` from `src/services/book/image-dimensions.ts`, `useProjectStore().book.resources`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests** (append to `CoverPicker.test.ts`)

```ts
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

  it("bounds the thumbnail width outside the aspect box and keeps the real ratio", () => {
    const project = useProjectStore();
    const book = project.book!;
    project.setBook({
      ...book,
      resources: new Map([["images/c.png", { mediaType: "image/png", bytes: png(1000, 1500) }]]),
    });
    const wrapper = mount(CoverPicker, { props: { cover: "images/c.png", preview: "blob:x" } });
    const inner = wrapper.get('[data-slot="aspect-ratio"]');
    const outer = inner.element.parentElement!;
    expect(outer.parentElement!.className).toContain("w-32");
    expect(inner.classes()).not.toContain("w-32");
    expect(outer.getAttribute("style")).toContain("padding-bottom: 150%");
    expect(wrapper.get("img").classes()).toContain("object-contain");
    expect(wrapper.text()).toContain("1000×1500");
  });
```

Append to `ImageView.test.ts` (reuse its existing setup for a tall image):

```ts
  it("caps a tall image to the window height", () => {
    // mount ImageView for a 1000×3000 PNG with the file's existing helpers
    const box = wrapper.get('[data-image-frame]');
    expect(box.attributes("style")).toContain("max-width: calc(70vh * 0.3333");
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/metadata/__tests__/CoverPicker.test.ts src/components/editor/__tests__/ImageView.test.ts`
Expected: FAIL, `w-32` sits on the inner element.

- [ ] **Step 3: Implement `CoverPicker.vue`**

Script additions:

```ts
import { computed } from "vue";
import { imageDimensions } from "@/services/book/image-dimensions";

const RECOMMENDED = { width: 1600, height: 2560 };
const size = computed(() => {
  const resource = props.cover ? project.book?.resources.get(props.cover) : undefined;
  return resource ? imageDimensions(resource.bytes, resource.mediaType) : null;
});
const ratio = computed(() =>
  size.value && size.value.height > 0
    ? size.value.width / size.value.height
    : RECOMMENDED.width / RECOMMENDED.height,
);
const small = computed(
  () =>
    size.value !== null &&
    (size.value.width < RECOMMENDED.width / 2 || size.value.height < RECOMMENDED.height / 2),
);
```

Template: the card is the drop target, the width lives on a wrapper and the image is contained:

```vue
  <Card @dragover.prevent @drop="drop">
    <CardContent class="flex flex-col gap-3">
      <!-- Reka's AspectRatio puts classes on its inner box; the width must
           bound the outer box, or its padding-based height follows the card. -->
      <div v-if="preview" class="w-32">
        <AspectRatio :ratio="ratio" class="overflow-hidden rounded-lg bg-muted">
          <img :src="preview" :alt="cover ?? ''" class="size-full object-contain" />
        </AspectRatio>
      </div>
      <div v-if="cover" class="break-all text-sm text-muted-foreground">{{ cover }}</div>
      <p class="text-xs text-muted-foreground">
        <template v-if="size">
          {{ t("metadata.coverSize", "Size") }}: {{ size.width }}×{{ size.height }} ·
        </template>
        {{ t("metadata.coverHint", "Recommended 1600×2560") }}
      </p>
      <p v-if="small" class="text-xs text-destructive">
        {{ t("metadata.coverSmall", "The cover is small and may look blurry on Kindle") }}
      </p>
      <!-- buttons unchanged -->
      <Empty>
        <EmptyDescription>{{ t("metadata.drop", "Drop an image here") }}</EmptyDescription>
      </Empty>
    </CardContent>
  </Card>
```

Locale keys: `metadata.coverSize` — ru «Размер», en "Size", zh-CN "尺寸". `metadata.coverSmall` — ru «Обложка маленькая и может выглядеть размытой на Kindle», en "The cover is small and may look blurry on Kindle", zh-CN "封面尺寸较小，在 Kindle 上可能显得模糊".

- [ ] **Step 4: Cap the image view height** — `ImageView.vue`:

```vue
        <div
          class="mx-auto w-full"
          data-image-frame
          :style="{ maxWidth: `calc(70vh * ${ratio})` }"
        >
          <AspectRatio :ratio="ratio" class="overflow-hidden rounded-lg bg-muted">
            <img :src="src" :alt="path" class="size-full object-contain" />
          </AspectRatio>
        </div>
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/components/metadata src/components/editor/__tests__/ImageView.test.ts src/plugins`
Expected: PASS. The existing drop test still finds `[data-slot="empty"]`; the event bubbles to the card.

- [ ] **Step 6: Commit**

```bash
git add src/components/metadata src/components/editor/ImageView.vue src/components/editor/__tests__/ImageView.test.ts src/locales
git commit -m "fix(metadata): keep the cover thumbnail's shape and show its size"
```

---

### Task 6: CSS editor highlighting and editing aids

**Files:**
- Create: `src/components/editor/css-language.ts`
- Modify: `src/components/editor/CssEditor.vue`, `src/assets/style.css`, `package.json`
- Test: `src/components/editor/__tests__/css-language.test.ts`

**Interfaces:**
- Produces: `cssHighlightStyle: HighlightStyle`, `cssEditingExtensions(): Extension[]`.

- [ ] **Step 1: Add the autocomplete package** (it is only a transitive dependency today, and pnpm does not expose transitive packages)

```bash
pnpm add @codemirror/autocomplete
```

- [ ] **Step 2: Write the failing test**

```ts
// src/components/editor/__tests__/css-language.test.ts
import { EditorState } from "@codemirror/state";
import { highlightingFor } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { cssEditingExtensions } from "@/components/editor/css-language";

describe("cssEditingExtensions", () => {
  it("assigns a highlight class to every CSS token family", () => {
    const state = EditorState.create({ doc: "p { color: red; }", extensions: cssEditingExtensions() });
    for (const tag of [
      tags.comment,
      tags.tagName,
      tags.className,
      tags.propertyName,
      tags.number,
      tags.string,
      tags.keyword,
      tags.definitionKeyword,
      tags.atom,
    ])
      expect(highlightingFor(state, [tag]), String(tag)).toBeTruthy();
  });

  it("offers property completions", () => {
    const state = EditorState.create({ doc: "p { col", extensions: cssEditingExtensions() });
    expect(state.languageDataAt("autocomplete", 6).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run and see it fail**

Run: `pnpm vitest run src/components/editor/__tests__/css-language.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 4: Add syntax tokens to the theme** — in `src/assets/style.css`, inside `:root`:

```css
  --syntax-comment: oklch(0.55 0.01 220);
  --syntax-selector: oklch(0.48 0.16 300);
  --syntax-property: oklch(0.47 0.14 250);
  --syntax-value: oklch(0.48 0.12 160);
  --syntax-string: oklch(0.52 0.14 60);
  --syntax-keyword: oklch(0.52 0.18 20);
```

and inside `.dark`:

```css
  --syntax-comment: oklch(0.65 0.01 220);
  --syntax-selector: oklch(0.78 0.12 300);
  --syntax-property: oklch(0.78 0.11 250);
  --syntax-value: oklch(0.8 0.11 160);
  --syntax-string: oklch(0.82 0.12 75);
  --syntax-keyword: oklch(0.75 0.15 20);
```

- [ ] **Step 5: Implement `css-language.ts`**

```ts
// src/components/editor/css-language.ts
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { highlightActiveLine, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Colours come from theme tokens, so a theme switch needs no reconfigure. */
export const cssHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  {
    tag: [
      tags.tagName,
      tags.className,
      tags.labelName,
      tags.constant(tags.className),
      tags.attributeName,
      tags.definitionOperator,
    ],
    color: "var(--syntax-selector)",
  },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  {
    tag: [tags.atom, tags.number, tags.unit, tags.color, tags.variableName],
    color: "var(--syntax-value)",
  },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: [tags.keyword, tags.definitionKeyword], color: "var(--syntax-keyword)" },
  { tag: tags.modifier, color: "var(--syntax-keyword)", fontWeight: "600" },
]);

export function cssEditingExtensions(): Extension[] {
  return [
    css(),
    syntaxHighlighting(cssHighlightStyle),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    autocompletion(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    keymap.of([
      { key: "Mod-f", run: openSearchPanel },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
    ]),
  ];
}
```

- [ ] **Step 6: Use it in `CssEditor.vue`**

Replace `css(),` in `extensions` with `...cssEditingExtensions(),` and remove the `@codemirror/lang-css` import. Keep `lineNumbers()`, `history()` and the existing keymap after it. `preserveOpenShortcutKeymap` stays first in its own `keymap.of`.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/components/editor`
Expected: PASS.

- [ ] **Step 8: Check visually**

Run `pnpm dev`, open a book, Explorer → Styles. Expected: selectors, properties, values, strings and comments in distinct colours in both themes. Typing `{` adds `}`, typing `col` offers `color`, Mod+F opens search.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml src/assets/style.css src/components/editor
git commit -m "feat(css-editor): add syntax highlighting, completion and bracket aids"
```

---

### Task 7: Settings use the free width

**Files:**
- Modify: `src/components/settings/SettingsView.vue`, `src/locales/{ru,en,zh-CN}.json` (`settings.editor`)
- Test: `src/components/settings/__tests__/SettingsView.test.ts`, `e2e/settings.spec.ts`

- [ ] **Step 1: Write the failing tests**

Unit (append):

```ts
  it("groups delete confirmation under Editor and puts both maintenance buttons in one row", () => {
    // render as the file's other tests do
    const editor = screen.getByRole("heading", { name: /editor/i }).closest('[data-slot="card"]')!;
    expect(within(editor as HTMLElement).getByRole("switch", { name: /confirm/i })).toBeTruthy();
    const updates = screen.getByRole("button", { name: /check for updates/i });
    const logs = screen.getByRole("button", { name: /log folder/i });
    expect(updates.parentElement).toBe(logs.parentElement);
  });
```

e2e (append to `e2e/settings.spec.ts`):

```ts
test("settings use two columns on a wide window", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.locator('[data-action="new-project"]').click();
  await page.locator('[data-activity="settings"]').click();
  const appearance = await page.getByRole("heading", { name: "Appearance" }).boundingBox();
  const exportHeading = await page.getByRole("heading", { name: "Export" }).boundingBox();
  expect(exportHeading!.x).toBeGreaterThan(appearance!.x + 200);
  expect(Math.abs(exportHeading!.y - appearance!.y)).toBeLessThan(4);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/settings && pnpm test:e2e -- settings`
Expected: FAIL, there is no "Editor" card and the cards form one column.

- [ ] **Step 3: Implement the layout**

The section becomes a size container. The cards split into two column stacks, so narrow windows keep the reading order Appearance → Editor → Export → Maintenance:

```vue
  <section
    class="@container flex flex-col gap-6 p-8"
    aria-labelledby="settings-title"
    data-settings-view
  >
    <h1 id="settings-title" class="text-xl font-semibold">
      {{ t("settings.title", "Settings") }}
    </h1>
    <div class="grid max-w-6xl items-start gap-6 @4xl:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-6">
        <!-- Appearance card: language and theme only -->
        <Card>
          <CardHeader>
            <CardTitle><h2>{{ t("settings.editor", "Editor") }}</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <!-- the confirm-delete Field moved here unchanged -->
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <div class="flex min-w-0 flex-col gap-6">
        <!-- Export card, Maintenance card -->
      </div>
    </div>
  </section>
```

In the Export card, make the subsection legends smaller than the card title:

```vue
<FieldLegend class="text-sm font-semibold text-muted-foreground">
```

for both "Images" and "Book".

Maintenance: one row with both buttons, and the status under it:

```vue
        <FieldGroup>
          <Field orientation="horizontal" class="flex-wrap">
            <Button variant="outline" @click="checkUpdates">…</Button>
            <Button variant="outline" @click="openLogs">…</Button>
          </Field>
          <Field orientation="horizontal" class="flex-wrap">
            <span role="status" class="text-muted-foreground text-sm">{{ updateMessage }}</span>
            <Button v-if="update" variant="link" …>{{ update.version }}</Button>
          </Field>
        </FieldGroup>
```

Locale key `settings.editor`: ru «Редактор», en "Editor", zh-CN "编辑器".

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/components/settings src/plugins && pnpm test:e2e`
Expected: PASS, including `layout.spec.ts` ("a single pane view stretches to the full body height").

- [ ] **Step 5: Commit**

```bash
git add src/components/settings src/locales e2e/settings.spec.ts
git commit -m "feat(settings): lay out settings cards in two columns when wide"
```

---

### Task 8: One content header over source and preview

**Files:**
- Create: `src/components/layout/ContentHeader.vue`
- Modify: `src/components/layout/ResizableSplit.vue` (new `header` slot), `src/components/layout/Breadcrumbs.vue` (no own border, truncation), `src/views/EditorView.vue`
- Test: `src/components/layout/__tests__/ResizableSplit.test.ts`, `e2e/layout.spec.ts`

**Interfaces:**
- Produces: `ResizableSplit` slot `header` rendered once above both the single pane and the source/preview group. `ContentHeader` has a default slot for the toolbar on the right (Task 10 fills it).

- [ ] **Step 1: Write the failing tests**

Unit (append to `ResizableSplit.test.ts`; mount the way the file already does):

```ts
  it("renders the header once above the panes in split and single modes", async () => {
    const wrapper = mountSplit({ slots: { header: "<div data-test-header />" } });
    expect(wrapper.findAll("[data-test-header]")).toHaveLength(1);
    const header = wrapper.get("[data-test-header]").element;
    const source = wrapper.get('[data-pane="source"]').element;
    expect(header.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await wrapper.setProps({ singlePane: true });
    expect(wrapper.findAll("[data-test-header]")).toHaveLength(1);
  });
```

e2e (`e2e/layout.spec.ts`): replace "a single pane view stretches to the full body height" with:

```ts
  test("the content header spans source and preview, and panes fill the rest", async ({
    page,
  }) => {
    const header = (await page.locator("[data-content-header]").boundingBox())!;
    const source = (await page.locator('[data-pane="source"]').boundingBox())!;
    const preview = (await page.locator('[data-pane="preview"]').boundingBox())!;
    expect(header.x).toBeCloseTo(source.x, 0);
    expect(header.x + header.width).toBeCloseTo(preview.x + preview.width, 0);
    expect(source.y).toBeCloseTo(header.y + header.height, 0);

    await page.locator('[data-activity="settings"]').click();
    await page.locator(SETTINGS).waitFor();
    const body = await heightOf(page, BODY);
    const pane = await heightOf(page, SINGLE_PANE);
    const headerHeight = await heightOf(page, "[data-content-header]");
    expect(pane + headerHeight).toBeCloseTo(body, 0);
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/layout && pnpm test:e2e -- layout`
Expected: FAIL, there is no `header` slot or `[data-content-header]`.

- [ ] **Step 3: Implement the slot** — `ResizableSplit.vue`, inside the content `SplitterPanel`:

```vue
      <SplitterPanel ref="content" :order="2" class="flex min-w-0">
        <div class="flex min-w-0 flex-1 flex-col">
          <slot name="header" />
          <section
            v-if="props.singlePane"
            class="flex min-h-0 min-w-0 flex-1 flex-col"
            data-single-pane
          >
            <slot name="single" />
          </section>
          <!-- Reka's SplitterGroup sets height: 100%; under a header that would
               overflow, so it fills a positioned box instead. -->
          <div v-else class="relative min-h-0 flex-1">
            <SplitterGroup
              direction="horizontal"
              class="absolute inset-0 flex"
              @layout="contentResize.report"
            >
              <!-- source panel, handle, preview panel unchanged -->
            </SplitterGroup>
          </div>
        </div>
      </SplitterPanel>
```

- [ ] **Step 4: Implement the header**

```vue
<!-- src/components/layout/ContentHeader.vue -->
<script setup lang="ts">
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
</script>

<template>
  <!-- A size container: the toolbar inside hides buttons by this row's width,
       not the window's, because the sidebar takes part of the window. -->
  <div
    class="@container flex min-h-9 shrink-0 items-center gap-2 border-b pr-2"
    data-content-header
  >
    <Breadcrumbs class="min-w-0 flex-1" />
    <slot />
  </div>
</template>
```

In `Breadcrumbs.vue`, drop `border-b` from the root class (the header draws it), and let long titles shrink:

```vue
  <Breadcrumb :aria-label="t('breadcrumbs.aria', 'Breadcrumbs')" class="min-w-0 px-3 py-2">
    <BreadcrumbList class="flex-nowrap text-xs">
      <template v-for="(segment, index) in segments" :key="index">
        <BreadcrumbSeparator v-if="index > 0" />
        <BreadcrumbItem
          class="min-w-0"
          :aria-current="index === segments.length - 1 ? 'page' : undefined"
        >
          <span class="truncate">{{ segment }}</span>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
```

In `EditorView.vue`: remove `<Breadcrumbs />` from `#single` and `#source`, remove the `Breadcrumbs` import and add:

```vue
        <template #header>
          <ContentHeader />
        </template>
```

with `import ContentHeader from "@/components/layout/ContentHeader.vue";`.

- [ ] **Step 5: Run the tests**

Run: `pnpm check && pnpm test:e2e`
Expected: PASS. Fix `Breadcrumbs.test.ts` if it asserted the `border-b` class.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout src/views/EditorView.vue e2e/layout.spec.ts
git commit -m "feat(layout): one breadcrumb header across source and preview"
```

---

### Task 9: Heading, quote, scene break and image editor commands

**Files:**
- Modify: `src/components/editor/editor-commands.ts`
- Test: `src/components/editor/__tests__/editor-commands.test.ts`

**Interfaces:**
- Produces:
  - `toggleHeading(state: EditorState): Transaction`
  - `toggleBlockquote(state: EditorState): Transaction`
  - `insertSceneBreak(state: EditorState): Transaction`
  - `insertImageReference(state: EditorState, path: string): Transaction`
  - `activeMarkup(state: EditorState): { bold: boolean; italic: boolean }`
  - `chapterEditorTick: Ref<number>` (bumped on every selection or document change of a mounted chapter editor)

- [ ] **Step 1: Write the failing tests**

```ts
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  activeMarkup,
  insertImageReference,
  insertSceneBreak,
  toggleBlockquote,
  toggleHeading,
} from "@/components/editor/editor-commands";

const at = (doc: string, anchor: number, head = anchor) =>
  EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
const text = (tr: { state: EditorState }) => tr.state.doc.toString();

describe("toggleHeading", () => {
  it("adds and removes the heading marker on the first line wherever the cursor is", () => {
    expect(text(toggleHeading(at("Title\n\nBody", 9)))).toBe("# Title\n\nBody");
    expect(text(toggleHeading(at("# Title\n\nBody", 9)))).toBe("Title\n\nBody");
  });
});

describe("toggleBlockquote", () => {
  it("quotes every non-empty selected line, and unquotes when all are quoted", () => {
    const quoted = toggleBlockquote(at("a\n\nb\nc", 0, 6));
    expect(text(quoted)).toBe("> a\n\n> b\n> c");
    expect(text(toggleBlockquote(at("> a\n\n> b", 0, 8)))).toBe("a\n\nb");
  });
});

describe("insertSceneBreak", () => {
  it("inserts *** as its own paragraph", () => {
    expect(text(insertSceneBreak(at("one two", 3)))).toBe("one\n\n***\n\n two");
    expect(text(insertSceneBreak(at("one\n\ntwo", 5)))).toBe("one\n\n***\n\ntwo");
    expect(text(insertSceneBreak(at("", 0)))).toBe("***\n\n");
  });
});

describe("insertImageReference", () => {
  it("inserts an image paragraph and puts the cursor inside the alt text", () => {
    const tr = insertImageReference(at("Before after", 6), "images/a.png");
    expect(text(tr)).toBe("Before\n\n![](images/a.png)\n\n after");
    expect(tr.state.selection.main.head).toBe(10);
  });
});

describe("activeMarkup", () => {
  it("reports bold and italic around the cursor", () => {
    expect(activeMarkup(at("a **bold** b", 5))).toEqual({ bold: true, italic: false });
    expect(activeMarkup(at("a *it* b", 4))).toEqual({ bold: false, italic: true });
    expect(activeMarkup(at("a ***both*** b", 6))).toEqual({ bold: true, italic: true });
    expect(activeMarkup(at("plain", 2))).toEqual({ bold: false, italic: false });
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/editor/__tests__/editor-commands.test.ts`
Expected: FAIL, the functions are not exported.

- [ ] **Step 3: Implement** (append to `editor-commands.ts`; add `import { ref } from "vue";`)

```ts
/** Bumped by SourceEditor on selection or text changes, so toolbars can recompute. */
export const chapterEditorTick = ref(0);

/** NovLang allows `# ` only on a chapter's first line. */
export function toggleHeading(state: EditorState): Transaction {
  const first = state.doc.line(1);
  return first.text.startsWith("# ")
    ? state.update({ changes: { from: 0, to: 2, insert: "" } })
    : state.update({ changes: { from: 0, insert: "# " } });
}

export function toggleBlockquote(state: EditorState): Transaction {
  const { from, to } = state.selection.main;
  const lines = [];
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++)
    lines.push(state.doc.line(n));
  const filled = lines.filter((line) => line.text.trim() !== "");
  const quoted = filled.length > 0 && filled.every((line) => line.text.startsWith(">"));
  const changes = filled.map((line) =>
    quoted
      ? { from: line.from, to: line.from + (line.text.startsWith("> ") ? 2 : 1), insert: "" }
      : { from: line.from, insert: "> " },
  );
  return state.update({ changes });
}

function paragraphAt(state: EditorState, block: string, cursorOffset: number): Transaction {
  const { from, to } = state.selection.main;
  const before = state.sliceDoc(0, from);
  const after = state.sliceDoc(to);
  const prefix =
    before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insert = `${prefix}${block}${suffix}`;
  return state.update({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + prefix.length + cursorOffset),
  });
}

export function insertSceneBreak(state: EditorState): Transaction {
  const tr = paragraphAt(state, "***", 3);
  const end = tr.state.selection.main.head;
  const after = tr.state.sliceDoc(end, end + 2);
  // Continue typing in the paragraph after the break.
  return state.update({
    changes: tr.changes,
    selection: EditorSelection.cursor(after === "\n\n" ? end + 2 : end),
  });
}

/** The cursor lands inside `[]` so the author can type the alt text. */
export function insertImageReference(state: EditorState, path: string): Transaction {
  return paragraphAt(state, `![](${path})`, 2);
}

export function activeMarkup(state: EditorState): { bold: boolean; italic: boolean } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const offset = head - line.from;
  const result = { bold: false, italic: false };
  for (const match of line.text.matchAll(/\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g)) {
    const start = match.index!;
    if (offset <= start || offset >= start + match[0].length) continue;
    if (match[1] !== undefined) return { bold: true, italic: true };
    if (match[2] !== undefined) result.bold = true;
    if (match[3] !== undefined) result.italic = true;
  }
  return result;
}
```

Check `insertSceneBreak` against the tests: for `"one two"` at 3, `paragraphAt` inserts `"\n\n***\n\n"` and the cursor ends after the trailing break, before `" two"`. If the expectation on the cursor seems wrong when you try it in the editor, change the test and the code together; the text expectations are the contract.

- [ ] **Step 4: Bump the tick from `SourceEditor.vue`**

In the existing `EditorView.updateListener`, before the `docChanged` check:

```ts
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) chapterEditorTick.value++;
      if (!update.docChanged) return;
      // … unchanged
    }),
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/components/editor`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor
git commit -m "feat(editor): commands for heading, quote, scene break and images"
```

---

### Task 10: Formatting toolbar in the content header

**Files:**
- Create: `src/components/editor/FormatToolbar.vue`, `src/components/editor/ImagePickerPopover.vue`
- Modify: `src/components/layout/ContentHeader.vue` (render the toolbar), `src/views/EditorView.vue` (image-from-file handler), `src/locales/{ru,en,zh-CN}.json` (`format.*`)
- Test: `src/components/editor/__tests__/FormatToolbar.test.ts`

**Interfaces:**
- Consumes: `toggleMarkup`, `insertFootnote`, `toggleHeading`, `toggleBlockquote`, `insertSceneBreak`, `insertImageReference`, `activeMarkup`, `chapterEditorTick`, `chapterEditorViews` (Task 9 and existing); `undo`, `redo`, `undoDepth`, `redoDepth` from `@codemirror/commands`; `openSearchPanel` from `@codemirror/search`; `useResourceUrls` (Task 12 builds it; this task creates it, see Step 3).
- Produces: `<FormatToolbar :chapter-id :disabled @insert-image-from-file="(position: number) => void" />`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/editor/__tests__/FormatToolbar.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FormatToolbar from "@/components/editor/FormatToolbar.vue";
import {
  chapterEditorViews,
  registerChapterEditorView,
} from "@/components/editor/editor-commands";

let view: EditorView;
beforeEach(() => {
  setActivePinia(createPinia());
  view = new EditorView({
    state: EditorState.create({
      doc: "Hello world",
      selection: EditorSelection.single(6, 11),
      extensions: [history()],
    }),
    parent: document.body,
  });
  registerChapterEditorView("c1", view);
});
afterEach(() => {
  cleanup();
  view.destroy();
  chapterEditorViews.clear();
});

describe("FormatToolbar", () => {
  it("applies bold to the editor and returns focus to it", async () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(view.state.doc.toString()).toBe("Hello **world**");
    expect(view.hasFocus).toBe(true);
  });

  it("inserts a footnote and a scene break", async () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /footnote/i }));
    expect(view.state.doc.toString()).toContain("[^1]: ");
  });

  it("disables every button in preview mode", () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: true } });
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("asks the parent to import a file at the cursor", async () => {
    const { emitted } = render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /insert image/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /from file/i }));
    expect(emitted()["insert-image-from-file"]).toEqual([[11]]);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/editor/__tests__/FormatToolbar.test.ts`
Expected: FAIL, the component is missing.

- [ ] **Step 3: Create `src/composables/use-resource-urls.ts`** (also used by the gallery in Task 12)

```ts
import { onBeforeUnmount, watch } from "vue";
import { createResourceUrlCache } from "@/components/editor/preview-resources";
import { useProjectStore } from "@/stores/project";

/** blob: URLs for the book's images, kept in sync and released on unmount. */
export function useResourceUrls() {
  const project = useProjectStore();
  const cache = createResourceUrlCache();
  watch(
    () => project.book?.resources,
    (resources) => cache.sync(resources ?? new Map()),
    { immediate: true },
  );
  onBeforeUnmount(cache.releaseAll);
  return { url: (path: string) => cache.resolve(path) };
}
```

- [ ] **Step 4: Implement `ImagePickerPopover.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useProjectStore } from "@/stores/project";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const emit = defineEmits<{ pick: [path: string] }>();
const project = useProjectStore();
const { url } = useResourceUrls();
const { t } = useSafeI18n();
const paths = computed(() => [...(project.book?.resources.keys() ?? [])]);
</script>

<template>
  <div class="grid max-h-80 w-72 grid-cols-3 gap-2 overflow-auto p-1">
    <button
      v-for="path in paths"
      :key="path"
      type="button"
      class="aspect-square overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="path"
      @click="emit('pick', path)"
    >
      <img :src="url(path)" alt="" loading="lazy" class="size-full object-cover" />
    </button>
    <p v-if="paths.length === 0" class="col-span-3 p-2 text-sm text-muted-foreground">
      {{ t("format.noImages", "The book has no images yet") }}
    </p>
  </div>
</template>
```

- [ ] **Step 5: Implement `FormatToolbar.vue`**

The primary group (bold, italic, footnote) always shows. The rest hides into a "More" menu below the `@2xl` container width (the header from Task 8 is the container).

```vue
<script setup lang="ts">
import { computed } from "vue";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import type { EditorState, Transaction } from "@codemirror/state";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconDots,
  IconH1,
  IconItalic,
  IconPhoto,
  IconSearch,
  IconSeparatorHorizontal,
  IconSuperscript,
} from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/components/ui/toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import ImagePickerPopover from "./ImagePickerPopover.vue";
import {
  activeMarkup,
  chapterEditorTick,
  chapterEditorViews,
  insertFootnote,
  insertImageReference,
  insertSceneBreak,
  toggleBlockquote,
  toggleHeading,
  toggleMarkup,
} from "./editor-commands";
import { ref } from "vue";

const props = defineProps<{ chapterId: string; disabled: boolean }>();
const emit = defineEmits<{ "insert-image-from-file": [position: number] }>();
const { t } = useSafeI18n();
const pickerOpen = ref(false);

const view = () => chapterEditorViews.get(props.chapterId);
const state = computed(() => {
  void chapterEditorTick.value;
  return view()?.state;
});
const markup = computed(() =>
  state.value ? activeMarkup(state.value) : { bold: false, italic: false },
);

function run(command: (state: EditorState) => Transaction) {
  const editor = view();
  if (!editor || props.disabled) return;
  editor.dispatch(command(editor.state));
  editor.focus();
}
function history(step: typeof undo) {
  const editor = view();
  if (!editor || props.disabled) return;
  step(editor);
  editor.focus();
}
function search() {
  const editor = view();
  if (editor && !props.disabled) openSearchPanel(editor);
}
function fromFile() {
  const editor = view();
  if (editor) emit("insert-image-from-file", editor.state.selection.main.head);
}
function fromBook(path: string) {
  pickerOpen.value = false;
  run((s) => insertImageReference(s, path));
}

const primary = computed(() => [
  { id: "bold", icon: IconBold, label: t("format.bold", "Bold"), keys: "Mod+B", pressed: markup.value.bold, action: () => run((s) => toggleMarkup(s, "**")) },
  { id: "italic", icon: IconItalic, label: t("format.italic", "Italic"), keys: "Mod+I", pressed: markup.value.italic, action: () => run((s) => toggleMarkup(s, "*")) },
  { id: "footnote", icon: IconSuperscript, label: t("format.footnote", "Footnote"), keys: "Mod+Alt+F", action: () => run(insertFootnote) },
]);
const secondary = computed(() => [
  { id: "heading", icon: IconH1, label: t("format.heading", "Chapter heading"), action: () => run(toggleHeading) },
  { id: "quote", icon: IconBlockquote, label: t("format.quote", "Quote"), action: () => run(toggleBlockquote) },
  { id: "scene", icon: IconSeparatorHorizontal, label: t("format.sceneBreak", "Scene break"), action: () => run(insertSceneBreak) },
]);
const historyItems = computed(() => [
  { id: "undo", icon: IconArrowBackUp, label: t("format.undo", "Undo"), keys: "Mod+Z", enabled: state.value ? undoDepth(state.value) > 0 : false, action: () => history(undo) },
  { id: "redo", icon: IconArrowForwardUp, label: t("format.redo", "Redo"), keys: "Mod+Shift+Z", enabled: state.value ? redoDepth(state.value) > 0 : false, action: () => history(redo) },
  { id: "search", icon: IconSearch, label: t("format.search", "Find in chapter"), keys: "Mod+F", enabled: true, action: search },
]);
</script>

<template>
  <TooltipProvider>
    <Toolbar :aria-label="t('format.toolbar', 'Formatting')" class="shrink-0 gap-0.5">
      <Tooltip v-for="item in primary" :key="item.id">
        <TooltipTrigger as-child>
          <ToolbarButton as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="item.label"
              :aria-pressed="item.pressed === undefined ? undefined : item.pressed"
              :disabled="disabled"
              :class="{ 'bg-accent': item.pressed }"
              @click="item.action"
            >
              <component :is="item.icon" aria-hidden="true" />
            </Button>
          </ToolbarButton>
        </TooltipTrigger>
        <TooltipContent>{{ item.label }} <Kbd>{{ item.keys }}</Kbd></TooltipContent>
      </Tooltip>

      <div class="hidden items-center gap-0.5 @2xl:flex">
        <ToolbarSeparator class="mx-1 h-5" />
        <Tooltip v-for="item in secondary" :key="item.id">
          <TooltipTrigger as-child>
            <ToolbarButton as-child>
              <Button variant="ghost" size="icon-sm" :aria-label="item.label" :disabled="disabled" @click="item.action">
                <component :is="item.icon" aria-hidden="true" />
              </Button>
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>{{ item.label }}</TooltipContent>
        </Tooltip>
        <Popover v-model:open="pickerOpen">
          <PopoverAnchor as-child>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <ToolbarButton as-child>
                  <Button variant="ghost" size="icon-sm" :aria-label="t('format.image', 'Insert image')" :disabled="disabled">
                    <IconPhoto aria-hidden="true" />
                  </Button>
                </ToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem @select="fromFile">{{ t("format.imageFromFile", "From file…") }}</DropdownMenuItem>
                <DropdownMenuItem @select="pickerOpen = true">{{ t("format.imageFromBook", "From the book…") }}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PopoverAnchor>
          <PopoverContent class="w-auto p-2">
            <ImagePickerPopover @pick="fromBook" />
          </PopoverContent>
        </Popover>
        <ToolbarSeparator class="mx-1 h-5" />
        <Tooltip v-for="item in historyItems" :key="item.id">
          <TooltipTrigger as-child>
            <ToolbarButton as-child>
              <Button variant="ghost" size="icon-sm" :aria-label="item.label" :disabled="disabled || !item.enabled" @click="item.action">
                <component :is="item.icon" aria-hidden="true" />
              </Button>
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>{{ item.label }} <Kbd>{{ item.keys }}</Kbd></TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <ToolbarButton as-child>
            <Button variant="ghost" size="icon-sm" class="@2xl:hidden" :aria-label="t('format.more', 'More formatting')" :disabled="disabled">
              <IconDots aria-hidden="true" />
            </Button>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem v-for="item in secondary" :key="item.id" @select="item.action">
            <component :is="item.icon" aria-hidden="true" />{{ item.label }}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><IconPhoto aria-hidden="true" />{{ t("format.image", "Insert image") }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem @select="fromFile">{{ t("format.imageFromFile", "From file…") }}</DropdownMenuItem>
              <DropdownMenuItem @select="pickerOpen = true">{{ t("format.imageFromBook", "From the book…") }}</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem v-for="item in historyItems" :key="item.id" :disabled="!item.enabled" @select="item.action">
            <component :is="item.icon" aria-hidden="true" />{{ item.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Toolbar>
  </TooltipProvider>
</template>
```

Format the file with `pnpm format`; the long attribute lines above are compressed for the plan only.

Icon names: before using them, check that each exists in `@tabler/icons-vue` (`grep -o "IconSeparatorHorizontal\b" node_modules/@tabler/icons-vue/dist/esm/icons/index.mjs`). If one is missing, pick the closest existing icon and keep the accessible label.

- [ ] **Step 6: Render it in the header and wire the file import**

`ContentHeader.vue` gets the toolbar logic, so `EditorView` stays thin:

```vue
<script setup lang="ts">
import { computed } from "vue";
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
import FormatToolbar from "@/components/editor/FormatToolbar.vue";
import { useLayoutStore } from "@/stores/layout";

defineProps<{ chapterId: string }>();
const emit = defineEmits<{ "insert-image-from-file": [position: number] }>();
const layout = useLayoutStore();
const showToolbar = computed(() => layout.center.kind === "chapter");
</script>

<template>
  <div class="@container flex min-h-9 shrink-0 items-center gap-2 border-b pr-2" data-content-header>
    <Breadcrumbs class="min-w-0 flex-1" />
    <FormatToolbar
      v-if="showToolbar && chapterId"
      :chapter-id="chapterId"
      :disabled="layout.mode === 'preview'"
      @insert-image-from-file="emit('insert-image-from-file', $event)"
    />
  </div>
</template>
```

`EditorView.vue`:

```vue
        <template #header>
          <ContentHeader
            :chapter-id="selectedChapterId"
            @insert-image-from-file="insertImageFromFile"
          />
        </template>
```

```ts
async function insertImageFromFile(position: number) {
  const chapter = selectedChapter.value;
  if (!chapter) return;
  const source = chapter.source;
  const result = await imageImport.pickAndImport(chapter.id, position);
  if (!result) return;
  const next = project.book?.chapters.find((item) => item.id === chapter.id)?.source;
  if (next) sourceEditor.value?.syncSource(next, imageCursorPosition(source, position));
}
```

- [ ] **Step 7: Add the locale keys** (`format.*`)

| key | ru | en | zh-CN |
| --- | --- | --- | --- |
| `toolbar` | Форматирование | Formatting | 格式 |
| `bold` | Полужирный | Bold | 粗体 |
| `italic` | Курсив | Italic | 斜体 |
| `footnote` | Сноска | Footnote | 脚注 |
| `heading` | Заголовок главы | Chapter heading | 章节标题 |
| `quote` | Цитата | Quote | 引用 |
| `sceneBreak` | Разрыв сцены | Scene break | 场景分隔 |
| `image` | Вставить изображение | Insert image | 插入图片 |
| `imageFromFile` | Из файла… | From file… | 从文件… |
| `imageFromBook` | Из книги… | From the book… | 从书中… |
| `noImages` | В книге пока нет изображений | The book has no images yet | 书中还没有图片 |
| `undo` | Отменить | Undo | 撤销 |
| `redo` | Повторить | Redo | 重做 |
| `search` | Найти в главе | Find in chapter | 在本章中查找 |
| `more` | Ещё форматирование | More formatting | 更多格式 |

- [ ] **Step 8: Run everything**

Run: `pnpm check && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 9: Check visually**

In `pnpm dev`: the toolbar sits right of the breadcrumbs across source and preview. Narrowing the window moves the secondary buttons into "…". Bold lights up with the cursor inside `**…**`. In Preview mode the buttons are disabled; on Metadata the toolbar is gone.

- [ ] **Step 10: Commit**

```bash
git add src/components src/composables/use-resource-urls.ts src/views/EditorView.vue src/locales
git commit -m "feat(editor): formatting toolbar in the content header"
```

---

### Task 11: Images entry under Book opens a gallery view

**Files:**
- Modify: `src/stores/layout.ts` (`CenterView` adds `{ kind: "images" }`), `src/components/sidebar/ExplorerView.vue`, `src/components/layout/Breadcrumbs.vue`, `src/views/EditorView.vue` (`singlePane` includes `images`)
- Delete: `src/components/sidebar/ImageItem.vue`
- Create: `src/components/images/ImageGallery.vue` (a stub; Task 12 fills it)
- Test: `src/components/sidebar/__tests__/ExplorerView.test.ts`, `src/components/layout/__tests__/Breadcrumbs.test.ts`

**Interfaces:**
- Produces: `CenterView` `{ kind: "images" }`. Breadcrumb segments become `Array<{ label: string; target?: CenterView }>`; a segment with a `target` is a button.

- [ ] **Step 1: Write the failing tests**

ExplorerView (adapt to the file's render helper):

```ts
  it("lists Images under Book with a count and no image rows", async () => {
    // book with two resources
    const images = screen.getByRole("treeitem", { name: /images/i });
    expect(images).toHaveTextContent("2");
    expect(screen.queryByRole("treeitem", { name: /cover\.png/ })).toBeNull();
    await userEvent.click(images);
    expect(useLayoutStore().center).toEqual({ kind: "images" });
  });
```

Breadcrumbs:

```ts
  it("shows Book › Images and leads back to the gallery from one image", async () => {
    const layout = useLayoutStore();
    layout.center = { kind: "image", path: "images/a.png" };
    render(Breadcrumbs, { global: { plugins: [pinia] } });
    await userEvent.click(screen.getByRole("button", { name: /images/i }));
    expect(layout.center).toEqual({ kind: "images" });
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/sidebar src/components/layout`
Expected: FAIL.

- [ ] **Step 3: Implement**

`layout.ts`: add `| { kind: "images" }` to `CenterView`.

`ExplorerView.vue`:
- `type Section = "book" | "chapters";` and remove the `images` section from `nodes`, `expanded`, `sectionTitle` and `sectionCount`.
- Add a leaf to Book: `{ id: "images", kind: "images" }` and the node type `| { id: "images"; kind: "images" }`.
- Render it with the other Book leaves:

```vue
        <TreeItem
          v-else-if="item.value.kind === 'images'"
          v-bind="item.bind"
          @select="selectImages"
        >
          <span class="min-w-0 flex-1 truncate">{{ t("explorer.images", "Images") }}</span>
          <Badge variant="secondary">{{ book.resources.size }}</Badge>
        </TreeItem>
```

```ts
function selectImages(event: Event) {
  event.preventDefault();
  layout.center = { kind: "images" };
}
```

- `selectedNode`: `if (center.kind === "images" || center.kind === "image") return { id: "images" };`
- Remove image deletion, cover, insert and search handling, `ImageItem`, the `import` and `image-context-menu` emits, `usage`, `usedImages`, `imageUsageDetails` and the `unused` delete target. The gallery owns them now (Tasks 12–15). `confirmDelete` and `requestDelete` keep only the chapter branch.
- `EditorView.vue`: remove `@import="importImage"` from `<ExplorerView>`; keep the `importImage` function (the gallery uses it in Task 12). Add `"images"` to `singlePane` and render `<ImageGallery v-else-if="layout.center.kind === 'images'" />` in `#single`.

`ImageGallery.vue` stub:

```vue
<template>
  <section class="p-8" data-image-gallery />
</template>
```

`Breadcrumbs.vue`:

```ts
interface Segment {
  label: string;
  target?: CenterView;
}
const segments = computed<Segment[]>(() => {
  const center = layout.center;
  const book = t("explorer.book", "Book");
  const images = t("explorer.images", "Images");
  if (center.kind === "metadata") return [{ label: t("breadcrumbs.metadata", "Metadata") }];
  if (center.kind === "css") return [{ label: t("explorer.styles", "Styles") }];
  if (center.kind === "images") return [{ label: book }, { label: images }];
  if (center.kind === "image")
    return [{ label: book }, { label: images, target: { kind: "images" } }, { label: center.path }];
  // settings and chapter branches: wrap the existing strings as { label }
});
```

In the template, render `<button type="button" class="truncate hover:underline" @click="layout.center = segment.target">` when `segment.target` is set, otherwise the `<span>`.

- [ ] **Step 4: Run everything**

Run: `pnpm check && pnpm test:e2e`
Expected: PASS. Delete tests that covered removed Explorer image behaviour; Tasks 12–15 add their gallery equivalents. Run `grep -rn "ImageItem\|image-context-menu" src e2e` and expect no hits.

- [ ] **Step 5: Commit**

```bash
git add -A src/components src/stores/layout.ts src/views/EditorView.vue
git commit -m "feat(explorer): move Images under Book and open them as a page"
```

---

### Task 12: Gallery grid

**Files:**
- Modify: `src/components/images/ImageGallery.vue`
- Create: `src/components/images/ImageTile.vue`
- Modify: `src/components/editor/ImageView.vue` (blob URLs instead of base64), `src/views/EditorView.vue` (pass `import` handler), `src/locales/*` (`gallery.*`)
- Test: `src/components/images/__tests__/ImageGallery.test.ts`

**Interfaces:**
- Consumes: `useResourceUrls` (Task 10), `collectImageUsage`, `collectUsedImagePaths` (`services/checks/image-usage.ts`), `imageDimensions`, `setCover`, `useImageImport().importFile`.
- Produces: `ImageGallery` props `{ onImport: () => Promise<void>; onDropFiles: (files: ImageFile[]) => Promise<void> }`, emits nothing; `ImageTile` props `{ path: string; url?: string; cover: boolean; unused: boolean; selected: boolean; order?: number; focused: boolean }`, emits `open`, `context-action(value: "cover" | "search" | "rename" | "delete")`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/images/__tests__/ImageGallery.test.ts
import { cleanup, render, screen, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageGallery from "@/components/images/ImageGallery.vue";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { createBook } from "@/services/book/create";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  const book = createBook({ locale: "en", now: new Date("2026-01-01"), newUuid: () => "550e8400-e29b-41d4-a716-446655440000", newChapterId: () => "chapter1" });
  useProjectStore().setBook({
    ...book,
    chapters: [{ id: "chapter1", source: "![](images/used.png)" }],
    metadata: { ...book.metadata, cover: "images/cover.png" },
    resources: new Map([
      ["images/used.png", { mediaType: "image/png", bytes: png }],
      ["images/cover.png", { mediaType: "image/png", bytes: png }],
      ["images/spare.png", { mediaType: "image/png", bytes: png }],
    ]),
  });
});
afterEach(cleanup);
const mountGallery = () =>
  render(ImageGallery, {
    props: { onImport: vi.fn(async () => {}), onDropFiles: vi.fn(async () => {}) },
    global: { plugins: [pinia] },
  });

describe("ImageGallery", () => {
  it("shows one tile per image with cover and unused marks", () => {
    mountGallery();
    const tiles = screen.getAllByRole("gridcell");
    expect(tiles).toHaveLength(3);
    expect(within(screen.getByRole("gridcell", { name: /cover\.png/ })).getByText(/cover/i)).toBeTruthy();
    expect(within(screen.getByRole("gridcell", { name: /spare\.png/ })).getByText(/not used/i)).toBeTruthy();
  });

  it("filters unused images", async () => {
    mountGallery();
    await userEvent.click(screen.getByRole("radio", { name: /unused/i }));
    expect(screen.getAllByRole("gridcell")).toHaveLength(1);
  });

  it("opens an image on click and on Enter", async () => {
    mountGallery();
    await userEvent.click(screen.getByRole("gridcell", { name: /used\.png/ }));
    expect(useLayoutStore().center).toEqual({ kind: "image", path: "images/used.png" });
  });

  it("moves focus with the arrow keys", async () => {
    mountGallery();
    screen.getAllByRole("gridcell")[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getAllByRole("gridcell")[1]);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/images`
Expected: FAIL, the stub renders nothing.

- [ ] **Step 3: Implement `ImageTile.vue`**

```vue
<script setup lang="ts">
import { IconCheck, IconStarFilled } from "@tabler/icons-vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = defineProps<{
  path: string;
  url?: string;
  cover: boolean;
  unused: boolean;
  selected: boolean;
  /** 1-based position in the selection order, shown while selecting. */
  order?: number;
  focused: boolean;
}>();
const emit = defineEmits<{ "context-action": [value: "cover" | "search" | "rename" | "delete"] }>();
const { t } = useSafeI18n();
const name = () => props.path.replace(/^images\//, "");
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        role="gridcell"
        :aria-label="name()"
        :aria-selected="selected"
        :tabindex="focused ? 0 : -1"
        :data-gallery-path="path"
        class="group relative flex cursor-default select-none flex-col gap-1 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="{ 'bg-accent ring-2 ring-primary': selected, 'opacity-60': unused && !selected }"
      >
        <div class="aspect-square overflow-hidden rounded-md bg-muted">
          <img
            v-if="url"
            :src="url"
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
            class="size-full object-cover"
          />
        </div>
        <span class="truncate text-xs text-muted-foreground">{{ name() }}</span>
        <div class="absolute left-2 top-2 flex gap-1">
          <Badge v-if="cover" variant="secondary">
            <IconStarFilled aria-hidden="true" />{{ t("gallery.cover", "Cover") }}
          </Badge>
          <Badge v-if="unused" variant="outline" class="bg-background/80">
            {{ t("images.unused", "not used") }}
          </Badge>
        </div>
        <span
          v-if="selected"
          class="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
          data-selection-order
        >
          <template v-if="order">{{ order }}</template>
          <IconCheck v-else class="size-4" aria-hidden="true" />
        </span>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="emit('context-action', 'cover')">{{ t("images.setCover", "Set as cover") }}</ContextMenuItem>
      <ContextMenuItem @select="emit('context-action', 'search')">{{ t("images.findUsage", "Find usages") }}</ContextMenuItem>
      <ContextMenuItem @select="emit('context-action', 'rename')">{{ t("gallery.rename", "Rename…") }}</ContextMenuItem>
      <ContextMenuItem variant="destructive" @select="emit('context-action', 'delete')">{{ t("common.delete", "Delete") }}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
```

(Check that `common.delete` exists in the locales; if not, reuse the key ChapterItem uses for "Delete".)

- [ ] **Step 4: Implement `ImageGallery.vue`** (selection, delete and rename are wired in Tasks 13–15; leave the `selected`/`order` props false/undefined here)

```vue
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { IconPlus, IconTrash } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import ImageTile from "./ImageTile.vue";
import { collectUsedImagePaths } from "@/services/checks/image-usage";
import { setCover } from "@/services/book/metadata";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import type { ImageFile } from "@/composables/use-image-import";

const props = defineProps<{
  onImport: () => Promise<void>;
  onDropFiles: (files: ImageFile[]) => Promise<void>;
}>();
const project = useProjectStore();
const layout = useLayoutStore();
const { url } = useResourceUrls();
const { t } = useSafeI18n();
type Filter = "all" | "used" | "unused";
const filter = ref<Filter>("all");
const grid = ref<HTMLElement>();
const focusedIndex = ref(0);

const used = computed(() =>
  project.book ? collectUsedImagePaths(project.book) : new Set<string>(),
);
const all = computed(() => [...(project.book?.resources.keys() ?? [])].sort());
const items = computed(() =>
  all.value.filter((path) =>
    filter.value === "all" ? true : filter.value === "used" ? used.value.has(path) : !used.value.has(path),
  ),
);
const unusedCount = computed(() => all.value.filter((path) => !used.value.has(path)).length);

function open(path: string) {
  layout.center = { kind: "image", path };
}
function columns(): number {
  if (!grid.value) return 1;
  return getComputedStyle(grid.value).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}
async function focusAt(index: number) {
  focusedIndex.value = Math.max(0, Math.min(items.value.length - 1, index));
  await nextTick();
  grid.value?.querySelectorAll<HTMLElement>('[role="gridcell"]')[focusedIndex.value]?.focus();
}
function onKeydown(event: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[event.key];
  if (step !== undefined) {
    event.preventDefault();
    void focusAt(focusedIndex.value + step);
  } else if (event.key === "Home") void focusAt(0);
  else if (event.key === "End") void focusAt(items.value.length - 1);
  else if (event.key === "Enter") {
    const path = items.value[focusedIndex.value];
    if (path) open(path);
  }
}
function contextAction(path: string, value: "cover" | "search" | "rename" | "delete") {
  if (value === "cover" && project.book) project.applyMutation(setCover(project.book, path));
  if (value === "search") {
    layout.activeView = "search";
    layout.setSidebarVisible(true);
  }
  // "rename" and "delete": Tasks 14 and 15.
}
async function drop(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith("image/"));
  if (files.length === 0) return;
  event.preventDefault();
  await props.onDropFiles(
    await Promise.all(
      files.map(async (file) => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })),
    ),
  );
}
</script>

<template>
  <section class="flex flex-col gap-4 p-6" data-image-gallery @dragover.prevent @drop="drop">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">
        {{ t("explorer.images", "Images") }}
        <span class="text-muted-foreground">{{ all.length }}</span>
      </h1>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="filter"
        :aria-label="t('gallery.filter', 'Show')"
        @update:model-value="(value) => value && (filter = value as Filter)"
      >
        <ToggleGroupItem value="all">{{ t("gallery.all", "All") }}</ToggleGroupItem>
        <ToggleGroupItem value="used">{{ t("gallery.used", "Used") }}</ToggleGroupItem>
        <ToggleGroupItem value="unused">{{ t("gallery.unused", "Unused") }}</ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" @click="onImport">
        <IconPlus aria-hidden="true" />{{ t("gallery.add", "Add…") }}
      </Button>
      <Button variant="outline" size="sm" :disabled="unusedCount === 0" data-delete-unused>
        <IconTrash aria-hidden="true" />{{ t("delete.unusedTitle", "Delete unused images") }}
      </Button>
    </div>
    <div
      ref="grid"
      role="grid"
      :aria-label="t('explorer.images', 'Images')"
      class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3"
      @keydown="onKeydown"
    >
      <ImageTile
        v-for="(path, index) in items"
        :key="path"
        :path="path"
        :url="url(path)"
        :cover="project.book?.metadata.cover === path"
        :unused="!used.has(path)"
        :selected="false"
        :focused="index === focusedIndex"
        @click="open(path)"
        @focus="focusedIndex = index"
        @context-action="contextAction(path, $event)"
      />
    </div>
    <p v-if="items.length === 0" class="text-sm text-muted-foreground">
      {{ t("gallery.empty", "No images. Add them with the button above or drop files here.") }}
    </p>
  </section>
</template>
```

The `role="grid"` here has no `row` elements. If the a11y lint or testing-library complains, wrap the cells in one `<div role="row" class="contents">`.

`EditorView.vue`:

```vue
            <ImageGallery
              v-else-if="layout.center.kind === 'images'"
              :on-import="importImage"
              :on-drop-files="importDroppedImages"
            />
```

```ts
async function importDroppedImages(files: ImageFile[]) {
  const identity = captureImageImportIdentity(project);
  for (const file of files) await imageImport.importFile(file, undefined, undefined, identity);
  layout.center = { kind: "images" };
}
```

`importFile` without a chapter moves `layout.center` to the single image; the last line brings the gallery back.

`ImageView.vue`: replace `bytesToBase64`/`data:` with `const { url } = useResourceUrls(); const src = computed(() => url(props.path) ?? "");`.

Locale keys (`gallery.*`):

| key | ru | en | zh-CN |
| --- | --- | --- | --- |
| `cover` | Обложка | Cover | 封面 |
| `filter` | Показать | Show | 显示 |
| `all` | Все | All | 全部 |
| `used` | Используемые | Used | 已使用 |
| `unused` | Неиспользуемые | Unused | 未使用 |
| `add` | Добавить… | Add… | 添加… |
| `rename` | Переименовать… | Rename… | 重命名… |
| `empty` | Изображений нет. Добавьте их кнопкой выше или перетащите файлы сюда. | No images. Add them with the button above or drop files here. | 没有图片。请使用上方按钮添加，或将文件拖到这里。 |

- [ ] **Step 5: Run everything**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components src/views/EditorView.vue src/locales
git commit -m "feat(images): gallery page with filters, drop import and keyboard focus"
```

---

### Task 13: Selection: long press, drag range, Mod/Shift-click

**Files:**
- Create: `src/components/images/gallery-selection.ts`, `src/composables/use-long-press-select.ts`
- Modify: `src/components/images/ImageGallery.vue`
- Test: `src/components/images/__tests__/gallery-selection.test.ts`, `src/composables/__tests__/use-long-press-select.test.ts`

**Interfaces:**
- Produces:
  - `interface Selection { order: string[]; anchor: string | null }`
  - `emptySelection(): Selection`
  - `toggle(selection: Selection, path: string): Selection`
  - `selectRange(items: string[], base: string[], anchor: string, target: string): Selection` — `base` is the selection before the gesture began; the range goes from `anchor` towards `target` in that direction and is appended to `base` without duplicates.
  - `selectAll(items: string[]): Selection`
  - `useLongPressSelect(options: { delay?: number; slop?: number; onStart(path: string): void; onExtend(path: string): void; onEnd(): void; scroller: () => HTMLElement | undefined }): { onPointerDown(event: PointerEvent, path: string): void; suppressClick(): boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/images/__tests__/gallery-selection.test.ts
import { describe, expect, it } from "vitest";
import { emptySelection, selectAll, selectRange, toggle } from "@/components/images/gallery-selection";

const items = ["a", "b", "c", "d", "e"];

describe("gallery selection", () => {
  it("keeps the order in which items were toggled", () => {
    const s = toggle(toggle(toggle(emptySelection(), "c"), "a"), "e");
    expect(s.order).toEqual(["c", "a", "e"]);
    expect(toggle(s, "a").order).toEqual(["c", "e"]);
  });

  it("selects from the anchor towards the target, in that direction", () => {
    expect(selectRange(items, [], "b", "d").order).toEqual(["b", "c", "d"]);
    expect(selectRange(items, [], "d", "b").order).toEqual(["d", "c", "b"]);
  });

  it("shrinks back when the pointer returns, keeping the earlier selection", () => {
    const base = ["e"];
    expect(selectRange(items, base, "a", "c").order).toEqual(["e", "a", "b", "c"]);
    expect(selectRange(items, base, "a", "a").order).toEqual(["e", "a"]);
  });

  it("selects all in grid order", () => {
    expect(selectAll(items).order).toEqual(items);
  });
});
```

```ts
// src/composables/__tests__/use-long-press-select.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPressSelect } from "@/composables/use-long-press-select";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function pointer(type: string, x = 0, y = 0) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, button: 0 });
}

describe("useLongPressSelect", () => {
  it("starts after the delay and extends to tiles under the pointer", () => {
    const onStart = vi.fn(), onExtend = vi.fn(), onEnd = vi.fn();
    const tile = document.createElement("div");
    tile.dataset.galleryPath = "b";
    document.body.append(tile);
    document.elementFromPoint = vi.fn(() => tile);
    const press = useLongPressSelect({ onStart, onExtend, onEnd, scroller: () => undefined });
    press.onPointerDown(pointer("pointerdown"), "a");
    vi.advanceTimersByTime(499);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledWith("a");
    window.dispatchEvent(pointer("pointermove", 50, 50));
    expect(onExtend).toHaveBeenCalledWith("b");
    window.dispatchEvent(pointer("pointerup"));
    expect(onEnd).toHaveBeenCalled();
    expect(press.suppressClick()).toBe(true);
  });

  it("cancels when the pointer moves before the delay (a scroll, not a press)", () => {
    const onStart = vi.fn();
    const press = useLongPressSelect({ onStart, onExtend: vi.fn(), onEnd: vi.fn(), scroller: () => undefined });
    press.onPointerDown(pointer("pointerdown", 0, 0), "a");
    window.dispatchEvent(pointer("pointermove", 0, 20));
    vi.advanceTimersByTime(600);
    expect(onStart).not.toHaveBeenCalled();
    expect(press.suppressClick()).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/components/images src/composables/__tests__/use-long-press-select.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `gallery-selection.ts`**

```ts
export interface Selection {
  /** Selected paths in the order the user picked them; rename numbers follow it. */
  order: string[];
  anchor: string | null;
}

export const emptySelection = (): Selection => ({ order: [], anchor: null });

export function toggle(selection: Selection, path: string): Selection {
  return selection.order.includes(path)
    ? { order: selection.order.filter((item) => item !== path), anchor: path }
    : { order: [...selection.order, path], anchor: path };
}

export function selectRange(
  items: string[],
  base: string[],
  anchor: string,
  target: string,
): Selection {
  const from = items.indexOf(anchor);
  const to = items.indexOf(target);
  if (from < 0 || to < 0) return { order: base, anchor };
  const step = to >= from ? 1 : -1;
  const range: string[] = [];
  for (let i = from; i !== to + step; i += step) range.push(items[i]!);
  return { order: [...base.filter((path) => !range.includes(path)), ...range], anchor };
}

export const selectAll = (items: string[]): Selection => ({
  order: [...items],
  anchor: items[0] ?? null,
});
```

- [ ] **Step 4: Implement `use-long-press-select.ts`**

```ts
export interface LongPressOptions {
  delay?: number;
  slop?: number;
  onStart(path: string): void;
  onExtend(path: string): void;
  onEnd(): void;
  scroller(): HTMLElement | undefined;
}

const EDGE = 48;

/**
 * Android-gallery selection: hold a tile to select it, keep holding and move
 * to select every tile from it to the one under the pointer. Pointer events,
 * not HTML5 drag, so dropping files onto the gallery keeps working.
 */
export function useLongPressSelect(options: LongPressOptions) {
  const delay = options.delay ?? 500;
  const slop = options.slop ?? 8;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start = { x: 0, y: 0 };
  let active = false;
  let suppress = false;
  let frame = 0;
  let lastY = 0;

  function cleanup() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  }
  function autoscroll() {
    const scroller = options.scroller();
    if (!active || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const delta = lastY < box.top + EDGE ? -12 : lastY > box.bottom - EDGE ? 12 : 0;
    if (delta) scroller.scrollBy(0, delta);
    frame = requestAnimationFrame(autoscroll);
  }
  function move(event: PointerEvent) {
    lastY = event.clientY;
    if (!active) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) cleanup();
      return;
    }
    const tile = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-gallery-path]");
    if (tile?.dataset.galleryPath) options.onExtend(tile.dataset.galleryPath);
  }
  function up() {
    if (active) {
      suppress = true;
      options.onEnd();
    }
    active = false;
    cleanup();
  }
  function onPointerDown(event: PointerEvent, path: string) {
    if (event.button !== 0) return;
    cleanup();
    suppress = false;
    start = { x: event.clientX, y: event.clientY };
    lastY = event.clientY;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    timer = setTimeout(() => {
      active = true;
      options.onStart(path);
      frame = requestAnimationFrame(autoscroll);
    }, delay);
  }
  /** True once after a long press, so the click that ends it does not open the image. */
  function suppressClick() {
    const value = suppress;
    suppress = false;
    return value;
  }
  return { onPointerDown, suppressClick };
}
```

- [ ] **Step 5: Wire selection into `ImageGallery.vue`**

```ts
import { emptySelection, selectAll, selectRange, toggle, type Selection } from "./gallery-selection";
import { useLongPressSelect } from "@/composables/use-long-press-select";

const selection = ref<Selection>(emptySelection());
const selecting = computed(() => selection.value.order.length > 0);
let gestureBase: string[] = [];
let gestureAnchor = "";
const scroller = ref<HTMLElement>();
const press = useLongPressSelect({
  onStart(path) {
    gestureBase = selection.value.order.filter((item) => item !== path);
    gestureAnchor = path;
    selection.value = selectRange(items.value, gestureBase, path, path);
  },
  onExtend(path) {
    selection.value = selectRange(items.value, gestureBase, gestureAnchor, path);
  },
  onEnd() {},
  scroller: () => scroller.value,
});

function onTileClick(event: MouseEvent, path: string) {
  if (press.suppressClick()) return;
  if (event.shiftKey && selection.value.anchor) {
    selection.value = selectRange(items.value, selection.value.order, selection.value.anchor, path);
  } else if (event.metaKey || event.ctrlKey || selecting.value) {
    selection.value = toggle(selection.value, path);
  } else open(path);
}
```

Extend `onKeydown`: `Mod+A` → `selection.value = selectAll(items.value)` (prevent default); `Escape` → `selection.value = emptySelection()`; `Space` → toggle the focused tile.

On the tile: `@pointerdown="press.onPointerDown($event, path)"`, `@click="onTileClick($event, path)"`, `:selected="selection.order.includes(path)"`, `:order="selecting ? selection.order.indexOf(path) + 1 || undefined : undefined"`. Put `ref="scroller"` on the gallery's scroll container: the `single` pane content div in `EditorView` scrolls, so give the gallery root `class="min-h-0 flex-1 overflow-auto"` and use it as the scroller. Also set `touch-action: none` on tiles in selection mode (`:class="{ 'touch-none': selecting }"`) so a drag on a touch screen selects instead of scrolling.

Show a selection bar above the grid when `selecting`: "Selected: N" (`gallery.selected`), "Clear" (`gallery.clear`). Tasks 14 and 15 add Delete and Rename buttons to it.

| key | ru | en | zh-CN |
| --- | --- | --- | --- |
| `gallery.selected` | Выбрано: {count} | Selected: {count} | 已选择：{count} |
| `gallery.clear` | Снять выделение | Clear selection | 取消选择 |

- [ ] **Step 6: Add a gallery component test** (append to `ImageGallery.test.ts`)

```ts
  it("toggles with Mod+click and numbers the tiles in selection order", async () => {
    mountGallery();
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("gridcell", { name: /spare\.png/ }));
    await user.click(screen.getByRole("gridcell", { name: /cover\.png/ }));
    await user.keyboard("{/Meta}");
    expect(within(screen.getByRole("gridcell", { name: /spare\.png/ })).getByText("1")).toBeTruthy();
    expect(within(screen.getByRole("gridcell", { name: /cover\.png/ })).getByText("2")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/selected:/i)).toBeNull();
  });
```

- [ ] **Step 7: Run and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/components/images src/composables/use-long-press-select.ts src/composables/__tests__/use-long-press-select.test.ts src/locales
git commit -m "feat(images): long-press and drag selection in the gallery"
```

---

### Task 14: Batch delete with one undo

**Files:**
- Modify: `src/services/book/resources.ts` (add `removeResources`), `src/composables/use-book-search.ts` (`deleteResources`, `deleteResource` delegates), `src/components/images/ImageGallery.vue`, `src/locales/*`
- Test: `src/services/book/__tests__/resources.test.ts`, `src/composables/__tests__/use-book-search.test.ts` (or the file that covers `deleteResource` today: `grep -rln "deleteResource" src --include=*.test.ts`)

**Interfaces:**
- Produces: `removeResources(book: Book, paths: string[]): BookMutation`; `useBookSearch().deleteResources(paths: string[]): void`.

- [ ] **Step 1: Write the failing tests**

```ts
  it("removes several resources and clears a removed cover", () => {
    const result = removeResources(bookWith(["images/a.png", "images/b.png", "images/c.png"], "images/b.png"), [
      "images/a.png",
      "images/b.png",
      "images/missing.png",
    ]);
    expect([...result.book.resources.keys()]).toEqual(["images/c.png"]);
    expect(result.book.metadata.cover).toBeNull();
    expect(result.metadataCoverChanged).toBe(true);
    expect(result.removedResources).toEqual(new Set(["images/a.png", "images/b.png"]));
  });
```

(`bookWith(paths, cover)` — a small helper in the test file that builds a `Book` with those PNG resources.)

Composable:

```ts
  it("deletes several images under one toast that restores them all", () => {
    const search = useBookSearch();
    search.deleteResources(["images/a.png", "images/b.png"]);
    const notifications = useNotificationsStore();
    expect(notifications.items).toHaveLength(1);
    expect(notifications.items[0]!.message).toBe("2 images deleted");
    notifications.items[0]!.undo!();
    expect(project.book!.resources.has("images/a.png")).toBe(true);
    expect(project.book!.resources.has("images/b.png")).toBe(true);
  });
```

(Use the notifications store's real field names; check `src/stores/notifications.ts`.)

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/services/book src/composables`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/services/book/resources.ts
export function removeResources(book: Book, paths: string[]): BookMutation {
  const resources = new Map(book.resources);
  const removed = new Set(paths.filter((path) => resources.delete(path)));
  const coverRemoved = book.metadata.cover !== null && removed.has(book.metadata.cover);
  return {
    book: {
      ...book,
      resources,
      metadata: coverRemoved ? { ...book.metadata, cover: null } : book.metadata,
    },
    metadataCoverChanged: coverRemoved,
    changedChapters: new Set(),
    removedChapters: new Set(),
    changedResources: new Set(),
    removedResources: removed,
  };
}

export function removeResource(book: Book, path: string): BookMutation {
  return removeResources(book, [path]);
}
```

In `use-book-search.ts`, generalize the body of `deleteResource` to `deleteResources(paths)`: capture `Map<path, Resource>` of the existing ones, call `removeResources`, and on undo put them all back (and the cover, under the existing `coverRevision` check). `canUndo` requires that none of the paths came back in the meantime. Message:

```ts
      message:
        removed.size === 1
          ? t("delete.imageToast", "Image deleted")
          : t("delete.imagesToast", "{count} images deleted").replace("{count}", String(removed.size)),
```

`deleteResource(path)` becomes `deleteResources([path])`. Return `deleteResources` from the composable.

- [ ] **Step 4: Wire the gallery**

In `ImageGallery.vue`, add a confirmation flow like the Explorer's chapter delete:

```ts
const search = useBookSearch();
const settings = useSettingsStore();
const pendingDelete = ref<string[] | null>(null);
const usage = computed(() => (project.book ? collectImageUsage(project.book) : new Map<string, string[]>()));

function requestDelete(paths: string[]) {
  if (paths.length === 0) return;
  if (!settings.confirmDelete) return finishDelete(paths);
  pendingDelete.value = paths;
}
function finishDelete(paths: string[]) {
  search.deleteResources(paths);
  selection.value = emptySelection();
}
function confirmDelete(value: { askAgain: boolean }) {
  if (pendingDelete.value) finishDelete(pendingDelete.value);
  pendingDelete.value = null;
  if (!value.askAgain) {
    settings.confirmDelete = false;
    void settings.persist();
  }
}
const deleteDetails = computed(() =>
  (pendingDelete.value ?? [])
    .map((path) => {
      const chapters = usage.value.get(path) ?? [];
      const name = path.replace(/^images\//, "");
      return chapters.length ? `${name} — ${t("images.usedIn", "Used in")}: ${chapters.length}` : name;
    })
    .join("\n"),
);
```

Hook it up to: the context-menu "delete" (deletes the selection if the tile is selected, otherwise just that tile), the selection bar's Delete button, the `Delete`/`Backspace` key in `onKeydown`, and the "Delete unused images" button (`requestDelete(all.value.filter((p) => !used.value.has(p)))`). Render `<ConfirmDialog>` with title `t("delete.imagesTitle", "Delete images")`, message `t("delete.imagesMessage", "These images will be removed from the project.")` and `:details="deleteDetails"`.

| key | ru | en | zh-CN |
| --- | --- | --- | --- |
| `delete.imagesToast` | Удалено изображений: {count} | {count} images deleted | 已删除 {count} 张图片 |
| `delete.imagesTitle` | Удалить изображения | Delete images | 删除图片 |
| `delete.imagesMessage` | Эти изображения будут удалены из проекта. | These images will be removed from the project. | 这些图片将从项目中删除。 |
| `common.delete` (if missing) | Удалить | Delete | 删除 |

- [ ] **Step 5: Run and commit**

Run: `pnpm check`
Expected: PASS.

```bash
git add src/services/book src/composables src/components/images src/locales
git commit -m "feat(images): delete selected images with a single undo"
```

---

### Task 15: Batch rename

**Files:**
- Create: `src/services/book/rename-resources.ts`, `src/components/images/RenameImagesDialog.vue`, `src/composables/use-image-actions.ts`
- Modify: `src/utils/paths.ts` (allow `_`, add `sanitizeNameInput`), `src/components/editor/editor-commands.ts` (`replaceChapterEditorText` option `addToHistory`), `src/components/images/ImageGallery.vue`, `src/locales/*`
- Test: `src/services/book/__tests__/rename-resources.test.ts`, `src/utils/__tests__/paths.test.ts`, `src/components/images/__tests__/RenameImagesDialog.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeNameInput(value: string): string` — lowercase, keeps `[a-z0-9_-]`.
  - `type RenamePlan = { renames: Array<{ from: string; to: string }> } | { error: "empty" | "conflict"; path?: string }`
  - `planBatchRename(book: Book, selection: string[], name: string): RenamePlan`
  - `renameResources(book: Book, renames: Array<{ from: string; to: string }>): { mutation: BookMutation; chapterEdits: Map<string, Array<{ from: number; to: number; insert: string }>> }`
  - `replaceChapterEditorText(chapterId, changes, options?: { addToHistory?: boolean }): string`
  - `useImageActions().renameImages(renames): void`

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/book/__tests__/rename-resources.test.ts
import { describe, expect, it } from "vitest";
import { planBatchRename, renameResources } from "@/services/book/rename-resources";
import type { Book } from "@/types/book";

const res = { mediaType: "image/png" as const, bytes: new Uint8Array([1]) };
function book(paths: string[], chapters: string[], cover: string | null = null, css: string | null = null): Book {
  return {
    metadata: { id: "urn:uuid:x", title: "T", version: null, created: "", modified: "", language: "en", authors: [], translators: [], series: null, description: null, cover },
    chapters: chapters.map((source, i) => ({ id: `chapter${i}`, source })),
    resources: new Map(paths.map((p) => [p, res])),
    customCss: css,
  };
}

describe("planBatchRename", () => {
  it("numbers in selection order with zero padding by count", () => {
    const paths = Array.from({ length: 10 }, (_, i) => `images/p${i}.png`);
    const plan = planBatchRename(book(paths, []), [paths[3]!, ...paths.filter((_, i) => i !== 3)], "scene");
    expect("renames" in plan && plan.renames[0]).toEqual({ from: "images/p3.png", to: "images/scene_01.png" });
    expect("renames" in plan && plan.renames[9]!.to).toBe("images/scene_10.png");
  });

  it("keeps each file's extension and pads 1–9 to one digit", () => {
    const plan = planBatchRename(book(["images/a.jpg", "images/b.png"], []), ["images/b.png", "images/a.jpg"], "x");
    expect(plan).toEqual({ renames: [{ from: "images/b.png", to: "images/x_1.png" }, { from: "images/a.jpg", to: "images/x_2.jpg" }] });
  });

  it("rejects an empty name and a clash with an unselected image", () => {
    expect(planBatchRename(book(["images/a.png"], []), ["images/a.png"], "")).toEqual({ error: "empty" });
    expect(planBatchRename(book(["images/a.png", "images/x_1.png"], []), ["images/a.png"], "x")).toEqual({ error: "conflict", path: "images/x_1.png" });
  });

  it("allows swapping names inside the selection", () => {
    const plan = planBatchRename(book(["images/x_1.png", "images/x_2.png"], []), ["images/x_2.png", "images/x_1.png"], "x");
    expect("renames" in plan).toBe(true);
  });
});

describe("renameResources", () => {
  it("rewrites chapter references, the cover and css urls, but not look-alike names", () => {
    const source = "![a](images/a.png) ![b](images/aa.png)\n\n![](images/a.png)";
    const result = renameResources(
      book(["images/a.png", "images/aa.png"], [source], "images/a.png", 'p { background: url("images/a.png") }'),
      [{ from: "images/a.png", to: "images/z_1.png" }],
    );
    expect(result.mutation.book.chapters[0]!.source).toBe("![a](images/z_1.png) ![b](images/aa.png)\n\n![](images/z_1.png)");
    expect(result.mutation.book.metadata.cover).toBe("images/z_1.png");
    expect(result.mutation.book.customCss).toBe('p { background: url("images/z_1.png") }');
    expect([...result.mutation.book.resources.keys()].sort()).toEqual(["images/aa.png", "images/z_1.png"]);
    expect(result.mutation.removedResources).toEqual(new Set(["images/a.png"]));
    expect(result.mutation.changedResources).toEqual(new Set(["images/z_1.png"]));
    expect(result.chapterEdits.get("chapter0")).toEqual([
      { from: 5, to: 17, insert: "images/z_1.png" },
      { from: 44, to: 56, insert: "images/z_1.png" },
    ]);
  });

  it("swaps two names in one step", () => {
    const result = renameResources(book(["images/a.png", "images/b.png"], ["![](images/a.png)![](images/b.png)"]), [
      { from: "images/a.png", to: "images/b.png" },
      { from: "images/b.png", to: "images/a.png" },
    ]);
    expect(result.mutation.book.chapters[0]!.source).toBe("![](images/b.png)![](images/a.png)");
    expect(result.mutation.book.resources.size).toBe(2);
  });
});
```

```ts
// src/utils/__tests__/paths.test.ts (append)
  it("keeps underscores in resource names", () => {
    expect(normalizeResourceName("Scene_01.PNG")).toBe("scene_01.png");
  });
  it("filters name input to lowercase latin, digits, _ and -", () => {
    expect(sanitizeNameInput("Сцена Scene_1-A!")).toBe("scene_1-a");
  });
```

```ts
// src/components/images/__tests__/RenameImagesDialog.test.ts
  it("previews old → new names and blocks a conflicting name", async () => {
    // render with paths ["images/a.png", "images/b.jpg"], book also has "images/x_1.png" unselected
    await userEvent.type(screen.getByRole("textbox", { name: /new name/i }), "Ш-x");
    expect(screen.getByRole("textbox", { name: /new name/i })).toHaveValue("-x");
    await userEvent.clear(screen.getByRole("textbox", { name: /new name/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /new name/i }), "y");
    expect(screen.getByText("a.png")).toBeTruthy();
    expect(screen.getByText("y_1.png")).toBeTruthy();
    expect(screen.getByText("y_2.jpg")).toBeTruthy();
    await userEvent.clear(screen.getByRole("textbox", { name: /new name/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /new name/i }), "x");
    expect(screen.getByRole("button", { name: /rename/i })).toBeDisabled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run src/services/book src/utils src/components/images`
Expected: FAIL.

- [ ] **Step 3: Implement the name rules** — `src/utils/paths.ts`:

```ts
      .replace(/[^a-zA-Z0-9_]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
```

(in `normalizeResourceName`, replacing the two existing lines), and:

```ts
/** What the rename field accepts: the same characters file names keep. */
export function sanitizeNameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
```

- [ ] **Step 4: Implement `rename-resources.ts`**

```ts
import type { Book, BookMutation } from "@/types/book";

export interface ResourceRename {
  from: string;
  to: string;
}
export type RenamePlan = { renames: ResourceRename[] } | { error: "empty" | "conflict"; path?: string };
export type TextEdit = { from: number; to: number; insert: string };

const IMAGE_REF = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

export function planBatchRename(book: Book, selection: string[], name: string): RenamePlan {
  if (name === "") return { error: "empty" };
  const width = String(selection.length).length;
  const selected = new Set(selection);
  const renames: ResourceRename[] = [];
  for (const [index, from] of selection.entries()) {
    const extension = from.slice(from.lastIndexOf("."));
    const to = `images/${name}_${String(index + 1).padStart(width, "0")}${extension}`;
    if (book.resources.has(to) && !selected.has(to)) return { error: "conflict", path: to };
    if (to !== from) renames.push({ from, to });
  }
  return { renames };
}

/**
 * Every rewrite is computed against the original text, so swaps (a→b, b→a)
 * need no temporary names.
 */
export function renameResources(
  book: Book,
  renames: ResourceRename[],
): { mutation: BookMutation; chapterEdits: Map<string, TextEdit[]> } {
  const map = new Map(renames.map(({ from, to }) => [from, to]));
  const chapterEdits = new Map<string, TextEdit[]>();
  const chapters = book.chapters.map((chapter) => {
    const edits: TextEdit[] = [];
    for (const match of chapter.source.matchAll(IMAGE_REF)) {
      const target = map.get(match[1]!);
      if (!target) continue;
      const from = match.index! + match[0].length - 1 - match[1]!.length;
      edits.push({ from, to: from + match[1]!.length, insert: target });
    }
    if (edits.length === 0) return chapter;
    chapterEdits.set(chapter.id, edits);
    let source = chapter.source;
    for (const edit of [...edits].reverse())
      source = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
    return { ...chapter, source };
  });
  const resources = new Map(
    [...book.resources].map(([path, resource]) => [map.get(path) ?? path, resource] as const),
  );
  const cover = book.metadata.cover ? (map.get(book.metadata.cover) ?? book.metadata.cover) : null;
  const customCss =
    book.customCss?.replace(CSS_URL, (whole, quote: string, path: string) => {
      const target = map.get(path.trim());
      return target ? `url(${quote}${target}${quote})` : whole;
    }) ?? null;
  const newPaths = new Set(renames.map(({ to }) => to));
  return {
    mutation: {
      book: { ...book, chapters, resources, customCss, metadata: { ...book.metadata, cover } },
      metadataCoverChanged: cover !== book.metadata.cover,
      changedChapters: new Set(chapterEdits.keys()),
      removedChapters: new Set(),
      changedResources: newPaths,
      removedResources: new Set(renames.map(({ from }) => from).filter((path) => !newPaths.has(path))),
    },
    chapterEdits,
  };
}
```

Check the `from` offset arithmetic against the test (`![a](images/a.png)` → src starts at 5). The closing `)` is the last character of `match[0]`, hence `length - 1 - src.length`.

- [ ] **Step 5: Keep rename out of each chapter's undo history**

Mod+Z inside one chapter after a rename would bring back a reference to a file that no longer exists. The rename has its own undo toast, so its text edits skip the editor history. In `editor-commands.ts`:

```ts
import { Transaction } from "@codemirror/state";

function applyChapterEditorChanges(
  chapterId: string,
  changes: Array<{ from: number; to: number; insert: string }> | { from: number; to: number; insert: string },
  addToHistory = true,
): EditorState | null {
  const state = currentChapterEditorState(chapterId);
  if (!state) return null;
  const transaction = state.update({
    changes,
    annotations: addToHistory ? [] : [Transaction.addToHistory.of(false)],
  });
  chapterEditorViews.get(chapterId)?.dispatch(transaction);
  chapterEditorStates.set(chapterId, transaction.state);
  return transaction.state;
}

export function replaceChapterEditorText(
  chapterId: string,
  changes: Array<{ from: number; to: number; insert: string }>,
  options: { addToHistory?: boolean } = {},
): string {
  const state = applyChapterEditorChanges(chapterId, changes, options.addToHistory ?? true);
  if (!state) throw new Error(`Editor state not found for ${chapterId}`);
  return state.doc.toString();
}
```

Add an `editor-commands.test.ts` case: after `replaceChapterEditorText(id, edits, { addToHistory: false })`, `undoDepth(state)` is unchanged.

- [ ] **Step 6: Implement `use-image-actions.ts`**

```ts
import { createChapterEditor, chapterEditorStates, replaceChapterEditorText } from "@/components/editor/editor-commands";
import { renameResources, type ResourceRename } from "@/services/book/rename-resources";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";

export function useImageActions() {
  const project = useProjectStore();
  const notifications = useNotificationsStore();
  const { t } = useSafeI18n();

  function apply(renames: ResourceRename[]): boolean {
    if (!project.book || renames.length === 0) return false;
    const { mutation, chapterEdits } = renameResources(project.book, renames);
    for (const [chapterId, edits] of chapterEdits) {
      const chapter = project.book.chapters.find((item) => item.id === chapterId)!;
      if (!chapterEditorStates.has(chapterId)) createChapterEditor(chapterId, chapter.source);
      replaceChapterEditorText(chapterId, [...edits].sort((a, b) => b.from - a.from), { addToHistory: false });
    }
    project.applyMutation(mutation);
    return true;
  }

  function renameImages(renames: ResourceRename[]) {
    const generation = project.bookGeneration;
    if (!apply(renames)) return;
    const canUndo = () =>
      project.bookGeneration === generation &&
      renames.every(({ to }) => project.book?.resources.has(to));
    notifications.add({
      message: t("gallery.renamedToast", "{count} images renamed").replace("{count}", String(renames.length)),
      kind: "success",
      undoState: canUndo,
      undo: () => {
        if (canUndo()) apply(renames.map(({ from, to }) => ({ from: to, to: from })));
      },
    });
  }

  return { renameImages };
}
```

Add a unit test with a fake book: rename, check the notification, call `undo`, check the original paths and chapter text are back.

- [ ] **Step 7: Implement `RenameImagesDialog.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planBatchRename, type ResourceRename } from "@/services/book/rename-resources";
import { sanitizeNameInput } from "@/utils/paths";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = defineProps<{ open: boolean; paths: string[] }>();
const emit = defineEmits<{ cancel: []; confirm: [renames: ResourceRename[]] }>();
const project = useProjectStore();
const { t } = useSafeI18n();
const name = ref("");
watch(() => props.open, (open) => open && (name.value = ""));

const plan = computed(() => (project.book ? planBatchRename(project.book, props.paths, name.value) : { error: "empty" as const }));
const preview = computed(() => {
  const width = String(props.paths.length).length;
  return props.paths.map((from, index) => ({
    from: from.replace(/^images\//, ""),
    to: name.value ? `${name.value}_${String(index + 1).padStart(width, "0")}${from.slice(from.lastIndexOf("."))}` : "—",
  }));
});
const error = computed(() =>
  "error" in plan.value && plan.value.error === "conflict"
    ? t("gallery.renameConflict", "{name} already exists").replace("{name}", (plan.value.path ?? "").replace(/^images\//, ""))
    : "",
);
function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const clean = sanitizeNameInput(input.value);
  if (clean !== input.value) input.value = clean;
  name.value = clean;
}
function confirm() {
  if ("renames" in plan.value) emit("confirm", plan.value.renames);
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !value && emit('cancel')">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("gallery.renameTitle", "Rename images") }}</DialogTitle>
        <DialogDescription>{{ t("gallery.renameHint", "Images are numbered in the order you selected them. Latin letters, digits, _ and - only.") }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="confirm">
        <Label for="rename-name">{{ t("gallery.newName", "New name") }}</Label>
        <Input id="rename-name" :model-value="name" autocomplete="off" spellcheck="false" @input="onInput" />
        <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
        <ol class="max-h-60 overflow-auto text-sm">
          <li v-for="row in preview" :key="row.from" class="flex gap-2">
            <span class="truncate text-muted-foreground">{{ row.from }}</span>
            <span aria-hidden="true">→</span>
            <span class="truncate">{{ row.to }}</span>
          </li>
        </ol>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('cancel')">{{ t("common.cancel", "Cancel") }}</Button>
          <Button type="submit" :disabled="!('renames' in plan)">{{ t("gallery.renameConfirm", "Rename") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
```

If `Input` emits `update:modelValue` rather than passing native `input` events through, bind `@update:model-value` and sanitize there; keep the visible value equal to `name`.

- [ ] **Step 8: Wire the gallery**

```ts
const { renameImages } = useImageActions();
const renaming = ref<string[] | null>(null);
// context action "rename": renaming.value = selection includes path ? selection.order : [path]
// selection bar: "Rename…" button → renaming.value = selection.value.order
function confirmRename(renames: ResourceRename[]) {
  renameImages(renames);
  renaming.value = null;
  selection.value = emptySelection();
}
```

```vue
    <RenameImagesDialog
      :open="renaming !== null"
      :paths="renaming ?? []"
      @cancel="renaming = null"
      @confirm="confirmRename"
    />
```

Locale keys:

| key | ru | en | zh-CN |
| --- | --- | --- | --- |
| `gallery.renameTitle` | Переименовать изображения | Rename images | 重命名图片 |
| `gallery.renameHint` | Изображения нумеруются в порядке выделения. Только латиница, цифры, _ и -. | Images are numbered in the order you selected them. Latin letters, digits, _ and - only. | 图片按选择顺序编号。仅限拉丁字母、数字、_ 和 -。 |
| `gallery.newName` | Новое имя | New name | 新名称 |
| `gallery.renameConflict` | {name} уже существует | {name} already exists | {name} 已存在 |
| `gallery.renameConfirm` | Переименовать | Rename | 重命名 |
| `gallery.renamedToast` | Переименовано изображений: {count} | {count} images renamed | 已重命名 {count} 张图片 |
| `common.cancel` (if missing) | Отмена | Cancel | 取消 |

- [ ] **Step 9: Run and commit**

Run: `pnpm check && pnpm test:e2e`
Expected: PASS.

```bash
git add src/services/book src/utils src/components src/composables src/locales
git commit -m "feat(images): batch rename in selection order, with references updated"
```

---

### Task 16: Record the changed decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`, `AGENTS.md`, `docs/release-checklist.md`, `docs/superpowers/notes/2026-10-03-issues.md`

- [ ] **Step 1: Update the base spec**

- §5 (EPUB): replace "Hide `aside` footnotes (Kindle shows them as popups)" with the endnotes design. Notes go to `notes.xhtml`, last in the spine and in nav/ncx. Numbering is sequential across the book. References are `a.noteref` with `id="fnref-N"` → `notes.xhtml#fn-N`. Each note is a `div.endnote` that starts with a backlink. Give the reason: Calibre MOBI conversion and Kindle never showed hidden asides.
- Layout (B v2): "dividers run the full window height" now has an exception. A content header (breadcrumbs plus the formatting toolbar) spans source and preview; the source/preview divider starts under it. The sidebar divider is still full height.
- Section 4a/4b: Explorer → Book has Metadata, Styles and Images; the Images section is gone. The images page is a gallery: filters, long-press and drag selection, Mod/Shift-click, batch delete with one undo, batch rename `name_NN` in selection order. Rename is now in scope, replacing "Renaming: none". Image names may contain `_`.
- Section 4a: the formatting toolbar and its buttons.
- Link the roadmap specs: `2026-10-03-azw3-export-design.md` and `2026-10-03-kindle-css-checker-design.md`.

- [ ] **Step 2: Update `AGENTS.md`**

Mirror the same points in Russian, in the matching sections ("Связь с NovLang": the `display:none` rule is no longer used; sections 4a, 4b and 5; the layout). Add a status line dated 2026-10-03 and a "Roadmap" subsection that points to the two new specs.

- [ ] **Step 3: Extend `docs/release-checklist.md`**

```markdown
- [ ] Footnotes: export a book with notes in two chapters. In Calibre's viewer a note
      link opens the note; after "Send to device" (MOBI and AZW3) on a Paperwhite the
      note opens as a popup, and the number in the note leads back to the text.
- [ ] Preview: clicking a note number scrolls to the note and back (macOS WKWebView,
      Windows WebView2, Linux WebKitGTK).
- [ ] Gallery: long press selects, dragging extends the range, rename numbers follow
      the selection order, one Undo restores a batch delete.
```

- [ ] **Step 4: Close the notes**

At the top of `docs/superpowers/notes/2026-10-03-issues.md` add: "Implemented by `docs/superpowers/plans/2026-10-03-user-feedback-fixes.md`; roadmap items 2 and 4a are in `docs/superpowers/specs/2026-10-03-*.md`."

- [ ] **Step 5: Commit**

```bash
git add docs AGENTS.md
git commit -m "docs: record endnotes, content header, gallery and rename decisions"
```
