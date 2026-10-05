import { describe, expect, it } from "vitest";
import { buildIndexes } from "../indexes";
import { layoutText } from "../skeleton";
import type { TextLayout } from "../types";
import type { PreparedExport } from "@/services/export/types";
import vectors from "./vectors.json";

const utf8 = new TextEncoder();
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at);
const u16 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint16(at);

// Independent reader: derives tag presence/cardinality from TAGX, not writer helpers.
function readFamily(records: Uint8Array[]) {
  const meta = records[0]!;
  expect(decode(meta.slice(0, 4))).toBe("INDX");
  expect(u32(meta, 4)).toBe(192);
  expect(u32(meta, 16)).toBe(2);
  expect(u32(meta, 28)).toBe(65001);
  const descriptors: number[][] = [];
  for (let p = u32(meta, 180) + 12; meta[p + 3] !== 1; p += 4)
    descriptors.push(Array.from(meta.slice(p, p + 4)));
  const dataCount = u32(meta, 24);
  expect(records.length).toBe(1 + dataCount + u32(meta, 52));
  const rows: Array<{ key: string; tags: Map<number, number[]>; raw: Uint8Array }> = [];
  const varint = (bytes: Uint8Array, cursor: { at: number }) => {
    let n = 0;
    while (true) {
      const byte = bytes[cursor.at++]!;
      if (byte === undefined) throw new Error("Truncated VWI");
      n = n * 128 + (byte & 127);
      if (byte & 128) return n;
    }
  };
  for (let r = 0; r < dataCount; r++) {
    const data = records[r + 1]!;
    expect(data.length).toBeLessThan(65536);
    expect(data.length % 4).toBe(0);
    expect(u32(data, 12)).toBe(1);
    const idxt = u32(data, 20);
    expect(decode(data.slice(idxt, idxt + 4))).toBe("IDXT");
    const count = u32(data, 24);
    const geometry = u16(meta, u32(meta, 20) + 4 + r * 2);
    const lastKey = decode(meta.slice(geometry + 1, geometry + 1 + meta[geometry]!));
    expect(u16(meta, geometry + 1 + meta[geometry]!)).toBe(count);
    let finalKey = "";
    for (let e = 0; e < count; e++) {
      const start = u16(data, idxt + 4 + e * 2);
      expect(start).toBeGreaterThanOrEqual(192);
      expect(start).toBeLessThan(idxt);
      const cursor = { at: start };
      const keyLength = data[cursor.at++]!;
      const key = decode(data.slice(cursor.at, cursor.at + keyLength));
      cursor.at += keyLength;
      const control = data[cursor.at++]!;
      const tags = new Map<number, number[]>();
      for (const [tag, width, mask] of descriptors) {
        let shift = 0;
        while (((mask! >> shift) & 1) === 0) shift++;
        const occurrences = (control & mask!) >> shift;
        if (!occurrences) continue;
        const values = [];
        for (let i = 0; i < occurrences * width!; i++) values.push(varint(data, cursor));
        tags.set(tag!, values);
      }
      expect(cursor.at).toBeLessThanOrEqual(idxt);
      rows.push({ key, tags, raw: data.slice(start, cursor.at) });
      finalKey = key;
    }
    expect(finalKey).toBe(lastKey);
  }
  expect(rows.length).toBe(u32(meta, 36));
  for (const record of records) expect(record.length).toBeLessThan(65536);
  const stringAt = (address: number) => {
    const record = records[1 + dataCount + Math.floor(address / 65536)]!;
    expect(record).toBeDefined();
    const cursor = { at: address % 65536 };
    const length = varint(record, cursor);
    expect(cursor.at + length).toBeLessThanOrEqual(record.length);
    return decode(record.slice(cursor.at, cursor.at + length));
  };
  return { rows, stringAt, dataCount };
}

function fixture(count = 1, fileLength = 42): TextLayout {
  const skeleton = Uint8Array.from(Buffer.from(vectors.structures.simpleSkeleton, "hex"));
  const fragment = utf8.encode("<p>A</p>".padEnd(fileLength - 34, " "));
  const text = new Uint8Array(fileLength * count + 4);
  const layout: TextLayout = {
    text,
    skeletons: [],
    fragments: [],
    flows: [
      { start: 0, end: fileLength * count },
      { start: fileLength * count, end: text.length },
    ],
    positions: new Map(),
  };
  const positions = new Map();
  for (let i = 0; i < count; i++) {
    const start = i * fileLength;
    text.set(skeleton, start);
    text.set(fragment, start + 34);
    layout.skeletons.push({
      fileIndex: i,
      key: `SKEL${String(i).padStart(10, "0")}`,
      fragmentCount: 1,
      physicalStart: start,
      skeletonByteLength: 34,
      reconstructedStart: start,
      reconstructedLength: fileLength,
    });
    layout.fragments.push({
      fileIndex: i,
      globalFragmentIndex: i,
      selector: "P-//*[@aid='0']",
      insertionOffset: start + 20,
      fragmentStart: 0,
      byteLength: fragment.length,
      bytes: fragment,
    });
    positions.set(`c${i}.xhtml`, { fid: i, offset: 0, reconstructedOffset: start + 20 });
  }
  text.set(utf8.encode("a{}\n"), fileLength * count);
  layout.positions = positions;
  return layout;
}
function lengths(layout: TextLayout) {
  const result = [];
  for (let remaining = layout.text.length; remaining > 0; remaining -= 4096)
    result.push(Math.min(4096, remaining));
  return result;
}
function navigation(count: number): PreparedExport["navigation"] {
  return Array.from({ length: count }, (_, i) => ({
    href: `c${i}.xhtml`,
    title: i === count - 1 ? "Примечания 中 😀" : `Глава ${i + 1}`,
  }));
}

describe("KF8 indexes", () => {
  it("matches independently calculated SKEL, FRAG, NCX, FDST and TBS vectors", () => {
    const result = buildIndexes(fixture(), [{ href: "c0.xhtml", title: "A" }], [46]);
    for (const [name, records] of [
      ["skel", result.skel],
      ["frag", result.frag],
      ["ncx", result.ncx],
    ] as const) {
      const tableSize = u32(records[0]!, 196);
      expect(hex(records[0]!.slice(192, 192 + tableSize))).toBe(vectors.structures[`${name}Tagx`]);
      expect(hex(readFamily(records).rows[0]!.raw)).toBe(vectors.structures[`${name}Entry`]);
      expect(hex(records[1]!.slice(u32(records[1]!, 20)))).toBe(
        vectors.structures.idxtOneEntryAt192,
      );
    }
    expect(hex(result.ncx.at(-1)!)).toBe(vectors.structures.cncxLabelA);
    expect(readFamily(result.frag).stringAt(0)).toBe("P-//*[@aid='0']");
    expect(hex(result.fdst)).toBe(vectors.structures.fdstTwoFlows);
    expect(result.tbs.map(hex)).toEqual([vectors.structures.tbsOneEntryTrailer]);
  });

  it("matches complete hand-counted data records including headers and alignment", () => {
    const output = buildIndexes(fixture(), [{ href: "c0.xhtml", title: "A" }], [46]);
    const headers = {
      skel: "494e4458000000c0000000000000000100000000000000d800000001ffffffffffffffff00000000",
      frag: "494e4458000000c0000000000000000100000000000000d400000001ffffffffffffffff00000000",
      ncx: "494e4458000000c0000000000000000100000000000000cc00000001ffffffffffffffff00000000",
    };
    const padding = { skel: "0000", frag: "000000", ncx: "0000" };
    const geometry = { skel: [236, 216, 244], frag: [240, 224, 248], ncx: [248, 240, 256] };
    for (const kind of ["skel", "frag", "ncx"] as const) {
      expect(hex(output[kind][1]!)).toBe(
        headers[kind] +
          "00".repeat(152) +
          vectors.structures[`${kind}Entry`] +
          padding[kind] +
          vectors.structures.idxtOneEntryAt192,
      );
      const meta = output[kind][0]!;
      expect([u32(meta, 20), u16(meta, u32(meta, 20) + 4), meta.length]).toEqual(geometry[kind]);
    }
    expect(hex(output.frag.at(-1)!)).toBe("8f502d2f2f2a5b406169643d2730275d");
  });

  it("omits optional NCX for zero entries and emits valid empty required indexes", () => {
    const empty: TextLayout = {
      text: new Uint8Array(),
      skeletons: [],
      fragments: [],
      flows: [{ start: 0, end: 0 }],
      positions: new Map(),
    };
    const result = buildIndexes(empty, [], []);
    expect(result.ncx).toEqual([]);
    expect(result.tbs).toEqual([]);
    expect(hex(result.skel[1]!)).toBe(vectors.structures.emptyDataIndxRecord);
    expect(hex(result.frag[1]!)).toBe(vectors.structures.emptyDataIndxRecord);
    expect(readFamily(result.skel).rows).toEqual([]);
  });

  it("preserves 300 chapters plus notes, UTF8 labels, string dedup and CNCX rollover", () => {
    const layout = fixture(301, 128);
    const nav = navigation(301);
    for (let i = 0; i < 300; i++) nav[i]!.title += "Я中😀".repeat(60);
    nav[1]!.title = nav[0]!.title;
    const result = buildIndexes(layout, nav, lengths(layout));
    const parsed = readFamily(result.ncx);
    expect(parsed.rows).toHaveLength(301);
    expect(u32(result.ncx[0]!, 52)).toBeGreaterThan(1);
    for (const [i, row] of parsed.rows.entries()) {
      expect(row.key).toBe(i.toString(16).toUpperCase().padStart(2, "0"));
      expect(row.tags.get(1)).toEqual([i * 128 + 20]);
      expect(row.tags.get(2)).toEqual([i === 300 ? 108 : 128]);
      expect(parsed.stringAt(row.tags.get(3)![0]!)).toBe(nav[i]!.title);
      expect(row.tags.get(4)).toEqual([0]);
      expect(row.tags.get(6)).toEqual([i, 0]);
    }
    expect(parsed.rows[1]!.tags.get(3)).toEqual(parsed.rows[0]!.tags.get(3));
    expect(parsed.rows.at(-1)!.tags.get(3)![0]).toBeGreaterThanOrEqual(65536);
  });

  it("rolls INDX data records over and recovers every geometry/fragment entry", () => {
    const layout = fixture(4500);
    const nav = navigation(4500);
    const result = buildIndexes(layout, nav, lengths(layout));
    const skel = readFamily(result.skel);
    const frag = readFamily(result.frag);
    const ncx = readFamily(result.ncx);
    expect(skel.dataCount).toBeGreaterThan(1);
    expect(frag.dataCount).toBeGreaterThan(1);
    expect(ncx.dataCount).toBeGreaterThan(1);
    for (const [i, entry] of skel.rows.entries()) {
      expect(entry.key).toBe(layout.skeletons[i]!.key);
      expect(entry.tags.get(1)).toEqual([1, 1]);
      expect(entry.tags.get(6)).toEqual([i * 42, 34, i * 42, 34]);
      expect(frag.rows[i]!.tags.get(3)).toEqual([i]);
      expect(frag.rows[i]!.tags.get(4)).toEqual([i]);
      expect(frag.rows[i]!.tags.get(6)).toEqual([0, 8]);
      expect(frag.rows[i]!.key).toBe(String(i * 42 + 20).padStart(10, "0"));
      expect(frag.stringAt(frag.rows[i]!.tags.get(2)![0]!)).toBe("P-//*[@aid='0']");
      expect(ncx.stringAt(ncx.rows[i]!.tags.get(3)![0]!)).toBe(nav[i]!.title);
    }
  });

  it("indexes real multi-fragment layout using physical geometry and reconstructed targets", () => {
    const documents: PreparedExport["documents"] = [
      {
        path: "long.xhtml",
        kind: "chapter",
        xhtml: `<html><body>${Array.from({ length: 100 }, (_, i) => `<p id="p${i}">${"Я中😀 ".repeat(40)}</p>`).join("")}</body></html>`,
      },
    ];
    const layout = layoutText(documents, [{ path: "style.css", css: "p{}" }]);
    const result = buildIndexes(
      layout,
      [
        { href: "long.xhtml#p0", title: "Long" },
        { href: "long.xhtml#p99", title: "Last" },
      ],
      lengths(layout),
    );
    const skel = readFamily(result.skel);
    const frag = readFamily(result.frag);
    const ncx = readFamily(result.ncx);
    expect(frag.rows.length).toBeGreaterThan(1);
    expect(skel.rows[0]!.tags.get(1)).toEqual([layout.fragments.length, layout.fragments.length]);
    for (const [i, row] of frag.rows.entries()) {
      expect(row.tags.get(6)).toEqual([
        layout.fragments[i]!.fragmentStart,
        layout.fragments[i]!.byteLength,
      ]);
      expect(row.key).toBe(String(layout.fragments[i]!.insertionOffset).padStart(10, "0"));
    }
    expect(ncx.rows[1]!.tags.get(1)).toEqual([
      layout.positions.get("long.xhtml#p99")!.reconstructedOffset,
    ]);
    expect(ncx.rows[1]!.tags.get(6)).toEqual([
      layout.positions.get("long.xhtml#p99")!.fid,
      layout.positions.get("long.xhtml#p99")!.offset,
    ]);
  });

  it("handles half-open NCX intersections, span flags, and CSS-only text records", () => {
    const layout = fixture(3, 4096);
    // Targets 20,4116,8212; final interval ends12288. The last record contains only CSS.
    const result = buildIndexes(layout, navigation(3), [4096, 4096, 100, 3995, 1, 4]);
    expect(result.tbs.map(hex)).toEqual([
      "828883",
      "86880284",
      "8e880284",
      "93888084",
      "928883",
      "81",
    ]);
    const exact = fixture(2);
    expect(buildIndexes(exact, navigation(2), [20, 42, 22, 4]).tbs.map(hex)).toEqual([
      "81",
      "828883",
      "8a8883",
      "81",
    ]);
  });

  it("encodes VWI boundaries and the full 255-entry TBS count without wrapping", () => {
    const layout = fixture(256);
    const nav = navigation(256);
    nav[0]!.title = "A".repeat(127);
    nav[1]!.title = "B".repeat(128);
    const output = buildIndexes(layout, nav, lengths(layout));
    const stringRecord = output.ncx[1 + u32(output.ncx[0]!, 24)]!;
    expect(hex(stringRecord.slice(0, 1))).toBe("ff");
    expect(hex(stringRecord.slice(128, 130))).toBe("0180");
    const ncx = readFamily(output.ncx);
    expect(ncx.rows[0]!.tags.get(3)).toEqual([0]);
    expect(ncx.rows[1]!.tags.get(3)).toEqual([128]);
    expect(ncx.stringAt(128)).toBe("B".repeat(128));
    // 20 prefix bytes + sixteen42B intervals -> target16 at692.
    const boundaries = buildIndexes(layout, nav, [692, 42, 4096, 4096, 1830]);
    expect(hex(boundaries.tbs[1]!)).toBe("01828884");
    const crowded = fixture(255);
    crowded.positions = new Map(
      Array.from({ length: 255 }, (_, i) => [
        `c${i}.xhtml`,
        { fid: i, offset: 0, reconstructedOffset: 20 + i },
      ]),
    );
    expect(hex(buildIndexes(crowded, navigation(255), lengths(crowded)).tbs[0]!)).toBe("8688ff84");
  });

  it("keeps the largest aligned CNCX entry intact and rejects the next byte", () => {
    const layout = fixture();
    const nav = [{ href: "c0.xhtml", title: "A".repeat(65529) }];
    const output = buildIndexes(layout, nav, lengths(layout));
    expect(output.ncx.at(-1)!.length).toBe(65532);
    expect(readFamily(output.ncx).stringAt(0)).toBe(nav[0]!.title);
    nav[0]!.title += "A";
    expect(() => buildIndexes(layout, nav, lengths(layout))).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
  });

  it("rejects unsupported single-record crowding rather than truncating 256 entries", () => {
    const layout = fixture(256);
    layout.positions = new Map(
      Array.from({ length: 256 }, (_, i) => [
        `c${i}.xhtml`,
        { fid: i, offset: 0, reconstructedOffset: 20 + i },
      ]),
    );
    expect(() => buildIndexes(layout, navigation(256), lengths(layout))).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
  });

  it("rejects oversized CNCX strings, wrong payload coverage, missing and backwards navigation", () => {
    const layout = fixture(2);
    expect(() =>
      buildIndexes(layout, [{ href: "c0.xhtml", title: "中".repeat(22000) }], lengths(layout)),
    ).toThrow(expect.objectContaining({ code: "export.azw3Limit" }));
    expect(() => buildIndexes(layout, navigation(2), [1])).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
    expect(() =>
      buildIndexes(layout, [{ href: "missing.xhtml", title: "Missing" }], lengths(layout)),
    ).toThrow(expect.objectContaining({ code: "export.azw3Link" }));
    expect(() => buildIndexes(layout, navigation(2).reverse(), lengths(layout))).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
  });
});
