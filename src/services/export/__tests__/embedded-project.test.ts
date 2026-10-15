import { describe, expect, it } from "vitest";
import { buildAzw3 } from "@/services/azw3/build";
import { writePalmDb } from "@/services/azw3/palmdb";
import {
  exportOptions,
  fixtureBook,
  fixtureProcessor,
  png,
} from "@/services/azw3/__tests__/fixtures";
import { readEdb } from "@/services/edb/read";
import { writeEdb } from "@/services/edb/write";
import { buildEpub } from "@/services/epub/build";
import { makeZip } from "@/services/epub/zip";
import { extractEmbeddedProject, findEmbeddedProject } from "../embedded-project";

const deps = () => ({
  imageProcessor: fixtureProcessor(),
  now: () => new Date("2026-01-08T03:04:05.000Z"),
});
const builders = [
  ["epub", buildEpub],
  ["azw3", buildAzw3],
] as const;

/** A book that exercises every part of the project file. */
function richBook() {
  const book = fixtureBook();
  book.metadata.cover = "images/cover.png";
  book.resources.set("images/cover.png", { mediaType: "image/png", bytes: png });
  book.customCss = "p { margin: 0; }";
  book.dictionary = ["Минжуй"];
  return book;
}
const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const setU32 = (bytes: Uint8Array, offset: number, value: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
const recordStart = (bytes: Uint8Array, index: number) => u32(bytes, 78 + index * 8);

/** A minimal BOOKMOBI file written without the exporter: record 0 plus one extra record. */
function handMadeMobi(extra: Uint8Array): Uint8Array {
  const zero = new Uint8Array(280);
  zero.set(new TextEncoder().encode("MOBI"), 16);
  setU32(zero, 20, 264);
  setU32(zero, 224, 1);
  setU32(zero, 228, 1);
  return writePalmDb([zero, extra], "Hand made", { created: new Date("2026-01-01T00:00:00Z") });
}

describe("embedded project", () => {
  it.each(builders)("round-trips the project through %s", async (container, build) => {
    const book = richBook();
    const bytes = await build(book, { ...exportOptions(), embedProject: true }, deps());

    const lookup = await findEmbeddedProject(bytes);
    expect(lookup.container).toBe(container);
    const opened = await readEdb(lookup.project!, { now: () => new Date("2030-01-01T00:00:00Z") });
    expect(opened.warnings).toEqual([]);
    expect(opened.migrated).toBe(false);
    expect(opened.book).toEqual(book);
    expect(await extractEmbeddedProject(bytes)).toEqual(lookup.project);
  });

  it.each(builders)("finds no project in a plain %s export", async (container, build) => {
    const bytes = await build(richBook(), exportOptions(), deps());
    expect(await findEmbeddedProject(bytes)).toEqual({ container, project: null });
    expect(await extractEmbeddedProject(bytes)).toBeNull();
  });

  it("does not take a project file or other input for a book", async () => {
    const edb = await writeEdb(richBook(), new Date(0), { updateModified: false });
    const inputs = [
      edb,
      new Uint8Array(),
      Uint8Array.from([1, 2, 3]),
      new TextEncoder().encode("PK is not always a zip archive, and this text is long enough."),
      new Uint8Array(4096),
    ];
    for (const input of inputs)
      expect(await findEmbeddedProject(input)).toEqual({ container: null, project: null });
  });

  it("recognises a third-party EPUB whose mimetype ends with a newline", async () => {
    const epub = await makeZip([
      ["mimetype", "application/epub+zip\n"],
      ["META-INF/container.xml", "<container/>"],
    ]);
    expect(await findEmbeddedProject(epub)).toEqual({ container: "epub", project: null });
  });

  it("returns the payload of a hand-made SRCS record", async () => {
    const record = Uint8Array.from([
      0x53, 0x52, 0x43, 0x53, 0, 0, 0, 0x10, 0, 0, 0, 0x2f, 0, 0, 0, 1, 9, 8, 7,
    ]);
    expect(await findEmbeddedProject(handMadeMobi(record))).toEqual({
      container: "azw3",
      project: Uint8Array.from([9, 8, 7]),
    });
  });

  it("returns null for an inconsistent SRCS pointer or record", async () => {
    const good = await buildAzw3(richBook(), { ...exportOptions(), embedProject: true }, deps());
    const zero = recordStart(good, 0);
    const srcsIndex = u32(good, zero + 224);
    const srcs = recordStart(good, srcsIndex);
    const mutate = (change: (copy: Uint8Array) => void) => {
      const copy = good.slice();
      change(copy);
      return copy;
    };
    const broken = [
      mutate((copy) => setU32(copy, zero + 224, 60000)), // index out of range
      mutate((copy) => setU32(copy, zero + 224, 0)), // record 0 is never SRCS
      mutate((copy) => setU32(copy, zero + 228, 0)), // count says "none"
      mutate((copy) => (copy[srcs] = 0x58)), // wrong magic
      good.subarray(0, srcs + 20), // file cut inside the SRCS record
      good.subarray(0, zero + 100), // file cut inside record 0
      handMadeMobi(new TextEncoder().encode("SRCS")), // record shorter than its header
    ];
    for (const bytes of broken)
      expect(await findEmbeddedProject(bytes)).toEqual({ container: "azw3", project: null });
  });

  it("never rejects, whatever the length of a truncated book", async () => {
    const azw3 = await buildAzw3(richBook(), { ...exportOptions(), embedProject: true }, deps());
    const epub = await buildEpub(richBook(), { ...exportOptions(), embedProject: true }, deps());
    for (const source of [azw3, epub])
      for (const length of [0, 1, 4, 59, 60, 68, 77, 78, 79, 86, 100, 300, source.length >> 1])
        await expect(extractEmbeddedProject(source.subarray(0, length))).resolves.toBeNull();
  });
});
