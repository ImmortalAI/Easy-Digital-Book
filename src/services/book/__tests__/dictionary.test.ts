import { describe, expect, it } from "vitest";
import { createBook } from "../create";
import {
  addToDictionary,
  isDictionaryWord,
  normalizeDictionary,
  parseDictionaryText,
  removeFromDictionary,
  serializeDictionary,
} from "../dictionary";

const book = () =>
  createBook({
    locale: "ru",
    now: "2026-10-06T00:00:00Z",
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("book dictionary", () => {
  it("starts empty", () => expect(book().dictionary).toEqual([]));
  it("normalizes: trim, drop empties and duplicates, code-point sort", () => {
    expect(normalizeDictionary([" Минжуй ", "", "дао", "Минжуй", "Ann"])).toEqual([
      "Ann",
      "Минжуй",
      "дао",
    ]);
  });
  it("parses CRLF text and serializes with a trailing LF", () => {
    expect(parseDictionaryText("дао\r\n\r\nМинжуй\nдао\n")).toEqual(["Минжуй", "дао"]);
    expect(serializeDictionary(["Минжуй", "дао"])).toBe("Минжуй\nдао\n");
  });
  it("accepts single words only", () => {
    expect(isDictionaryWord("из-за")).toBe(true);
    expect(isDictionaryWord("два слова")).toBe(false);
    expect(isDictionaryWord("  ")).toBe(false);
  });
  it("adds and removes without touching chapters", () => {
    const start = book();
    const added = addToDictionary(start, "Минжуй");
    expect(added.book.dictionary).toEqual(["Минжуй"]);
    expect(added.changedChapters.size).toBe(0);
    expect(addToDictionary(added.book, "Минжуй").book).toBe(added.book);
    expect(addToDictionary(start, "два слова").book).toBe(start);
    const removed = removeFromDictionary(added.book, "Минжуй");
    expect(removed.book.dictionary).toEqual([]);
    expect(removeFromDictionary(removed.book, "Минжуй").book).toBe(removed.book);
  });
});
