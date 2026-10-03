import { describe, expect, it } from "vitest";
import { navXhtml } from "@/services/epub/nav";

describe("EPUB navigation", () => {
  it("keeps the title page out of the TOC and omits an invalid bodymatter landmark", () => {
    const nav = navXhtml([], true, "Novel");
    expect(nav).not.toContain('<nav epub:type="toc" id="toc"><h1>Novel</h1><ol><li>');
    expect(nav).toContain('epub:type="titlepage"');
    expect(nav).not.toContain('epub:type="bodymatter"');
  });

  it("uses stable chapter ids in the TOC and landmarks", () => {
    const nav = navXhtml(
      [{ id: "abc12345", title: "Chapter", xhtml: "", referencedPaths: [], notes: [] }],
      false,
      "Novel",
    );
    expect(nav).toContain('href="c-abc12345.xhtml"');
    expect(nav).toContain('epub:type="bodymatter" href="c-abc12345.xhtml"');
  });
});
