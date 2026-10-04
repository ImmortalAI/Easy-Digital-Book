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
    expect(render("A7").html).toBe("<p>A7</p>");
  });

  it("turns references inside a note into plain text", () => {
    const { notes } = render("A[^1]\n\n[^1]: See[^1]");
    expect(renderToHTML({ type: "document", children: notes[0]!.children })).toBe("<p>See[1]</p>");
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
