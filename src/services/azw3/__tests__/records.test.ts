import { describe, expect, it } from "vitest";
import { buildEndRecords } from "../records";
import { structures } from "./vectors.json";

const hex = (bytes: Uint8Array) => [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");

describe("buildEndRecords", () => {
  it("emits the exact FLIS, FCIS and EOF bytes from the format vectors", () => {
    const [flis, fcis, eof] = buildEndRecords(42, 1);
    expect(hex(flis!)).toBe(structures.flis);
    expect(hex(fcis!)).toBe(structures.fcis);
    expect(hex(eof!)).toBe(structures.eof);
  });

  it("writes FCIS byte length and rejects unsupported lengths or text record counts", () => {
    const [, fcis] = buildEndRecords(0x10203, 17);
    expect(new DataView(fcis!.buffer).getUint32(20)).toBe(0x10203);
    expect(() => buildEndRecords(-1, 1)).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
    expect(() => buildEndRecords(1, 0)).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
    expect(() => buildEndRecords(1, 65536)).toThrow(
      expect.objectContaining({ code: "export.azw3Limit" }),
    );
  });
});
