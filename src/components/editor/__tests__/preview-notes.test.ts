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
