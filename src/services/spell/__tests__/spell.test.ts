import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";
import { languageOf } from "../language";
import { createDictionaryIndex, isAccepted } from "../dictionary";
import { contextSnippet, summarizeMisspellings } from "../summary";

const words = (source: string) => tokenize(source).map((token) => token.word);

describe("tokenize", () => {
  it("returns words with offsets into the source", () => {
    const source = "Он **сказал** и *вышел*.";
    const tokens = tokenize(source);
    expect(tokens.map((token) => source.slice(token.from, token.to))).toEqual([
      "Он",
      "сказал",
      "и",
      "вышел",
    ]);
    expect(tokens.map((token) => token.word)).toEqual(["Он", "сказал", "и", "вышел"]);
  });
  it("skips block prefixes and footnote markup but checks their text", () => {
    expect(words("# Глава один\n> цитата\n[^note]: текст сноски\nслово[^abc] дальше")).toEqual([
      "Глава",
      "один",
      "цитата",
      "текст",
      "сноски",
      "слово",
      "дальше",
    ]);
  });
  it("checks image alt text and skips the image path", () => {
    expect(words("![красный дракон](images/red-dragon_01.png) после")).toEqual([
      "красный",
      "дракон",
      "после",
    ]);
  });
  it("keeps inner hyphens and apostrophes, drops edge ones", () => {
    expect(words("из-за кто-нибудь don't rock'n'roll -край- 'quoted'")).toEqual([
      "из-за",
      "кто-нибудь",
      "don't",
      "rock'n'roll",
      "край",
      "quoted",
    ]);
  });
  it("skips tokens with digits or underscores, and scene breaks", () => {
    expect(words("глава2 3D 2026 snake_case\n***\nслово")).toEqual(["слово"]);
  });
  it("handles CRLF-free empty and markup-only sources", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("***\n\n> \n")).toEqual([]);
  });
});

describe("languageOf", () => {
  it("maps scripts to languages", () => {
    expect(languageOf("слово")).toBe("ru");
    expect(languageOf("из-за")).toBe("ru");
    expect(languageOf("ёлка")).toBe("ru");
    expect(languageOf("don't")).toBe("en");
    expect(languageOf("Café")).toBe("en");
    expect(languageOf("словоword")).toBeNull();
    expect(languageOf("北京")).toBeNull();
    expect(languageOf("λόγος")).toBeNull();
  });
});

describe("book dictionary matching", () => {
  const index = createDictionaryIndex(["Минжуй", "Алёна", "дао"]);
  const none = new Set<string>();
  it("ignores first-letter case but not all caps", () => {
    expect(isAccepted("Минжуй", index, none)).toBe(true);
    expect(isAccepted("минжуй", index, none)).toBe(true);
    expect(isAccepted("МИНЖУЙ", index, none)).toBe(false);
    expect(isAccepted("Дао", index, none)).toBe(true);
  });
  it("treats ё and е as equal in both directions", () => {
    expect(isAccepted("Алена", index, none)).toBe(true);
    expect(isAccepted("Алёна", createDictionaryIndex(["Алена"]), none)).toBe(true);
  });
  it("accepts ignored words exactly", () => {
    const ignores = new Set(["Минжуи"]);
    expect(isAccepted("Минжуи", index, ignores)).toBe(true);
    expect(isAccepted("минжуи", index, ignores)).toBe(false);
  });
});

describe("summary", () => {
  it("groups by word in first-occurrence order with counts", () => {
    const items = [
      { word: "Минжуи", lang: "ru" as const, from: 0, to: 6 },
      { word: "превет", lang: "ru" as const, from: 10, to: 16 },
      { word: "Минжуи", lang: "ru" as const, from: 20, to: 26 },
    ];
    expect(summarizeMisspellings(items)).toEqual([
      { word: "Минжуи", lang: "ru", count: 2, first: items[0] },
      { word: "превет", lang: "ru", count: 1, first: items[1] },
    ]);
  });
  it("cuts context at the radius and at line breaks", () => {
    const source = "первая строка\nон сказал Минжуи и вышел из дома очень надолго";
    const from = source.indexOf("Минжуи");
    expect(contextSnippet(source, from, from + 6, 10)).toEqual({
      before: "он сказал ",
      word: "Минжуи",
      after: " и вышел и…",
    });
    expect(contextSnippet("а".repeat(50) + "Х", 50, 51, 5)).toEqual({
      before: "…ааааа",
      word: "Х",
      after: "",
    });
  });
});
