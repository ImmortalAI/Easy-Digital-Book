import { describe, expect, it } from "vitest";
import { layoutText } from "../skeleton";
import { rewriteLinks } from "../links";
import { document, reconstruct } from "./layout-reader";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("KF8 link addresses", () => {
  it("patches final byte addresses for relative links, noterefs and first-reference backlinks immutably", () => {
    const docs = [
      document(
        "text/a.xhtml",
        '<p>Я中😀 &amp;</p><p><a id="ref-a" epub:type="noteref" href="../notes.xhtml#note-a">1</a> <a epub:type="noteref" href="../notes.xhtml#note-a">1</a><a href="./b.xhtml#ref-b">next</a></p>',
      ),
      document(
        "text/b.xhtml",
        '<p><a id="ref-b" epub:type="noteref" href="../notes.xhtml#note-b">1</a></p>',
      ),
      {
        ...document(
          "notes.xhtml",
          '<div id="note-a" epub:type="endnote"><p><a href="text/a.xhtml#ref-a">1.</a> Я</p></div><div id="note-b" epub:type="endnote"><p><a href="text/b.xhtml#ref-b">1.</a> 中</p></div><div id="unused" epub:type="endnote"><p>2. unused</p></div>',
        ),
        kind: "notes" as const,
      },
    ];
    const original = JSON.stringify(docs);
    const layout = layoutText(docs, []);
    const rebuilt = reconstruct(layout).map(decode);
    const expectedIds = [["note-a", "note-a", "ref-b"], ["note-b"], ["ref-a", "ref-b"]];
    rebuilt.forEach((xhtml, file) => {
      const links = [...xhtml.matchAll(/href="kindle:pos:fid:([0-9A-V]{4}):off:([0-9A-V]{10})"/g)];
      expect(links).toHaveLength(expectedIds[file]!.length);
      links.forEach((match, i) => {
        const fid = Number.parseInt(match[1]!, 32),
          offset = Number.parseInt(match[2]!, 32);
        const fragment = layout.fragments[fid]!;
        const target = decode(fragment.bytes.subarray(offset));
        expect(target).toMatch(new RegExp(`^<(?:a|div) id="${expectedIds[file]![i]}"`));
        const skel = layout.skeletons[fragment.fileIndex]!;
        const physical =
          skel.physicalStart + skel.skeletonByteLength + fragment.fragmentStart + offset;
        expect(decode(layout.text.subarray(physical))).toMatch(
          new RegExp(`^<(?:a|div) id="${expectedIds[file]![i]}"`),
        );
      });
    });
    expect(rebuilt[2]).toMatch(/id="note-a"[^>]*><p[^>]*><a href="kindle:pos:/);
    expect(rebuilt[2]).toMatch(/id="unused"[^>]*><p[^>]*>2. unused<\/p>/);
    const rewritten = rewriteLinks(docs, layout.positions);
    expect(rewritten[0]!.xhtml).toContain('epub:type="noteref"');
    expect(rewritten[0]!.xhtml).toContain('href="kindle:pos:');
    expect(JSON.stringify(docs)).toBe(original);
    // Re-layout accepts already rewritten position URIs without changing their positions.
    expect(layoutText(rewritten, []).text).toEqual(layout.text);
    expect(layoutText(docs, []).text).toEqual(layout.text);
  });

  it("resolves fragment-only and escaped URI targets while retaining external URLs", () => {
    const docs = [
      document(
        "text/a.xhtml",
        '<p id="a&amp;b">Я</p><a href="#a%26b">self</a><a href="https://example.org/?x=1&amp;y=2">web</a><a href="mailto:a@example.org">mail</a><a href="//example.org/">network</a>',
      ),
    ];
    const layout = layoutText(docs, []);
    const rewritten = rewriteLinks(docs, layout.positions)[0]!.xhtml;
    expect(rewritten).toContain('href="kindle:pos:');
    expect(rewritten).toContain('href="https://example.org/?x=1&amp;y=2"');
    expect(rewritten).toContain('href="mailto:a@example.org"');
    expect(rewritten).toContain('href="//example.org/"');
    expect(layout.positions.has("text/a.xhtml#a&b")).toBe(true);
  });

  it("rewrites stylesheet references to the corresponding CSS flow", () => {
    const doc = document("text/a.xhtml", '<p id="a">A</p>');
    doc.xhtml = doc.xhtml.replace(
      "</head>",
      '<link rel="stylesheet" href="../styles/theme.css"/></head>',
    );
    const layout = layoutText([doc], [{ path: "styles/theme.css", css: "p { color:red }" }]);
    expect(decode(reconstruct(layout)[0]!)).toContain('href="kindle:flow:0001?mime=text/css"');
  });

  it("patches only the actual href attribute when other attributes contain a slot-shaped value", () => {
    const doc = document(
      "a.xhtml",
      '<a data-href="kindle:pos:fid:0000:off:0000000000" href="#target">go</a><p id="target">target</p>',
    );
    const layout = layoutText([doc], []);
    const xhtml = decode(reconstruct(layout)[0]!);
    expect(xhtml).toContain('data-href="kindle:pos:fid:0000:off:0000000000"');
    const position = layout.positions.get("a.xhtml#target")!;
    const address = xhtml.match(/ href="kindle:pos:fid:([0-9A-V]+):off:([0-9A-V]+)"/)!;
    expect(Number.parseInt(address[1]!, 32)).toBe(position.fid);
    expect(Number.parseInt(address[2]!, 32)).toBe(position.offset);
  });

  it("rejects missing targets before emitting an invalid address", () => {
    const docs = [document("a.xhtml", '<a href="missing.xhtml#note">bad</a>')];
    expect(() => layoutText(docs, [])).toThrow(
      expect.objectContaining({ code: "export.azw3Link" }),
    );
    expect(() => rewriteLinks(docs, new Map())).toThrow(
      expect.objectContaining({ code: "export.azw3Link" }),
    );
  });

  it("rejects overflowing fid and offset instead of truncating their radix32 slots", () => {
    const docs = [document("a.xhtml", '<a href="#a">link</a><p id="a">A</p>')];
    for (const position of [
      { fid: 32 ** 4, offset: 0, reconstructedOffset: 0 },
      { fid: 0, offset: 32 ** 10, reconstructedOffset: 0 },
    ]) {
      expect(() => rewriteLinks(docs, new Map([["a.xhtml#a", position]]))).toThrow(
        expect.objectContaining({ code: "export.azw3Limit" }),
      );
    }
  });
});

it("addresses real shared endnotes when two chapters reuse a label, a reference repeats and a note is unused", async () => {
  const { prepareExport } = await import("@/services/export/prepare");
  const prepared = await prepareExport(
    {
      metadata: {
        id: "urn:uuid:layout",
        title: "Notes",
        version: null,
        language: "ru",
        authors: [],
        translators: [],
        series: null,
        description: null,
        cover: null,
        created: "2026-01-01T00:00:00Z",
        modified: "2026-01-01T00:00:00Z",
      },
      chapters: [
        {
          id: "one",
          source:
            "# Я中😀\nFirst [^same], again [^same].\n\n[^same]: First note\n\n[^unused]: Unreferenced",
        },
        { id: "two", source: "# Two\nSecond [^same].\n\n[^same]: Second note" },
      ],
      resources: new Map(),
      customCss: null,
    },
    { imagePreset: "original", grayscale: false, titlePage: false, versionInTitle: false },
    {
      now: () => new Date("2026-01-01T00:00:00Z"),
      imageProcessor: {
        process: async () => {
          throw new Error("No images");
        },
        dispose: () => {},
      },
    },
  );
  const layout = layoutText(prepared.documents, prepared.styles);
  const documents = reconstruct(layout).map(decode);
  const refs = documents
    .slice(0, 2)
    .map((xhtml) => [
      ...xhtml.matchAll(
        /<a\b[^>]*epub:type="noteref"[^>]*href="kindle:pos:fid:([0-9A-V]+):off:([0-9A-V]+)"[^>]*>/g,
      ),
    ]);
  expect(refs.map((r) => r.length)).toEqual([2, 1]);
  expect(refs[0]![0]!.slice(1)).toEqual(refs[0]![1]!.slice(1));
  expect(refs[0]![0]!.slice(1)).not.toEqual(refs[1]![0]!.slice(1));
  for (const [i, ref] of [refs[0]![0]!, refs[1]![0]!].entries()) {
    const target = decode(
      layout.fragments[parseInt(ref[1]!, 32)]!.bytes.subarray(parseInt(ref[2]!, 32)),
    );
    const backlink = target.match(
      /^<div\b[^>]*>\s*<p[^>]*><a\b[^>]*href="kindle:pos:fid:([0-9A-V]+):off:([0-9A-V]+)"/,
    )!;
    expect(backlink).not.toBeNull();
    const reference = decode(
      layout.fragments[parseInt(backlink[1]!, 32)]!.bytes.subarray(parseInt(backlink[2]!, 32)),
    );
    expect(reference.slice(0, reference.indexOf(">"))).toContain(`id="fnref-${i === 0 ? 1 : 3}"`);
  }
  expect(documents[2]).toMatch(/id="fn-2"[^>]*>\s*<p[^>]*><span\b[^>]*>2\.<\/span> Unreferenced/);
});
