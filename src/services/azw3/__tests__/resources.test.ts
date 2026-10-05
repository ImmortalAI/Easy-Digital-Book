import { describe, expect, it } from "vitest";
import { buildResources, rewriteResources } from "../resources";
import type { PreparedExport } from "@/services/export/types";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const image = (
  source: string,
  path: string,
  bytes: Uint8Array,
  mediaType: "image/png" | "image/jpeg",
  isCover = false,
) => ({
  source,
  path,
  isCover,
  output: { bytes, mediaType, width: 1, height: 1 },
});
function prepared(): PreparedExport {
  return {
    metadata: {
      id: "urn:uuid:12345678-1234-5678-9abc-def012345678",
      title: "T",
      version: null,
      created: "1904-01-01T00:00:00Z",
      modified: "1904-01-01T00:00:00Z",
      language: "en",
      authors: [],
      translators: [],
      series: null,
      description: null,
      cover: "assets/z.webp",
    },
    displayTitle: "T",
    chapters: [],
    navigation: [],
    documents: [
      {
        path: "chapters/ch1.xhtml",
        kind: "chapter",
        xhtml: '<html><body><img src="images/a.png"/><img src="images/z.jpg"/></body></html>',
      },
    ],
    styles: [
      { path: "theme.css", css: "a{}" },
      {
        path: "custom.css",
        css: '.x { background: url("images/c.png") } .r{background:url(https://x/y.png)}',
      },
    ],
    images: [
      image("assets/z.webp", "images/z.jpg", jpg, "image/jpeg", true),
      image("assets/a.gif", "images/a.png", png, "image/png"),
      image("assets/css.png", "images/c.png", png, "image/png"),
    ],
  };
}

describe("buildResources", () => {
  it("orders by normalized project source, preserves cover identity and records actual converted MIME", () => {
    const plan = buildResources(prepared());
    expect(plan.records).toEqual([png, png, jpg]);
    expect([...plan.imageIndices]).toEqual([
      ["assets/a.gif", 0],
      ["assets/css.png", 1],
      ["assets/z.webp", 2],
    ]);
    expect(plan.coverIndex).toBe(2);
    expect(plan.thumbnailIndex).toBeNull();
  });

  it("rejects media types and byte signatures that disagree with supported encoded images", () => {
    const invalid = prepared();
    invalid.images[0]!.output = {
      ...invalid.images[0]!.output,
      mediaType: "image/gif" as "image/jpeg",
    };
    expect(() => buildResources(invalid)).toThrow(
      expect.objectContaining({ code: "export.azw3Resource" }),
    );
    const mismatched = prepared();
    mismatched.images[0]!.output = { ...mismatched.images[0]!.output, bytes: png };
    expect(() => buildResources(mismatched)).toThrow(
      expect.objectContaining({ code: "export.azw3Resource" }),
    );
  });
});

describe("rewriteResources", () => {
  it("rewrites XHTML and CSS references to ordered one-based Kindle embeds without mutation", () => {
    const source = prepared();
    const original = structuredClone(source);
    const plan = buildResources(source);
    const rewritten = rewriteResources(source, plan);
    expect(source).toEqual(original);
    expect(rewritten.documents[0]!.xhtml).toContain('src="kindle:embed:0003?mime=image/jpeg"');
    expect(rewritten.documents[0]!.xhtml).toContain('src="kindle:embed:0001?mime=image/png"');
    expect(rewritten.styles[1]!.css).toContain("url(kindle:embed:0002?mime=image/png)");
    expect(rewritten.styles[1]!.css).toContain("url(https://x/y.png)");
  });

  it("fails missing internal image references explicitly", () => {
    const source = prepared();
    source.documents[0]!.xhtml = '<html><body><img src="images/missing.png"/></body></html>';
    expect(() => rewriteResources(source, buildResources(prepared()))).toThrow(
      expect.objectContaining({ code: "export.azw3Resource" }),
    );
  });
});
