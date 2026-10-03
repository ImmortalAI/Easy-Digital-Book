import { describe, expect, it } from "vitest";
import { renderChapter } from "@/services/epub/chapter";
import type { Book } from "@/types/book";

const book: Book = {
  metadata: {
    id: "urn:uuid:test",
    title: "Book",
    version: null,
    created: "",
    modified: "",
    language: "ru",
    authors: [],
    translators: [],
    series: null,
    description: null,
    cover: null,
  },
  chapters: [],
  resources: new Map(),
  customCss: null,
};

describe("renderChapter", () => {
  it("wraps rendered NovLang in valid EPUB XHTML", () => {
    const result = renderChapter(
      { id: "abc12345", source: "# Глава\n\nТекст ![рисунок](images/a.png)" },
      0,
      book,
      new Map([["images/a.png", "images/a.jpg"]]),
    );
    expect(result.xhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(result.xhtml).toContain('src="images/a.jpg"');
    expect(result.title).toBe("Глава");
    expect(result.referencedPaths).toEqual(["images/a.png"]);
  });

  it("removes image nodes without a mapped resource instead of emitting broken links", () => {
    const result = renderChapter(
      { id: "abc12345", source: "Текст ![](images/missing.png) и ![](images/a.png)" },
      2,
      book,
      new Map([["images/a.png", "images/a.png"]]),
    );
    expect(result.xhtml).not.toContain("missing.png");
    expect(result.referencedPaths).toEqual(["images/a.png"]);
  });

  it("uses a localized fallback title when a chapter has no heading", () => {
    const result = renderChapter({ id: "abc12345", source: "Текст" }, 1, book, new Map());
    expect(result.title).toBe("Глава 2");
    expect(result.xhtml).toContain("<title>Глава 2</title>");
  });

  it("exports an empty chapter and extracts heading text through emphasis and strong", () => {
    expect(renderChapter({ id: "empty000", source: "" }, 0, book, new Map()).title).toBe("Глава 1");
    expect(
      renderChapter({ id: "bold0001", source: "# *Bold* **heading**" }, 0, book, new Map()).title,
    ).toBe("Bold heading");
  });

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
});
