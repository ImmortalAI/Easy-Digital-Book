import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { layoutText } from "../skeleton";

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(b);
import { document, reconstruct } from "./layout-reader";

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  htmlEntities: true,
});

describe("KF8 skeleton geometry", () => {
  it("matches independently counted skeleton and fragment byte geometry", () => {
    const layout = layoutText(
      [
        {
          path: "sample.xhtml",
          kind: "chapter",
          xhtml: '<html><body><p id="n">Я</p></body></html>',
        },
      ],
      [],
    );
    expect(layout.skeletons[0]).toEqual({
      fileIndex: 0,
      key: "SKEL0000000000",
      fragmentCount: 1,
      physicalStart: 0,
      skeletonByteLength: 42,
      reconstructedStart: 0,
      reconstructedLength: 66,
    });
    expect(layout.fragments[0]).toMatchObject({
      globalFragmentIndex: 0,
      fileIndex: 0,
      fragmentStart: 0,
      insertionOffset: 28,
      byteLength: 24,
    });
    expect(
      Array.from(layout.text)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    ).toBe(
      "3c68746d6c206169643d2230223e3c626f6479206169643d2231223e3c2f626f64793e3c2f68746d6c3e3c702069643d226e22206169643d2232223ed0af3c2f703e",
    );
    expect(decode(reconstruct(layout)[0]!)).toBe(
      '<html aid="0"><body aid="1"><p id="n" aid="2">Я</p></body></html>',
    );
    expect(layout.positions.get("sample.xhtml#n")).toEqual({
      fid: 0,
      offset: 0,
      reconstructedOffset: 28,
    });
  });

  it("reconstructs multiple files and keeps physical, reconstructed and local addresses distinct", () => {
    const layout = layoutText(
      [
        document("a.xhtml", '<p id="a">Я中😀</p><p id="b">B</p>'),
        document("b.xhtml", '<p id="a">C</p>'),
      ],
      [{ path: "theme.css", css: "p{color:red}" }],
    );
    const rebuilt = reconstruct(layout);
    const p = layout.positions.get("a.xhtml#b")!;
    const text = decode(rebuilt[0]!);
    expect(p.reconstructedOffset).toBe(encode(text.slice(0, text.indexOf('<p id="b"'))).length);
    expect(decode(layout.fragments[p.fid]!.bytes.subarray(p.offset))).toMatch(/^<p id="b"/);
    const second = layout.skeletons[1]!;
    expect(second.physicalStart).toBe(rebuilt[0]!.length);
    expect(second.reconstructedStart).toBe(second.physicalStart);
    expect(layout.positions.get("b.xhtml#a")!.fid).toBeGreaterThan(p.fid);
    expect(layout.flows).toEqual([
      { start: 0, end: rebuilt[0]!.length + rebuilt[1]!.length },
      { start: rebuilt[0]!.length + rebuilt[1]!.length, end: layout.text.length },
    ]);
    expect(decode(layout.text.subarray(layout.flows[1]!.start))).toBe("p{color:red}");
  });

  it("preserves ordered mixed content, XML entities, whitespace, namespace attributes and empty images", () => {
    const doc = document(
      "mixed.xhtml",
      '  before <p id="a&amp;b" title="&quot; &amp; &#65;"> Я <em>中 &amp; &#x1F600;</em> tail <img src="images/a.png"/> after </p>  ',
    );
    const [bytes] = reconstruct(layoutText([doc], []));
    const xhtml = decode(bytes!);
    expect(xhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(xhtml).toContain("  before ");
    expect(xhtml).toContain(" tail ");
    expect(xhtml).toContain(" after </p>  ");
    expect(xhtml).toContain("中 &amp; 😀");
    expect(xhtml).toContain('title="&quot; &amp; A"');
    // Ignore only added aid attributes when comparing parsed document semantics.
    const withoutAids = (value: unknown): unknown =>
      JSON.parse(
        JSON.stringify(value, (key, v) =>
          key === "@_aid" || (key === ":@" && Object.keys(v).every((k) => k === "@_aid"))
            ? undefined
            : v,
        ),
      );
    expect(withoutAids(parser.parse(xhtml))).toEqual(withoutAids(parser.parse(doc.xhtml)));
  });

  it("generates globally unique aids without colliding with existing tokens", () => {
    const docs = [
      document("a.xhtml", '<p aid="0" id="a">A</p>'),
      document("b.xhtml", '<p aid="1" id="b">B</p>'),
    ];
    const layout = layoutText(docs, []);
    const aids = reconstruct(layout).flatMap((bytes) =>
      [...decode(bytes).matchAll(/ aid="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(new Set(aids).size).toBe(aids.length);
    expect(aids).toContain("0");
    expect(aids).toContain("1");
    expect(aids.every((aid) => /^[0-9A-V]+$/.test(aid!))).toBe(true);
  });

  it("partitions long sections at complete nodes and preserves oversized blocks", () => {
    const paragraphs = Array.from(
      { length: 6 },
      (_, i) => `<p id="p${i}">${"Я中😀 &amp; ".repeat(400)}</p>`,
    ).join("");
    const huge = `<p id="huge">${"字".repeat(9000)}</p>`;
    const doc = document("long.xhtml", `<section id="section">${paragraphs}${huge}</section>`);
    const layout = layoutText([doc], []);
    const [bytes] = reconstruct(layout);
    expect(layout.fragments.length).toBeGreaterThan(2);
    expect(decode(bytes!)).toContain("字".repeat(9000));
    for (const id of ["p0", "p5", "huge"]) {
      const pos = layout.positions.get(`long.xhtml#${id}`)!;
      expect(decode(layout.fragments[pos.fid]!.bytes.subarray(pos.offset))).toMatch(
        new RegExp(`^<p id="${id}"`),
      );
    }
    expect(layout.fragments.some((frag) => frag.byteLength > 8192)).toBe(true);
    const skel = layout.skeletons[0]!;
    const shell = decode(layout.text.subarray(0, skel.skeletonByteLength));
    for (const fragment of layout.fragments) {
      const aid = fragment.selector.match(/@aid='([^']+)'/)![1];
      expect(shell).toContain(`aid="${aid}"`);
    }
  });

  it("gives an empty chapter a resolvable fragment target and normalizes document paths", () => {
    const layout = layoutText([document("./text/../empty.xhtml", "")], []);
    reconstruct(layout);
    const position = layout.positions.get("empty.xhtml")!;
    expect(position.offset).toBe(0);
    expect(decode(layout.fragments[position.fid]!.bytes)).toMatch(/^<p\b/);
  });

  it("rejects a skeleton target with no following fragment instead of linking backward", () => {
    const doc = {
      path: "a.xhtml",
      kind: "chapter" as const,
      xhtml: '<html><body><p>A</p></body><head id="late"></head></html>',
    };
    expect(() => layoutText([doc], [])).toThrow(
      expect.objectContaining({ code: "export.azw3Link" }),
    );
  });

  it("rejects invalid XML, duplicate document paths and ambiguous ids", () => {
    expect(() =>
      layoutText([{ ...document("a.xhtml", ""), xhtml: "<html><body></html>" }], []),
    ).toThrow(expect.objectContaining({ code: "export.invalidXhtml" }));
    expect(() => layoutText([document("a.xhtml", ""), document("./a.xhtml", "")], [])).toThrow(
      expect.objectContaining({ code: "export.azw3Link" }),
    );
    expect(() => layoutText([document("a.xhtml", '<p id="a"/><p id="a"/>')], [])).toThrow(
      expect.objectContaining({ code: "export.azw3Link" }),
    );
  });
});
