import { describe, expect, it } from "vitest";
import { compressPalmDoc, splitTextRecords } from "../palmdoc";
import vectors from "./vectors.json";

const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
// Token reader follows the format grammar, independent of match selection.
function decompress(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const token = bytes[i]!;
    if (token >= 1 && token <= 8) {
      if (i + token >= bytes.length) throw new Error("Truncated literal run");
      for (let j = 0; j < token; j++) output.push(bytes[++i]!);
    } else if (token >= 0xc0) output.push(0x20, token ^ 0x80);
    else if (token >= 0x80) {
      if (i + 1 >= bytes.length) throw new Error("Truncated backreference");
      const word = token * 256 + bytes[++i]!;
      const distance = (word >>> 3) & 0x7ff;
      const length = (word & 7) + 3;
      if (distance === 0 || distance > output.length) throw new Error("Invalid backreference");
      for (let j = 0; j < length; j++) output.push(output[output.length - distance]!);
    } else output.push(token);
  }
  return Uint8Array.from(output);
}
function roundTrip(text: Uint8Array) {
  const restored: number[] = [];
  for (const { bytes, overlap } of splitTextRecords(text)) {
    const compressed = compressPalmDoc(bytes);
    const record = Uint8Array.from([...compressed, ...overlap]);
    const count = record.at(-1)! & 3;
    restored.push(...decompress(record.subarray(0, record.length - count - 1)));
  }
  return Uint8Array.from(restored);
}
describe("PalmDOC payloads", () => {
  it.each(vectors.palmDoc)("encodes exact token vector $name", ({ plain, compressed }) => {
    expect(hex(compressPalmDoc(fromHex(plain)))).toBe(compressed);
    expect(decompress(compressPalmDoc(fromHex(plain)))).toEqual(fromHex(plain));
  });
  it("round-trips every byte value and incompressible input", () => {
    const input = Uint8Array.from({ length: 4096 }, (_, i) => ((i * 73) ^ (i >>> 4)) & 255);
    expect(decompress(compressPalmDoc(input))).toEqual(input);
    expect(decompress(compressPalmDoc(Uint8Array.from({ length: 256 }, (_, i) => i)))).toEqual(
      Uint8Array.from({ length: 256 }, (_, i) => i),
    );
  });
  it("uses the full distance/length range without wrapping the history window", () => {
    expect(hex(compressPalmDoc(new TextEncoder().encode("a".repeat(11))))).toBe("61800f");
    const atLimit = new TextEncoder().encode("abc" + "_".repeat(2044) + "abc");
    const pastLimit = new TextEncoder().encode("abc" + "_".repeat(2045) + "abc");
    expect(hex(compressPalmDoc(atLimit).subarray(-2))).toBe("bff8");
    expect(hex(compressPalmDoc(pastLimit).subarray(-3))).toBe("616263");
    expect(decompress(compressPalmDoc(atLimit))).toEqual(atLimit);
    expect(decompress(compressPalmDoc(pastLimit))).toEqual(pastLimit);
  });
  it("splits reserved literal runs at eight bytes", () => {
    expect(hex(compressPalmDoc(fromHex("0102030405060708ff")))).toBe("08010203040506070801ff");
  });
  it("allows compressed expansion above the uncompressed payload limit", () => {
    let state = 0x12345678;
    const input = Uint8Array.from({ length: 4096 }, () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 24) | 0x80;
    });
    const compressed = compressPalmDoc(input);
    expect(compressed.length).toBeGreaterThan(4096);
    expect(compressed.length).toBeLessThanOrEqual(4608);
    expect(decompress(compressed)).toEqual(input);
    expect(hex(splitTextRecords(input)[0]!.overlap)).toBe("00");
  });
  it.each([4095, 4096, 4097])("splits %s bytes without changing payload or trailers", (size) => {
    const input = new TextEncoder().encode("A".repeat(size));
    const records = splitTextRecords(input);
    expect(records.map(({ bytes }) => bytes.length)).toEqual(size > 4096 ? [4096, 1] : [size]);
    for (const record of records) expect(hex(record.overlap)).toBe("00");
    expect(roundTrip(input)).toEqual(input);
  });
  it("round-trips empty text without manufacturing a text record", () => {
    expect(splitTextRecords(new Uint8Array())).toEqual([]);
    expect(roundTrip(new Uint8Array())).toEqual(new Uint8Array());
  });
  it.each(vectors.utf8Boundaries)(
    "matches continuation-byte vector $character",
    ({
      textPrefix,
      prefixRepeat,
      character,
      suffix,
      firstPayloadFinalHex,
      overlapHex,
      secondPayloadHex,
    }) => {
      const input = new TextEncoder().encode(textPrefix.repeat(prefixRepeat) + character + suffix);
      const records = splitTextRecords(input);
      expect(hex(records[0]!.bytes.subarray(-1))).toBe(firstPayloadFinalHex);
      expect(hex(records[0]!.overlap)).toBe(overlapHex);
      expect(hex(records[1]!.bytes)).toBe(secondPayloadHex);
      expect(hex(records[1]!.overlap)).toBe("00");
      expect(roundTrip(input)).toEqual(input);
    },
  );
  it.each(["Я", "中", "😀"])("handles every UTF-8 boundary position for %s", (character) => {
    for (let offset = 4092; offset <= 4097; offset++) {
      const input = new TextEncoder().encode("A".repeat(offset) + character + "Z");
      const records = splitTextRecords(input);
      expect(roundTrip(input)).toEqual(input);
      for (const { bytes, overlap } of records) {
        expect(bytes.length).toBeLessThanOrEqual(4096);
        expect(overlap.length).toBeLessThanOrEqual(4);
        expect(overlap.at(-1)).toBe(overlap.length - 1);
      }
    }
  });
  it("preserves UTF-8 across consecutive boundaries and resets compression history", () => {
    const input = new TextEncoder().encode("A".repeat(4095) + "😀" + "中".repeat(2730) + "Я");
    expect(roundTrip(input)).toEqual(input);
    const records = splitTextRecords(new TextEncoder().encode("abc".repeat(3000)));
    for (const { bytes } of records) expect(decompress(compressPalmDoc(bytes))).toEqual(bytes);
  });
  it("rejects oversized payloads and text-record counts", () => {
    expect(() => compressPalmDoc(new Uint8Array(4097))).toThrowError(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
    expect(() => splitTextRecords(new Uint8Array(4096 * 65535 + 1))).toThrowError(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
  });
});
