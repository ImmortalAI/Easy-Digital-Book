import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createDictionaryIndex, isAccepted } from "@/services/spell/dictionary";
import type { Misspelling, SpellLanguage } from "@/types/spelling";

export type SpellingStatus = "idle" | "checking" | "unavailable";
export interface ChapterSpelling {
  /** The chapter text the offsets belong to. */
  source: string;
  items: Misspelling[];
}

export const useSpellingStore = defineStore("spelling", () => {
  const project = useProjectStore();
  const settings = useSettingsStore();
  // Base-dictionary verdicts, shared by all chapters and books: true = correct.
  const cache = new Map<string, boolean>();
  const chapters = shallowRef(new Map<string, ChapterSpelling>());
  const ignores = shallowRef(new Set<string>());
  const status = ref<SpellingStatus>("idle");
  const dictionaryIndex = computed(() => createDictionaryIndex(project.book?.dictionary ?? []));

  const visible = computed(() => {
    const result = new Map<string, ChapterSpelling>();
    const { enabled, languages } = settings.spelling;
    if (!enabled) return result;
    for (const [id, entry] of chapters.value) {
      const items = entry.items.filter(
        (item) =>
          languages[item.lang] && !isAccepted(item.word, dictionaryIndex.value, ignores.value),
      );
      if (items.length) result.set(id, { source: entry.source, items });
    }
    return result;
  });
  const total = computed(() =>
    [...visible.value.values()].reduce((sum, entry) => sum + entry.items.length, 0),
  );

  const key = (lang: SpellLanguage, word: string) => `${lang}:${word}`;
  function cached(lang: SpellLanguage, word: string): boolean | undefined {
    return cache.get(key(lang, word));
  }
  function remember(lang: SpellLanguage, words: string[], misspelled: ReadonlySet<string>) {
    for (const word of words) cache.set(key(lang, word), !misspelled.has(word));
  }
  function setChapter(id: string, source: string, items: Misspelling[]) {
    chapters.value = new Map(chapters.value).set(id, { source, items });
  }
  function removeChapter(id: string) {
    if (!chapters.value.has(id)) return;
    const next = new Map(chapters.value);
    next.delete(id);
    chapters.value = next;
  }
  function ignore(word: string) {
    ignores.value = new Set(ignores.value).add(word);
  }
  function resetBook() {
    chapters.value = new Map();
    ignores.value = new Set();
    if (status.value !== "unavailable") status.value = "idle";
  }
  return {
    status,
    chapters,
    visible,
    total,
    cached,
    remember,
    setChapter,
    removeChapter,
    ignore,
    resetBook,
  };
});
