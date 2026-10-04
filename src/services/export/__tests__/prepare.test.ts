import { describe, expect, it, vi } from "vitest";
import { prepareExport } from "@/services/export/prepare";
import type { BuildDependencies, ExportOptions } from "@/services/export/types";
import type { Book, Resource } from "@/types/book";
import type { ImageProcessor } from "@/types/platform";

const options: ExportOptions = {
  imagePreset: "kindle-paperwhite",
  grayscale: true,
  titlePage: true,
  versionInTitle: true,
};
const process: ImageProcessor["process"] = async ({ bytes, plan }) => ({
  bytes,
  mediaType: plan.format === "png" ? "image/png" : "image/jpeg",
  width: plan.width,
  height: plan.height,
});
function dependencies(overrides: Partial<BuildDependencies> = {}): BuildDependencies {
  return {
    imageProcessor: { process, dispose: () => {} },
    now: () => {
      throw new Error("Preparation must not read the build clock");
    },
    ...overrides,
  };
}
function book(): Book {
  return {
    metadata: {
      id: "urn:uuid:test",
      title: "Novel",
      version: "v2",
      created: "2026-01-01T00:00:00Z",
      modified: "2026-01-01T00:00:00Z",
      language: "en",
      authors: ["Author"],
      translators: ["Translator"],
      series: { name: "Series", index: 1.5 },
      description: "Description",
      cover: null,
    },
    chapters: [
      {
        id: "one",
        source: "# One\nFirst [^a], again [^a].\n\n[^a]: First note\n\n[^unused]: Unreferenced",
      },
      { id: "two", source: "# Two\nSecond [^a].\n\n[^a]: Second note" },
    ],
    resources: new Map(),
    customCss: "p { color: black; }",
  };
}
const resource = (byte: number, mediaType: Resource["mediaType"] = "image/jpeg"): Resource => ({
  bytes: new Uint8Array([byte]),
  mediaType,
});

describe("prepareExport", () => {
  it("prepares ordered documents, styles and navigation without a TOC title-page entry or build timestamp", async () => {
    const input = book();
    const before = structuredClone(input);
    const prepared = await prepareExport(input, options, dependencies());
    expect(input).toEqual(before);
    expect(prepared.metadata).toEqual(before.metadata);
    expect(prepared.displayTitle).toBe("Novel (v2)");
    expect(prepared.documents.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "title.xhtml", kind: "title" },
      { path: "c-one.xhtml", kind: "chapter" },
      { path: "c-two.xhtml", kind: "chapter" },
      { path: "notes.xhtml", kind: "notes" },
    ]);
    expect(prepared.navigation).toEqual([
      { title: "One", href: "c-one.xhtml" },
      { title: "Two", href: "c-two.xhtml" },
      { title: "Notes", href: "notes.xhtml" },
    ]);
    expect(prepared.styles.map(({ path }) => path)).toEqual(["theme.css", "custom.css"]);
    expect(prepared.documents[0]!.xhtml).toContain("Novel (v2)");
  });

  it("numbers duplicate note IDs across chapters, preserves first-reference backlinks and unreferenced notes", async () => {
    const prepared = await prepareExport(book(), options, dependencies());
    expect(prepared.chapters.map((c) => c.notes.map((n) => [n.number, n.referenced]))).toEqual([
      [
        [1, true],
        [2, false],
      ],
      [[3, true]],
    ]);
    expect(prepared.chapters[0]!.xhtml.match(/href="notes.xhtml#fn-1"/g)).toHaveLength(2);
    expect(prepared.chapters[0]!.xhtml.match(/id="fnref-1"/g)).toHaveLength(1);
    expect(prepared.chapters[1]!.xhtml).toContain('href="notes.xhtml#fn-3"');
    const notes = prepared.documents.at(-1)!.xhtml;
    expect(notes).toContain('href="c-one.xhtml#fnref-1"');
    expect(notes).toContain('href="c-two.xhtml#fnref-3"');
    expect(notes).not.toContain("#fnref-2");
  });

  it("omits optional title, custom stylesheet and notes while preserving plain title", async () => {
    const input = book();
    input.metadata.version = null;
    input.customCss = null;
    input.chapters = [{ id: "one", source: "# Plain\nText" }];
    const prepared = await prepareExport(input, { ...options, titlePage: false }, dependencies());
    expect(prepared.documents.map((d) => d.path)).toEqual(["c-one.xhtml"]);
    expect(prepared.navigation).toEqual([{ title: "Plain", href: "c-one.xhtml" }]);
    expect(prepared.styles.map((s) => s.path)).toEqual(["theme.css"]);
    expect(prepared.displayTitle).toBe("Novel");
    expect(prepared.images).toEqual([]);
  });

  it("includes CSS-only images and cover, excludes unused and missing resources, and sorts output by source", async () => {
    const input = book();
    input.metadata.cover = "images/z-cover.jpg";
    input.resources = new Map([
      ["images/z-cover.jpg", resource(81)],
      ["images/unused.jpg", resource(82)],
      ["images/a-css.webp", resource(83, "image/webp")],
    ]);
    input.customCss = `.present {background: url( images/a-css.webp );} .missing {background: url('images/no.png');} .remote {background: url(https://example.com/x.png);}`;
    input.chapters[0]!.source += "\n\n![missing](images/no.png)";
    const before = structuredClone(input);
    const prepared = await prepareExport(input, options, dependencies());
    expect(prepared.images.map(({ source, path, isCover }) => ({ source, path, isCover }))).toEqual(
      [
        { source: "images/a-css.webp", path: "images/a-css.jpg", isCover: false },
        { source: "images/z-cover.jpg", path: "images/z-cover.jpg", isCover: true },
      ],
    );
    expect(prepared.styles[1]!.css).toContain('url("images/a-css.jpg")');
    expect(prepared.styles[1]!.css).toContain('url("data:,")');
    expect(prepared.styles[1]!.css).toContain("url(https://example.com/x.png)");
    expect(prepared.chapters[0]!.xhtml).not.toContain("images/no.png");
    expect(input).toEqual(before);
  });

  it("does not fabricate an image when the cover is missing", async () => {
    const input = book();
    input.metadata.cover = "images/missing.jpg";
    input.resources.set("images/unused.jpg", resource(84));
    const prepared = await prepareExport(input, options, dependencies());
    expect(prepared.images).toEqual([]);
    expect(prepared.metadata.cover).toBe("images/missing.jpg");
  });

  it("preserves collision allocation in resource insertion order after image conversion", async () => {
    const input = book();
    input.resources = new Map([
      ["images/a.webp", resource(85, "image/webp")],
      ["images/a.jpg", resource(86)],
    ]);
    input.chapters = [{ id: "one", source: "![first](images/a.webp)\n\n![second](images/a.jpg)" }];
    const prepared = await prepareExport(input, options, dependencies());
    expect(prepared.images.map((i) => [i.source, i.path])).toEqual([
      ["images/a.jpg", "images/a-2.jpg"],
      ["images/a.webp", "images/a.jpg"],
    ]);
    expect(prepared.chapters[0]!.xhtml).toContain('src="images/a.jpg"');
    expect(prepared.chapters[0]!.xhtml).toContain('src="images/a-2.jpg"');
  });

  it("uses 1264×1680 content and 1600×2560 cover bounds with grayscale and forwarded signal", async () => {
    const input = book();
    input.metadata.cover = "images/cover.jpg";
    input.resources = new Map([
      ["images/cover.jpg", resource(87)],
      ["images/page.jpg", resource(88)],
    ]);
    input.chapters = [{ id: "one", source: "![page](images/page.jpg)" }];
    const processor = vi.fn<ImageProcessor["process"]>(process);
    const signal = new AbortController().signal;
    const progress: Array<{ stage: string; done: number; total: number }> = [];
    const prepared = await prepareExport(
      input,
      options,
      dependencies({
        imageProcessor: { process: processor, dispose: () => {} },
        signal,
        imageDimensions: (r) =>
          r.bytes[0] === 87 ? { width: 3200, height: 5120 } : { width: 2528, height: 3360 },
        onProgress: (p) => progress.push(p),
      }),
    );
    expect(prepared.images.map((i) => [i.output.width, i.output.height])).toEqual([
      [1600, 2560],
      [1264, 1680],
    ]);
    expect(processor).toHaveBeenCalledWith(
      {
        bytes: new Uint8Array([87]),
        plan: { width: 1600, height: 2560, format: "jpeg", quality: 0.85, grayscale: true },
      },
      signal,
    );
    expect(processor).toHaveBeenCalledWith(
      {
        bytes: new Uint8Array([88]),
        plan: { width: 1264, height: 1680, format: "jpeg", quality: 0.85, grayscale: true },
      },
      signal,
    );
    expect(progress).toEqual([
      { stage: "chapters", done: 1, total: 1 },
      { stage: "images", done: 1, total: 2 },
      { stage: "images", done: 2, total: 2 },
    ]);
  });

  it("reuses processed bytes via injected hashing while keeping different processing plans separate", async () => {
    const input = book();
    input.resources.set("images/cache.jpg", resource(89));
    input.chapters = [{ id: "one", source: "![cached](images/cache.jpg)" }];
    const processor = vi.fn<ImageProcessor["process"]>(process);
    const hash = vi.fn<NonNullable<BuildDependencies["hash"]>>(async () => "task-2-cache-test");
    const deps = dependencies({ imageProcessor: { process: processor, dispose: () => {} }, hash });
    const first = await prepareExport(input, options, deps);
    const second = await prepareExport(input, options, deps);
    expect(first.images[0]!.output).toBe(second.images[0]!.output);
    expect(processor).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith(new Uint8Array([89]));
    await prepareExport(input, { ...options, grayscale: false }, deps);
    expect(processor).toHaveBeenCalledTimes(2);
  });

  it.each([
    [64 * 1024 * 1024, 1],
    [64 * 1024 * 1024 + 1, 2],
  ])(
    "exports %i-byte images and processes them %i time(s) across repeated exports",
    async (size, calls) => {
      const input = book();
      input.resources.set("images/large.jpg", resource(92));
      input.chapters = [{ id: "one", source: "![large](images/large.jpg)" }];
      const bytes = new Uint8Array(size);
      bytes[0] = 17;
      bytes[size - 1] = 29;
      const processor = vi.fn<ImageProcessor["process"]>(async ({ plan }) => ({
        bytes,
        mediaType: "image/jpeg",
        width: plan.width,
        height: plan.height,
      }));
      const deps = dependencies({
        imageProcessor: { process: processor, dispose: () => {} },
        hash: async () => `task-2-cache-bound-${size}`,
      });
      const first = await prepareExport(input, options, deps);
      const second = await prepareExport(input, options, deps);
      for (const prepared of [first, second]) {
        expect(prepared.images[0]!.output.bytes).toBe(bytes);
        expect(prepared.images[0]!.output.bytes.length).toBe(size);
        expect(prepared.images[0]!.output.bytes[0]).toBe(17);
        expect(prepared.images[0]!.output.bytes[size - 1]).toBe(29);
      }
      expect(processor).toHaveBeenCalledTimes(calls);
    },
  );

  it("rejects already cancelled preparation and cancellation during image processing", async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      prepareExport(book(), options, dependencies({ signal: aborted.signal })),
    ).rejects.toMatchObject({ code: "export.cancelled" });
    const input = book();
    input.resources.set("images/cancel.jpg", resource(90));
    input.chapters = [{ id: "one", source: "![cancel](images/cancel.jpg)" }];
    const controller = new AbortController();
    await expect(
      prepareExport(
        input,
        options,
        dependencies({
          signal: controller.signal,
          imageProcessor: {
            dispose: () => {},
            process: async (...args) => {
              controller.abort();
              return process(...args);
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "export.cancelled" });
  });

  it("preserves image processor failures", async () => {
    const input = book();
    input.resources.set("images/fail.jpg", resource(91));
    input.chapters = [{ id: "one", source: "![fail](images/fail.jpg)" }];
    const failure = new Error("Image encoding failed");
    await expect(
      prepareExport(
        input,
        options,
        dependencies({
          imageProcessor: {
            dispose: () => {},
            process: async () => {
              throw failure;
            },
          },
        }),
      ),
    ).rejects.toBe(failure);
  });
});
