import { EditorState } from "@codemirror/state";
import { replaceAll, search, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { findInBook } from "@/services/search/find";
import {
  buildChapterQuery,
  countMatches,
  type ChapterSearchInput,
} from "@/components/editor/chapter-search";

const input = (patch: Partial<ChapterSearchInput>): ChapterSearchInput => ({
  text: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  replace: "",
  ...patch,
});

function matches(doc: string, query: ChapterSearchInput) {
  const built = buildChapterQuery(query);
  if ("error" in built) throw new Error(built.error);
  const cursor = built.query.getCursor(EditorState.create({ doc }));
  const found: string[] = [];
  for (let next = cursor.next(); !next.done; next = cursor.next())
    found.push(doc.slice(next.value.from, next.value.to));
  return found;
}

describe("chapter search query", () => {
  it("matches exactly what the book search matches", () => {
    const doc = "Кот котик кот-кот КОТ_ кот1 ёж Ёж";
    const book = createBook({
      locale: "en",
      now: "2026-01-01T00:00:00.000Z",
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters[0]!.source = doc;
    for (const query of [
      input({ text: "кот", wholeWord: true }),
      input({ text: "кот", wholeWord: true, caseSensitive: true }),
      input({ text: "ёж" }),
      input({ text: "к.т", regex: true }),
    ]) {
      const inBook = findInBook(book, query);
      if ("error" in inBook) throw new Error(inBook.error);
      expect(matches(doc, query)).toEqual(inBook.map((result) => result.matched));
    }
  });

  it("treats metacharacters and $ literally outside regex mode", () => {
    const doc = "a.b axb (x) $1";
    expect(matches(doc, input({ text: "a.b" }))).toEqual(["a.b"]);
    expect(matches(doc, input({ text: "(x)" }))).toEqual(["(x)"]);
    const built = buildChapterQuery(input({ text: "a.b", replace: "$1\\n" }));
    if ("error" in built) throw new Error(built.error);
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [search()] }),
      parent: document.body,
    });
    view.dispatch({ effects: setSearchQuery.of(built.query) });
    replaceAll(view);
    expect(view.state.doc.toString()).toBe("$1\\n axb (x) $1");
    view.destroy();
  });

  it("reports an invalid regular expression", () => {
    expect(buildChapterQuery(input({ text: "(", regex: true }))).toEqual({
      error: "search.invalidRegex",
    });
  });
});

describe("countMatches", () => {
  const state = (doc: string, anchor = 0, head = anchor) =>
    EditorState.create({ doc, selection: { anchor, head } });
  const query = (text: string) => {
    const built = buildChapterQuery(input({ text }));
    if ("error" in built) throw new Error(built.error);
    return built.query;
  };

  it("counts all matches and knows which one is selected", () => {
    expect(countMatches(state("ab ab ab", 3, 5), query("ab"))).toEqual({
      total: 3,
      capped: false,
      current: 2,
    });
    expect(countMatches(state("ab ab ab", 1), query("ab")).current).toBeNull();
  });

  it("stops at the cap", () => {
    expect(countMatches(state("a".repeat(20)), query("a"), 5)).toEqual({
      total: 5,
      capped: true,
      current: null,
    });
  });

  it("counts nothing for an empty query", () => {
    expect(countMatches(state("abc"), query(""))).toEqual({
      total: 0,
      capped: false,
      current: null,
    });
  });
});
