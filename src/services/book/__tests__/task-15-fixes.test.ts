import { describe, expect, it } from "vitest";
import { addChapter, moveChapter } from "@/services/book/chapters";
import { createBook } from "@/services/book/create";
import { normalizeSeriesIndex } from "@/services/book/metadata";
import { customCssTemplate } from "@/assets/epub/custom.css";
import { imageDimensions, imageMetadata } from "@/services/book/image-dimensions";

const base = () =>
  createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("Task 15 fix round domain boundaries", () => {
  it("uses the primary locale subtag for generated chapter headings", () => {
    const mutation = addChapter(base(), { locale: "ru-RU", newId: () => "chapter2" });
    expect(mutation.book.chapters[1]?.source).toBe("# Глава 2");
    expect(
      addChapter(base(), { locale: "zh-CN", newId: () => "chapter2" }).book.chapters[1]?.source,
    ).toBe("# 第 2 章");
    expect(
      addChapter(base(), { locale: "zh-Hans-CN", newId: () => "chapter2" }).book.chapters[1]
        ?.source,
    ).toBe("# 第 2 章");
  });

  it("rejects non-finite series indexes and keeps fractional indexes", () => {
    expect(normalizeSeriesIndex("1.5")).toBe(1.5);
    expect(normalizeSeriesIndex("Infinity")).toBeNull();
    expect(normalizeSeriesIndex("x")).toBeNull();
  });

  it("does not mark an out-of-bounds or no-op move as changed", () => {
    const book = base();
    book.chapters.push({ id: "chapter2", source: "# Two" });
    expect(moveChapter(book, 0, 0).changedChapters).toEqual(new Set());
    expect(moveChapter(book, -1, 1).book).toBe(book);
    expect(moveChapter(book, 2, 0).book).toBe(book);
  });

  it("ships the documented custom CSS starter template", () => {
    expect(customCssTemplate).toContain(".novlang-scene-break");
    expect(customCssTemplate).toContain("Footnotes");
  });

  it("reads PNG dimensions without relying on DOM image loading", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(bytes.buffer).setUint32(16, 1600);
    new DataView(bytes.buffer).setUint32(20, 2560);
    expect(imageDimensions(bytes, "image/png")).toEqual({ width: 1600, height: 2560 });
  });

  it("reads JPEG SOF and WebP VP8 and VP8X dimensions", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 20, 1]);
    expect(imageDimensions(jpeg, "image/jpeg")).toEqual({ width: 20, height: 10 });
    const vp8x = new Uint8Array(30);
    vp8x.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    vp8x.set([1, 0, 0, 2, 0, 0], 24);
    expect(imageDimensions(vp8x, "image/webp")).toEqual({ width: 2, height: 3 });
    const vp8 = new Uint8Array(42);
    vp8.set(vp8x.subarray(0, 12));
    vp8.set([0x56, 0x50, 0x38, 0x20], 12);
    vp8.set([0x9d, 1, 0x2a, 20, 0, 10, 0], 23);
    expect(imageDimensions(vp8, "image/webp")).toEqual({ width: 20, height: 10 });
    const maskedVp8 = new Uint8Array(vp8);
    maskedVp8[26] = 0xff;
    maskedVp8[27] = 0xff;
    maskedVp8[28] = 0xff;
    maskedVp8[29] = 0xff;
    expect(imageDimensions(maskedVp8, "image/webp")).toEqual({ width: 16383, height: 16383 });
  });

  it.each([
    {
      name: "rejects a truncated 24-byte header",
      length: 24,
      packed: [0x34, 0xd2, 0x56, 0x1a],
      expected: null,
    },
    {
      name: "reads packed fields from a minimum 25-byte header, ignoring the alpha bit",
      length: 25,
      // width - 1 = 0x1234; height - 1 = 0x295b; bit 28 indicates alpha.
      packed: [0x34, 0xd2, 0x56, 0x1a],
      expected: { width: 4661, height: 10588 },
    },
    {
      name: "reads minimum dimensions",
      length: 25,
      packed: [0, 0, 0, 0],
      expected: { width: 1, height: 1 },
    },
    {
      name: "reads maximum 14-bit dimensions",
      length: 25,
      packed: [0xff, 0xff, 0xff, 0x0f],
      expected: { width: 16384, height: 16384 },
    },
  ])("WebP VP8L $name", ({ length, packed, expected }) => {
    const bytes = new Uint8Array(25);
    bytes.set([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0, 0, 0,
      0, 0x2f,
    ]);
    bytes.set(packed, 21);
    expect(imageDimensions(bytes.subarray(0, length), "image/webp")).toEqual(expected);
  });

  it("reads the alpha flag of a lossless WebP", () => {
    // 16x8 VP8L: bits 0-13 width-1, bits 14-27 height-1, bit 28 alpha_is_used.
    const lossless = (alpha: boolean) => {
      const bytes = new Uint8Array(25);
      bytes.set([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0, 0, 0,
        0, 0x2f,
      ]);
      bytes.set([0x0f, 0xc0, 0x01, alpha ? 0x10 : 0x00], 21);
      return bytes;
    };

    // Reported as opaque, planImage re-encodes to JPEG and the transparent
    // areas come out black.
    expect(imageMetadata(lossless(true), "image/webp")).toEqual({
      width: 16,
      height: 8,
      hasAlpha: true,
    });
    expect(imageMetadata(lossless(false), "image/webp")).toEqual({
      width: 16,
      height: 8,
      hasAlpha: false,
    });
  });

  it("reports lossy WebP as opaque, since VP8 carries no alpha channel", () => {
    const vp8 = new Uint8Array(42);
    vp8.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    vp8.set([0x56, 0x50, 0x38, 0x20], 12);
    vp8.set([0x9d, 1, 0x2a, 20, 0, 10, 0], 23);

    expect(imageMetadata(vp8, "image/webp")).toEqual({ width: 20, height: 10, hasAlpha: false });
  });
});
