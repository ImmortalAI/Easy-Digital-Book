import { describe, expect, it } from "vitest";
import { buildRecordZero } from "../headers";
import type { HeaderInput } from "../headers";
import type { BookMetadata } from "@/types/book";

const metadata: BookMetadata = {
  id: "urn:uuid:12345678-1234-5678-9abc-def012345678",
  title: "Исходное название",
  version: null,
  created: "1904-01-01T00:00:42Z",
  modified: "1904-01-01T00:00:43Z",
  language: "ru-RU",
  authors: ["Я", "作者 😀"],
  translators: ["Переводчик"],
  series: null,
  description: "Описание",
  cover: "images/cover.jpg",
};

function input(overrides: Partial<HeaderInput> = {}): HeaderInput {
  return {
    metadata: { ...metadata },
    displayTitle: "出版 😀",
    exportedAt: new Date("2026-10-05T12:34:56Z"),
    textLength: 42,
    textRecordCount: 1,
    recordIndices: new Map([
      ["fdst", 9],
      ["fcis", 11],
      ["flis", 10],
      ["ncx", 6],
      ["frag", 4],
      ["skel", 5],
      ["firstResource", 12],
    ]),
    resourceCount: 1,
    coverIndex: 0,
    thumbnailIndex: null,
    flowCount: 2,
    ...overrides,
  };
}

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset);
const str = (bytes: Uint8Array, start: number, end: number) =>
  new TextDecoder().decode(bytes.slice(start, end));

function exthEntries(bytes: Uint8Array): Map<number, Uint8Array[]> {
  let offset = 280;
  expect(str(bytes, offset, offset + 4)).toBe("EXTH");
  const length = u32(bytes, offset + 4);
  const count = u32(bytes, offset + 8);
  offset += 12;
  const entries = new Map<number, Uint8Array[]>();
  for (let index = 0; index < count; index++) {
    const type = u32(bytes, offset);
    const size = u32(bytes, offset + 4);
    const values = entries.get(type) ?? [];
    values.push(bytes.slice(offset + 8, offset + size));
    entries.set(type, values);
    offset += size;
  }
  expect(offset - 280).toBe(length);
  return entries;
}

describe("buildRecordZero", () => {
  it("writes documented PalmDOC and MOBI v8 offsets and aligned EXTH metadata", () => {
    const bytes = buildRecordZero(input());
    expect(bytes.length).toBe(595);
    expect([...bytes.slice(0, 16)]).toEqual([0, 2, 0, 0, 0, 0, 0, 42, 0, 1, 16, 0, 0, 0, 0, 0]);
    expect(str(bytes, 16, 20)).toBe("MOBI");
    expect(u32(bytes, 20)).toBe(264);
    expect(u32(bytes, 24)).toBe(2);
    expect(u32(bytes, 28)).toBe(65001);
    expect(u32(bytes, 32)).toBe(0x12345678);
    expect(u32(bytes, 36)).toBe(8);
    expect(Array.from({ length: 10 }, (_, i) => u32(bytes, 40 + 4 * i))).toEqual([
      0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
      0xffffffff, 0xffffffff, 0xffffffff,
    ]);
    expect(u32(bytes, 80)).toBe(2);
    expect(u32(bytes, 84)).toBeGreaterThanOrEqual(280);
    expect(u32(bytes, 88)).toBe(new TextEncoder().encode("出版 😀").length);
    expect(u32(bytes, 92)).toBe(0x0419);
    expect(u32(bytes, 104)).toBe(8);
    expect(u32(bytes, 108)).toBe(12);
    expect(u32(bytes, 128)).toBe(0x50);
    expect(u32(bytes, 192)).toBe(9);
    expect(u32(bytes, 196)).toBe(2);
    expect(u32(bytes, 200)).toBe(11);
    expect(u32(bytes, 204)).toBe(1);
    expect(u32(bytes, 208)).toBe(10);
    expect(u32(bytes, 212)).toBe(1);
    expect(u32(bytes, 224)).toBe(0xffffffff);
    expect(u32(bytes, 240)).toBe(3);
    expect(u32(bytes, 244)).toBe(6);
    expect(u32(bytes, 248)).toBe(4);
    expect(u32(bytes, 252)).toBe(5);
    expect(u32(bytes, 256)).toBe(0xffffffff);
    expect(u32(bytes, 260)).toBe(0xffffffff);
    expect(u32(bytes, 264)).toBe(0xffffffff);
    expect(u32(bytes, 268)).toBe(0);
    expect(u32(bytes, 272)).toBe(0xffffffff);
    expect(u32(bytes, 276)).toBe(0);

    const titleOffset = u32(bytes, 84);
    expect(titleOffset % 4).toBe(0);
    expect(str(bytes, titleOffset, titleOffset + u32(bytes, 88))).toBe("出版 😀");
    const entries = exthEntries(bytes);
    expect(entries.get(100)?.map((entry) => str(entry, 0, entry.length))).toEqual(["Я", "作者 😀"]);
    expect(entries.get(103)?.map((entry) => str(entry, 0, entry.length))).toEqual(["Описание"]);
    expect(entries.get(108)?.map((entry) => str(entry, 0, entry.length))).toEqual(["Переводчик"]);
    expect(entries.get(112)?.map((entry) => str(entry, 0, entry.length))).toEqual([metadata.id]);
    expect(entries.get(113)?.map((entry) => str(entry, 0, entry.length))).toEqual([
      "12345678-1234-5678-9abc-def012345678",
    ]);
    expect(entries.get(125)?.[0]).toEqual(new Uint8Array([0, 0, 0, 1]));
    expect(entries.get(201)?.[0]).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(entries.get(202)).toBeUndefined();
    expect(entries.get(203)?.[0]).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(entries.get(501)?.[0]).toEqual(new TextEncoder().encode("EBOK"));
    expect(entries.get(503)?.[0]).toEqual(new TextEncoder().encode("出版 😀"));
    expect(entries.get(524)?.[0]).toEqual(new TextEncoder().encode("ru-RU"));
    expect(entries.get(106)?.[0]).toEqual(new TextEncoder().encode("2026-10-05T12:34:56.000Z"));
  });

  it("keeps UID and record bytes stable across build dates and omits absent cover offsets", () => {
    const a = buildRecordZero(input({ coverIndex: null }));
    const b = buildRecordZero(
      input({ coverIndex: null, exportedAt: new Date("2027-01-01T00:00:00Z") }),
    );
    expect(u32(a, 32)).toBe(u32(b, 32));
    const aEntries = exthEntries(a);
    const bEntries = exthEntries(b);
    expect(aEntries.get(106)).not.toEqual(bEntries.get(106));
    aEntries.delete(106);
    bEntries.delete(106);
    expect([...aEntries]).toEqual([...bEntries]);
    expect(aEntries.has(201)).toBe(false);
    expect(aEntries.has(202)).toBe(false);
    expect(aEntries.has(203)).toBe(false);
    expect(u32(a, 108)).toBe(12);
  });

  it("uses a thumbnail offset only when supplied and validates cover bounds", () => {
    const thumbnail = buildRecordZero(input({ thumbnailIndex: 1, resourceCount: 2 }));
    const entries = exthEntries(thumbnail);
    expect(entries.get(201)?.[0]).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(entries.get(202)?.[0]).toEqual(new Uint8Array([0, 0, 0, 1]));
    expect(entries.get(203)?.[0]).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(() => buildRecordZero(input({ thumbnailIndex: 2, resourceCount: 2 }))).toThrow(
      expect.objectContaining({ code: "export.invalidMetadata" }),
    );
  });

  it("maps supported MOBI locales and rejects malformed book UUIDs", () => {
    expect(
      u32(buildRecordZero(input({ metadata: { ...metadata, language: "zh-Hant" } })), 92),
    ).toBe(0x0404);
    expect(
      u32(buildRecordZero(input({ metadata: { ...metadata, language: "zh-Hans-TW" } })), 92),
    ).toBe(0x0404);
    expect(
      u32(buildRecordZero(input({ metadata: { ...metadata, language: "zh-Hant-CN" } })), 92),
    ).toBe(0x0804);
    const hongKong = buildRecordZero(input({ metadata: { ...metadata, language: "zh-Hant-HK" } }));
    expect(u32(hongKong, 92)).toBe(0x0c04);
    expect(exthEntries(hongKong).get(524)?.[0]).toEqual(new TextEncoder().encode("zh-Hant-HK"));
    expect(u32(buildRecordZero(input({ metadata: { ...metadata, language: "es-MX" } })), 92)).toBe(
      0x080a,
    );
    expect(u32(buildRecordZero(input({ metadata: { ...metadata, language: "xx-YY" } })), 92)).toBe(
      0,
    );
    expect(() => buildRecordZero(input({ metadata: { ...metadata, id: "not-a-uuid" } }))).toThrow(
      expect.objectContaining({ code: "export.invalidMetadata" }),
    );
  });
});
