import { describe, expect, it } from "vitest";
import { buildAzw3 } from "../build";
import { readPalmDb } from "./read-palmdb";
import { exportOptions, fixtureBook, fixtureProcessor, jpeg, png } from "./fixtures";
import { layoutText, layoutTextAsync } from "../skeleton";
import { buildIndexes, buildIndexesAsync } from "../indexes";
import { splitTextRecords } from "../palmdoc";
import { document } from "./layout-reader";

const at = (day: string) => new Date(`2026-01-${day}T03:04:05.000Z`);

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  return haystack.findIndex((_, offset) =>
    needle.every((value, i) => haystack[offset + i] === value),
  );
}

function decodeBackwardVwi(bytes: Uint8Array, end: number): { start: number; value: number } {
  let start = end - 1;
  while (start > 0 && !(bytes[start]! & 0x80)) start--;
  let value = 0;
  for (let i = start; i < end; i++) value = value * 128 + (bytes[i]! & 0x7f);
  return { start, value };
}

function decompressPalmDoc(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let i = 0; i < bytes.length;) {
    const token = bytes[i++]!;
    if (token === 0 || (token >= 9 && token <= 0x7f)) output.push(token);
    else if (token >= 1 && token <= 8) {
      for (let n = 0; n < token; n++) output.push(bytes[i++]!);
    } else if (token >= 0xc0) output.push(0x20, token ^ 0x80);
    else {
      const word = (token << 8) | bytes[i++]!;
      const distance = (word >> 3) & 0x7ff;
      const length = (word & 7) + 3;
      for (let n = 0; n < length; n++) output.push(output[output.length - distance]!);
    }
  }
  return Uint8Array.from(output);
}

function readText(palm: ReturnType<typeof readPalmDb>): string {
  const count = new DataView(palm.records[0]!.buffer).getUint16(8);
  const pieces: Uint8Array[] = [];
  for (const record of palm.records.slice(1, 1 + count)) {
    const trailer = decodeBackwardVwi(record, record.length);
    const compressedWithOverlap = record.subarray(0, trailer.start);
    const overlapCount = compressedWithOverlap.at(-1)!;
    const compressed = compressedWithOverlap.subarray(
      0,
      compressedWithOverlap.length - overlapCount - 1,
    );
    pieces.push(decompressPalmDoc(compressed));
  }
  const length = pieces.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of pieces) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

function exthIntegers(recordZero: Uint8Array): Map<number, number[]> {
  const marker = new TextEncoder().encode("EXTH");
  const start = indexOf(recordZero, marker);
  const view = new DataView(recordZero.buffer, recordZero.byteOffset, recordZero.byteLength);
  const size = view.getUint32(start + 4);
  const count = view.getUint32(start + 8);
  const values = new Map<number, number[]>();
  let offset = start + 12;
  for (let i = 0; i < count; i++) {
    const type = view.getUint32(offset);
    const length = view.getUint32(offset + 4);
    if (length === 12) {
      const list = values.get(type) ?? [];
      list.push(view.getUint32(offset + 8));
      values.set(type, list);
    }
    offset += length;
  }
  expect(offset).toBeLessThanOrEqual(start + size);
  return values;
}

describe("buildAzw3", () => {
  it("builds a deterministic PalmDB with resolved endnote links and stable timestamps", async () => {
    const book = fixtureBook();
    const before = structuredClone(book);
    const deps = { imageProcessor: fixtureProcessor(), now: () => at("08") };
    const first = await buildAzw3(book, exportOptions(), deps);
    const second = await buildAzw3(book, exportOptions(), deps);

    expect(second).toEqual(first);
    expect(book).toEqual(before);
    const palm = readPalmDb(first);
    expect(palm.name).toBe("AZW3 Fixture");
    expect(palm.records[0]!.subarray(16, 20)).toEqual(new TextEncoder().encode("MOBI"));
    expect(palm.records.map((record) => new TextDecoder().decode(record.subarray(0, 4)))).toContain(
      "FDST",
    );
    const text = palm.records.slice(1, 1 + new DataView(palm.records[0]!.buffer).getUint16(8));
    expect(text.length).toBeGreaterThan(0);
    const recordZero = palm.records[0]!;
    expect(new TextDecoder().decode(recordZero)).toContain("2026-01-08T03:04:05.000Z");
    const changed = await buildAzw3(book, exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("09"),
    });
    const otherZero = readPalmDb(changed).records[0]!;
    const oldDate = new TextEncoder().encode("2026-01-08T03:04:05.000Z");
    const newDate = new TextEncoder().encode("2026-01-09T03:04:05.000Z");
    const dateOffset = indexOf(recordZero, oldDate);
    expect(dateOffset).toBeGreaterThanOrEqual(0);
    const expectedZero = recordZero.slice();
    expectedZero.set(newDate, dateOffset);
    expect(otherZero).toEqual(expectedZero);
  });

  it("checks cancellation before starting and after cooperative yields", async () => {
    const initial = new AbortController();
    initial.abort();
    await expect(
      buildAzw3(fixtureBook(), exportOptions(), {
        imageProcessor: fixtureProcessor(),
        now: () => at("08"),
        signal: initial.signal,
      }),
    ).rejects.toMatchObject({ code: "export.cancelled" });

    const book = fixtureBook();
    book.chapters = [
      {
        id: "long",
        source: `# Long chapter\n\n${Array.from({ length: 1200 }, () => "A paragraph.").join("\n\n")}`,
      },
    ];
    const controller = new AbortController();
    let yields = 0;
    await expect(
      buildAzw3(book, exportOptions(), {
        imageProcessor: fixtureProcessor(),
        now: () => at("08"),
        signal: controller.signal,
        yieldControl: async () => {
          yields++;
          if (yields === 2) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "export.cancelled" });
    expect(yields).toBeGreaterThanOrEqual(2);
  });

  it("cancels immediately after image processing completes", async () => {
    const book = fixtureBook();
    book.metadata.cover = "images/cover.png";
    book.resources.set("images/cover.png", { mediaType: "image/png", bytes: png });
    const controller = new AbortController();
    const result = buildAzw3(book, exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("08"),
      signal: controller.signal,
      onProgress: ({ stage }) => {
        if (stage === "images") controller.abort();
      },
    });
    await expect(result).rejects.toMatchObject({ code: "export.cancelled" });
  });

  it("cancels the complete build while processing the index row batch", async () => {
    const book = fixtureBook();
    book.chapters = Array.from({ length: 129 }, (_, i) => ({
      id: `chapter-${i}`,
      source: `# Chapter ${i}\n\nShort chapter ${i}.`,
    }));
    const controller = new AbortController();
    let yields = 0;
    const result = buildAzw3(book, exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("08"),
      signal: controller.signal,
      yieldControl: async () => {
        yields++;
        // 1: post-resource checkpoint; 2: parsed-document batch; 3: layout
        // position batch; 4: index row batch.
        if (yields === 4) controller.abort();
      },
    });
    await expect(result).rejects.toMatchObject({ code: "export.cancelled" });
    expect(yields).toBe(4);
  });

  it("keeps async and sync layout/index bytes identical and cancels within index batches", async () => {
    const documents = Array.from({ length: 129 }, (_, i) =>
      document(`c-${i}.xhtml`, `<p id="p-${i}">Chapter ${i}</p>`),
    );
    const navigation = documents.map((entry) => ({
      href: entry.path,
      title: entry.path,
    }));
    const syncLayout = layoutText(documents, []);
    const asyncLayout = await layoutTextAsync(documents, []);
    expect(asyncLayout).toEqual(syncLayout);
    const lengths = splitTextRecords(syncLayout.text).map(({ bytes }) => bytes.length);
    const syncIndexes = buildIndexes(syncLayout, navigation, lengths);
    const asyncIndexes = await buildIndexesAsync(syncLayout, navigation, lengths);
    expect(asyncIndexes).toEqual(syncIndexes);

    const controller = new AbortController();
    let yields = 0;
    await expect(
      buildIndexesAsync(syncLayout, navigation, lengths, {
        signal: controller.signal,
        yieldControl: async () => {
          yields++;
          controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "export.cancelled" });
    expect(yields).toBe(1);
  });

  it("reports monotonic progress and ends at the completed total", async () => {
    const progress: Array<{ stage: string; done: number; total: number }> = [];
    await buildAzw3(fixtureBook(), exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("08"),
      onProgress: (entry) => progress.push(entry),
    });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual({
      stage: "azw3",
      done: progress.at(-1)!.total,
      total: progress.at(-1)!.total,
    });
    expect(progress.every(({ done, total }) => done >= 0 && done <= total)).toBe(true);
    expect(progress.at(-1)!.total).toBeGreaterThan(0);
  });

  it("rejects when the final progress callback aborts after assembly", async () => {
    const controller = new AbortController();
    const events: Array<{ done: number; total: number }> = [];
    const task = buildAzw3(fixtureBook(), exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("08"),
      signal: controller.signal,
      onProgress: ({ stage, done, total }) => {
        if (stage !== "azw3") return;
        events.push({ done, total });
        if (events.length === 2 && done === total) controller.abort();
      },
    });
    await expect(task).rejects.toMatchObject({ code: "export.cancelled" });
    expect(events.at(-1)).toEqual({ done: events.at(-1)!.total, total: events.at(-1)!.total });
  });

  it("honors title-page and version-in-title options and omits absent notes and CSS", async () => {
    const book = fixtureBook();
    book.metadata.cover = null;
    book.customCss = null;
    book.chapters = [{ id: "plain", source: "# Plain\n\nJust prose." }];
    const bytes = await buildAzw3(
      book,
      { ...exportOptions(), titlePage: true, versionInTitle: true },
      { imageProcessor: fixtureProcessor(), now: () => at("08") },
    );
    const palm = readPalmDb(bytes);
    const recordZero = palm.records[0]!;
    const view = new DataView(recordZero.buffer, recordZero.byteOffset, recordZero.byteLength);
    const title = new TextDecoder().decode(
      recordZero.subarray(view.getUint32(84), view.getUint32(84) + view.getUint32(88)),
    );
    const text = readText(palm);
    expect(title).toBe("AZW3 Fixture (v1)");
    expect(text).toContain("AZW3 Fixture (v1)");
    expect(text).not.toContain("notes.xhtml");
    expect(text).not.toContain("theme.css");
    expect(exthIntegers(recordZero).get(125)).toEqual([0]);
  });

  it("rewrites colliding image basenames and CSS URLs to contiguous resource records", async () => {
    const book = fixtureBook();
    book.metadata.cover = "images/cover.png";
    book.chapters = [
      {
        id: "images",
        source:
          "# Images\n\n![cover](images/cover.png)\n\n![art](images/art/cover.png)\n\n![photo](images/photo.jpg)",
      },
    ];
    book.resources = new Map([
      ["images/cover.png", { mediaType: "image/png", bytes: png }],
      ["images/art/cover.png", { mediaType: "image/png", bytes: png }],
      ["images/css-only.png", { mediaType: "image/png", bytes: png }],
      ["images/photo.jpg", { mediaType: "image/jpeg", bytes: jpeg }],
    ]);
    book.customCss = 'body { background-image: url("images/css-only.png"); }';
    const bytes = await buildAzw3(book, exportOptions(), {
      imageProcessor: fixtureProcessor(),
      now: () => at("08"),
    });
    const palm = readPalmDb(bytes);
    const recordZero = palm.records[0]!;
    const header = new DataView(recordZero.buffer, recordZero.byteOffset, recordZero.byteLength);
    const resourceStart = header.getUint32(108);
    const resources = palm.records.slice(resourceStart, resourceStart + 4);
    expect(resources).toHaveLength(4);
    expect(resources.map((record) => record[0])).toEqual([0x89, 0x89, 0x89, 0xff]);
    expect(exthIntegers(recordZero).get(125)).toEqual([4]);
    expect(exthIntegers(recordZero).get(201)).toEqual([1]);
    const text = readText(palm);
    expect(text).toContain("kindle:embed:0001?mime=image/png");
    expect(text).toContain("kindle:embed:0002?mime=image/png");
    expect(text).toContain("kindle:embed:0004?mime=image/jpeg");
  });
});
