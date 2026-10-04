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
