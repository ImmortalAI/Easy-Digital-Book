import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { resetSpellcheckSession, useSpellcheck } from "../use-spellcheck";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";
import { useLayoutStore } from "@/stores/layout";
import { useNotificationsStore } from "@/stores/notifications";
import { createMemorySpellChecker } from "@/services/platform/memory-spell";
import { createBook } from "@/services/book/create";
import type { Book } from "@/types/book";

const logger = {
  debug: vi.fn<(message: string, context?: unknown) => void>(),
  info: vi.fn<(message: string, context?: unknown) => void>(),
  warn: vi.fn<(message: string, context?: unknown) => void>(),
  error: vi.fn<(message: string, context?: unknown) => void>(),
};
function book(sources: string[], id = "550e8400-e29b-41d4-a716-446655440000"): Book {
  const base = createBook({
    locale: "ru",
    now: "2026-10-06T00:00:00Z",
    newUuid: () => id,
    newChapterId: () => "chapter0",
  });
  return { ...base, chapters: sources.map((source, index) => ({ id: `chapter${index}`, source })) };
}
function start(checker = createMemorySpellChecker({ known: ["мир", "и"] })) {
  const scope = effectScope();
  scope.run(() => useSpellcheck({ checker, logger }));
  return { scope, checker };
}

describe("useSpellcheck", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetSpellcheckSession();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("checks the open chapter first, then the rest", async () => {
    const project = useProjectStore();
    const layout = useLayoutStore();
    project.setBook(book(["мир превет", "мир иии"]));
    layout.center = { kind: "chapter", id: "chapter1" };
    const { checker } = start();
    await flushPromises();
    expect(checker.calls[0]).toEqual({ lang: "ru", words: ["мир", "иии"] });
    const spelling = useSpellingStore();
    expect(spelling.visible.get("chapter0")?.items.map((i) => i.word)).toEqual(["превет"]);
    expect(spelling.visible.get("chapter1")?.items.map((i) => i.word)).toEqual(["иии"]);
    expect(spelling.status).toBe("idle");
  });

  it("debounces edits and does not call Rust for cached words", async () => {
    const project = useProjectStore();
    project.setBook(book(["мир превет"]));
    const { checker } = start();
    await flushPromises();
    const calls = checker.calls.length;
    project.updateChapterSource("chapter0", "превет мир");
    await nextTick();
    vi.advanceTimersByTime(299);
    await flushPromises();
    expect(useSpellingStore().chapters.get("chapter0")?.source).toBe("мир превет");
    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(checker.calls.length).toBe(calls);
    expect(useSpellingStore().chapters.get("chapter0")).toEqual({
      source: "превет мир",
      items: [{ word: "превет", lang: "ru", from: 0, to: 6 }],
    });
  });

  it("splits unique words into batches of 2000", async () => {
    const project = useProjectStore();
    // 4500 distinct Cyrillic words: i written in base 32 with the letters а…я.
    const word = (i: number) => {
      let value = "сл";
      do {
        value += String.fromCharCode(1072 + (i % 32));
        i = Math.floor(i / 32);
      } while (i > 0);
      return value;
    };
    project.setBook(book([Array.from({ length: 4500 }, (_, i) => word(i)).join(" ")]));
    const { checker } = start();
    await flushPromises();
    expect(checker.calls.map((call) => call.words.length)).toEqual([2000, 2000, 500]);
  });

  it("drops results that finish after the book changed", async () => {
    const project = useProjectStore();
    let release!: (value: string[]) => void;
    const checker = {
      check: vi.fn<() => Promise<string[]>>(
        () => new Promise<string[]>((resolve) => (release = resolve)),
      ),
      suggest: vi.fn<() => Promise<string[]>>(async () => []),
    };
    project.setBook(book(["превет"]));
    start(checker as never);
    await flushPromises();
    project.setBook(book(["мир"]));
    release(["превет"]);
    await flushPromises();
    expect(useSpellingStore().chapters.get("chapter0")?.source).not.toBe("превет");
  });

  it("removes deleted chapters from the results", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет", "иии"]));
    start();
    await flushPromises();
    project.applyMutation({
      book: { ...project.book!, chapters: project.book!.chapters.slice(0, 1) },
      changedChapters: new Set(),
      removedChapters: new Set(["chapter1"]),
      changedResources: new Set(),
      removedResources: new Set(),
    });
    await nextTick();
    expect(useSpellingStore().chapters.has("chapter1")).toBe(false);
  });

  it("goes unavailable once, notifies once per session, keeps editing working", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет"]));
    start(createMemorySpellChecker({ failLoad: true }));
    await flushPromises();
    const spelling = useSpellingStore();
    expect(spelling.status).toBe("unavailable");
    expect(useNotificationsStore().items).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { code: "spell.dictionaryLoad" });
    project.setBook(book(["другая"], "6ba7b810-9dad-41d1-80b4-00c04fd430c8"));
    await flushPromises();
    expect(useNotificationsStore().items).toHaveLength(1);
    expect(spelling.status).toBe("unavailable");
  });

  it("does not cache words after a failed check and retries on the next edit", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет"]));
    const checker = createMemorySpellChecker({ known: [] });
    const check = vi.spyOn(checker, "check").mockRejectedValueOnce(new Error("boom"));
    start(checker);
    await flushPromises();
    expect(useSpellingStore().cached("ru", "превет")).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("превет");
    project.updateChapterSource("chapter0", "превет ");
    await nextTick();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(check).toHaveBeenCalledTimes(2);
    expect(useSpellingStore().total).toBe(1);
  });

  it("does nothing while spelling is disabled and catches up when enabled", async () => {
    const project = useProjectStore();
    const settings = (await import("@/stores/settings")).useSettingsStore();
    settings.spelling = { enabled: false, languages: { ru: true, en: true } };
    project.setBook(book(["превет"]));
    const { checker } = start();
    await flushPromises();
    expect(checker.calls).toHaveLength(0);
    settings.spelling = { enabled: true, languages: { ru: true, en: true } };
    await flushPromises();
    expect(useSpellingStore().total).toBe(1);
  });
});
