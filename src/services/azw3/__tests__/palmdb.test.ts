import { describe, expect, it } from "vitest";
import { writePalmDb, writePalmDbAsync } from "../palmdb";
import { readPalmDb } from "./read-palmdb";
import vectors from "./vectors.json";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const created = new Date("1904-01-01T00:00:42Z");
describe("PalmDB container", () => {
  it("matches a complete hand-calculated two-record fixture", async () => {
    const records = [new Uint8Array(16), Uint8Array.of(0x61, 0x62, 0x63)];
    const bytes = writePalmDb(records, "Fixture", { created });
    expect(hex(bytes)).toBe(
      "4669787475726500000000000000000000000000000000000000000000000000" +
        "000000000000002a0000002a00000000000000000000000000000000" +
        "424f4f4b4d4f424900000003000000000002" +
        vectors.structures.palmdbDescriptors +
        "0000" +
        "00000000000000000000000000000000" +
        "616263",
    );
    expect(readPalmDb(bytes)).toEqual({
      name: "Fixture",
      created: 42,
      modified: 42,
      seed: 3,
      descriptors: [
        { offset: 96, flags: 0, uid: 0 },
        { offset: 112, flags: 0, uid: 2 },
      ],
      records,
    });
    expect(writePalmDb(records, "Fixture", { created })).toEqual(bytes);
    await expect(writePalmDbAsync(records, "Fixture", { created })).resolves.toEqual(bytes);
  });
  it("uses the Palm epoch, truncates fractions and handles byte views", () => {
    const record = Uint8Array.of(0, 0x61, 0).subarray(1, 2);
    expect(
      readPalmDb(writePalmDb([record], "Book", { created: new Date("1970-01-01T00:00:00.999Z") }))
        .created,
    ).toBe(2082844800);
    expect(readPalmDb(writePalmDb([record], "Book", { created })).records).toEqual([
      Uint8Array.of(0x61),
    ]);
  });
  it("sanitizes title to printable ASCII and at most 31 bytes", () => {
    expect(readPalmDb(writePalmDb([new Uint8Array()], "Я中😀\nBook", { created })).name).toBe(
      "_____Book",
    );
    expect(readPalmDb(writePalmDb([new Uint8Array()], "A".repeat(40), { created })).name).toBe(
      "A".repeat(31),
    );
  });
  it("accepts records larger than traditional 64 KiB and the maximum count", () => {
    const record = new Uint8Array(65536).fill(0xaa);
    expect(readPalmDb(writePalmDb([record], "Large", { created })).records[0]).toEqual(record);
    const bytes = writePalmDb(
      Array.from({ length: 65535 }, () => new Uint8Array()),
      "Many",
      { created },
    );
    const parsed = readPalmDb(bytes);
    expect(parsed.records).toHaveLength(65535);
    expect(parsed.seed).toBe(131069);
    expect(parsed.descriptors.at(-1)?.uid).toBe(131068);
  });
  it("rejects count and total-file-size overflow before allocating the container", () => {
    const record = new Uint8Array(65536);
    for (const records of [[], Array(65536).fill(record), Array(65535).fill(record)]) {
      expect(() => writePalmDb(records, "Invalid", { created })).toThrowError(
        expect.objectContaining({ code: "export.azw3Limit" }),
      );
    }
  });
  it.each([new Date("1903-12-31T23:59:59.999Z"), new Date("2040-02-06T06:28:16Z"), new Date(NaN)])(
    "rejects dates outside the u32 Palm epoch: %s",
    (invalid) => {
      expect(() => writePalmDb([new Uint8Array()], "Invalid", { created: invalid })).toThrowError(
        expect.objectContaining({ code: "export.azw3Limit" }),
      );
    },
  );
  it("accepts the last representable Palm timestamp", () => {
    expect(
      readPalmDb(
        writePalmDb([new Uint8Array()], "Last", { created: new Date("2040-02-06T06:28:15Z") }),
      ).created,
    ).toBe(0xffffffff);
  });
  it("cancels while copying a large record and never returns a completed buffer", async () => {
    const controller = new AbortController();
    let yields = 0;
    const task = writePalmDbAsync(
      [new Uint8Array(3 * 1024 * 1024).fill(0x5a)],
      "Large",
      { created },
      {
        signal: controller.signal,
        yieldControl: async () => {
          yields++;
          controller.abort();
        },
      },
    );
    await expect(task).rejects.toMatchObject({ code: "export.cancelled" });
    expect(yields).toBe(1);
  });
  it.each([0, 95, 114])(
    "the independent reader rejects out-of-file/record-area offset %s",
    (offset) => {
      const bytes = writePalmDb([new Uint8Array(16), Uint8Array.of(0x61)], "Fixture", { created });
      new DataView(bytes.buffer).setUint32(78, offset);
      expect(() => readPalmDb(bytes)).toThrow("Invalid record offset");
    },
  );
});
