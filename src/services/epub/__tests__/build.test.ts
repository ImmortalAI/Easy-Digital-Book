import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { buildEpub } from "@/services/epub/build";
import { opf } from "@/services/epub/opf";
import type { Book } from "@/types/book";
import type { ImageProcessor } from "@/types/platform";

const processor: ImageProcessor = {
  process: async ({ bytes, plan }) => ({
    bytes,
    mediaType: plan.format === "png" ? "image/png" : "image/jpeg",
    width: plan.width,
    height: plan.height,
  }),
  dispose: vi.fn<() => void>(),
};
const book: Book = {
  metadata: {
    id: "urn:uuid:test",
    title: "Novel",
    version: "1",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    language: "en",
    authors: ["Author"],
    translators: ["Translator"],
    series: { name: "Series", index: 2 },
    description: "A book",
    cover: "images/cover.png",
  },
  chapters: [
    { id: "one", source: "# One\nHello [^a].\n\n[^a]: Note" },
    { id: "two", source: "No heading" },
  ],
  resources: new Map([
    [
      "images/cover.png",
      {
        mediaType: "image/png",
        bytes: new Uint8Array([
          137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8,
          6,
        ]),
      },
    ],
  ]),
  customCss: null,
};

describe("buildEpub", () => {
  it("writes a structurally valid deterministic EPUB3 archive", async () => {
    const deps = { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") };
    const bytes = await buildEpub(
      book,
      { imagePreset: "original", grayscale: false, titlePage: true, versionInTitle: true },
      deps,
    );
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names.slice(0, 3)).toEqual(["mimetype", "META-INF/container.xml", "OEBPS/content.opf"]);
    expect(zip.files.mimetype.options.compression).toBeNull();
    expect(await zip.file("OEBPS/content.opf")?.async("string")).toContain("dcterms:modified");
    expect(await zip.file("OEBPS/content.opf")?.async("string")).toContain("urn:uuid:test");
    expect(names).toContain("OEBPS/title.xhtml");
    expect(names).toContain("OEBPS/images/cover.png");
    const again = await buildEpub(
      book,
      { imagePreset: "original", grayscale: false, titlePage: true, versionInTitle: true },
      deps,
    );
    expect([...again]).toEqual([...bytes]);
  });

  it("uses unique translator refinement ids when names repeat", () => {
    const duplicate = { ...book, metadata: { ...book.metadata, translators: ["Same", "Same"] } };
    const output = opf(duplicate, [], [], false, new Date("2026-01-02T03:04:05Z"), false);
    expect(output).toContain('id="translator-0"');
    expect(output).toContain('id="translator-1"');
    expect(output).toContain('refines="#translator-0"');
    expect(output).toContain('refines="#translator-1"');
  });

  it("uses probed GIF and WebP dimensions when planning image processing", async () => {
    const gifBook = {
      ...book,
      metadata: { ...book.metadata, cover: null },
      chapters: [{ id: "one", source: "![gif](images/a.gif)\n\n![webp](images/a.webp)" }],
      resources: new Map([
        ["images/a.gif", { mediaType: "image/gif" as const, bytes: new Uint8Array([1]) }],
        ["images/a.webp", { mediaType: "image/webp" as const, bytes: new Uint8Array([2]) }],
      ]),
    };
    const process = vi.fn<ImageProcessor["process"]>(processor.process);

    await buildEpub(
      gifBook,
      {
        imagePreset: "kindle-paperwhite",
        grayscale: false,
        titlePage: false,
        versionInTitle: false,
      },
      {
        imageProcessor: { ...processor, process },
        now: () => new Date("2026-01-02T03:04:05Z"),
        imageDimensions: async (resource) =>
          resource.mediaType === "image/gif"
            ? { width: 2000, height: 1000 }
            : { width: 1600, height: 900, hasAlpha: true },
      },
    );

    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ width: 1264, height: 632 }) }),
      undefined,
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ width: 1264, height: 711, format: "png" }),
      }),
      undefined,
    );
  });

  it("keeps converted resources with equal basenames at unique paths", async () => {
    const duplicateNames = {
      ...book,
      metadata: { ...book.metadata, cover: null },
      chapters: [{ id: "one", source: "![one](images/a.webp)\n\n![two](images/a.jpg)" }],
      resources: new Map([
        ["images/a.webp", { mediaType: "image/webp" as const, bytes: new Uint8Array([1]) }],
        ["images/a.jpg", { mediaType: "image/jpeg" as const, bytes: new Uint8Array([2]) }],
      ]),
    };
    const bytes = await buildEpub(
      duplicateNames,
      { imagePreset: "original", grayscale: false, titlePage: false, versionInTitle: false },
      { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") },
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(["OEBPS/images/a.jpg", "OEBPS/images/a-2.jpg"]),
    );
  });

  it("rewrites missing local custom CSS images and keeps OPF paths relative to OEBPS", async () => {
    const cssBook = {
      ...book,
      metadata: { ...book.metadata, cover: null },
      chapters: [{ id: "one", source: "Text" }],
      resources: new Map([
        ["images/a.png", { mediaType: "image/png" as const, bytes: new Uint8Array([1]) }],
      ]),
      customCss:
        ".ok { background: url( images/a.png ); } .missing { background: url( images/no.png ); }",
    };
    const bytes = await buildEpub(
      cssBook,
      { imagePreset: "original", grayscale: false, titlePage: false, versionInTitle: false },
      { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") },
    );
    const zip = await JSZip.loadAsync(bytes);
    const opfXml = await zip.file("OEBPS/content.opf")?.async("string");
    const css = await zip.file("OEBPS/custom.css")?.async("string");
    expect(opfXml).toContain('href="images/a.png"');
    expect(opfXml).not.toContain("OEBPS/images");
    expect(css).toContain('url("images/a.png")');
    expect(css).not.toContain("images/no.png");
  });

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
});
