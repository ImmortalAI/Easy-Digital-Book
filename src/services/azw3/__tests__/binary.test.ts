import { describe, expect, it } from "vitest";
import {
  encodeVarUInt,
  encodeBackwardVarUInt,
  writeUint16BE,
  writeUint24BE,
  writeUint32BE,
} from "../binary";
import vectors from "./vectors.json";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

describe("KF8 binary fields", () => {
  it("writes big endian fields without touching adjacent bytes", () => {
    const bytes = new Uint8Array(11).fill(0xaa);
    writeUint16BE(bytes, 1, 0x1234);
    writeUint24BE(bytes, 3, 0x56789a);
    writeUint32BE(bytes, 6, 0xbcdef012);
    expect(hex(bytes)).toBe("aa123456789abcdef012aa");
  });
  it.each(vectors.vwi)(
    "encodes forward and backward VWI $value",
    ({ value, forward, backward }) => {
      expect(hex(encodeVarUInt(value))).toBe(forward);
      expect(hex(encodeBackwardVarUInt(value))).toBe(backward);
    },
  );
  it("encodes the largest u32 without signed truncation", () => {
    expect(hex(encodeVarUInt(0xffffffff))).toBe("0f7f7f7fff");
    expect(hex(encodeBackwardVarUInt(0xffffffff))).toBe("8f7f7f7f7f");
  });
  it.each([-1, 0.5, NaN, Infinity, 0x100000000])(
    "rejects invalid unsigned integers %s",
    (value) => {
      for (const encode of [encodeVarUInt, encodeBackwardVarUInt]) {
        expect(() => encode(value)).toThrowError(
          expect.objectContaining({ code: "export.azw3Limit" }),
        );
      }
      expect(() => writeUint32BE(new Uint8Array(4), 0, value)).toThrowError(
        expect.objectContaining({ code: "export.azw3Limit" }),
      );
    },
  );
  it("rejects narrow-field overflow and out-of-bounds writes before mutation", () => {
    const bytes = new Uint8Array(4).fill(0xaa);
    for (const action of [
      () => writeUint16BE(bytes, 0, 65536),
      () => writeUint24BE(bytes, 0, 0x1000000),
      () => writeUint32BE(bytes, 1, 1),
      () => writeUint16BE(bytes, -1, 1),
      () => writeUint16BE(bytes, 0.5, 1),
    ])
      expect(action).toThrowError(expect.objectContaining({ code: "export.azw3Limit" }));
    expect(hex(bytes)).toBe("aaaaaaaa");
  });
});
