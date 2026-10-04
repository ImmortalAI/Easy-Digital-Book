import { describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { addChapter } from "@/services/book/chapters";
import { extractTitle } from "@/services/book/extract-title";
import { importImage, removeResources } from "@/services/book/resources";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("book domain", () => {
  it("creates a localized new book with an injected clock and id", () => {
    const book = createBook({
      locale: "ru",
      now: new Date("2026-01-02T03:04:05.000Z"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "abc12345",
    });
    expect(book.metadata.title).toBe("Без названия");
    expect(book.metadata.language).toBe("ru");
    expect(book.metadata.created).toBe("2026-01-02T03:04:05.000Z");
    expect(book.chapters).toEqual([{ id: "abc12345", source: "# Глава 1" }]);
  });

  it("extracts a title only from a first-line NovLang heading", () => {
    expect(extractTitle("# My Chapter\ntext")).toBe("My Chapter");
    expect(extractTitle("text\n# Not a title")).toBeNull();
  });

  it("reuses a resource when its SHA-256 matches", async () => {
    const book = createBook({
      locale: "en",
      now: new Date("2026-01-02"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapt001",
    });
    const first = await importImage(book, "cover.png", png, { sha256: async () => "hash" });
    const result = await importImage(first.book, "other name.png", png, {
      sha256: async () => "hash",
    });
    expect(result.path).toBe("images/cover.png");
    expect(result.inserted).toBe(false);
    expect(result.book).toBe(first.book);
  });

  it("rejects invalid generated identifiers", () => {
    expect(() =>
      createBook({ locale: "en", now: new Date("2026-01-02"), newId: () => "invalid" }),
    ).toThrow("Invalid UUID");
  });

  it("adds a localized generated chapter and reports its mutation", () => {
    const book = createBook({
      locale: "ru",
      now: new Date("2026-01-02"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapt001",
    });
    const result = addChapter(book, { locale: "ru", newId: () => "chapt002" });
    expect(result.book.chapters[result.book.chapters.length - 1]).toEqual({
      id: "chapt002",
      source: "# Глава 2",
    });
    expect(result.changedChapters).toEqual(new Set(["chapt002"]));
  });

  it("uses the detected image format extension", async () => {
    const book = createBook({
      locale: "en",
      now: new Date("2026-01-02"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapt001",
    });
    const result = await importImage(book, "cover.exe", png, { sha256: async () => "png-hash" });
    expect(result.path).toBe("images/cover.png");
  });

  it("removes several resources and clears a removed cover", () => {
    const book = createBook({
      locale: "en",
      now: new Date(0),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "abc12345",
    });
    for (const name of ["a", "b", "c"])
      book.resources.set(`images/${name}.png`, { bytes: png, mediaType: "image/png" });
    book.metadata.cover = "images/b.png";
    const result = removeResources(book, ["images/a.png", "images/b.png", "images/missing.png"]);
    expect([...result.book.resources.keys()]).toEqual(["images/c.png"]);
    expect(result.book.metadata.cover).toBeNull();
    expect(result.metadataCoverChanged).toBe(true);
    expect(result.removedResources).toEqual(new Set(["images/a.png", "images/b.png"]));
  });
});
