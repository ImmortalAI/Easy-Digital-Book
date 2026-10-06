import { AppError } from "@/types/errors";
import type { SpellChecker } from "@/types/platform";
import type { SpellLanguage } from "@/types/spelling";

/** Words the e2e in-memory platform accepts; everything else is "misspelled". */
export const DEFAULT_MEMORY_WORDS: readonly string[] = [
  "глава",
  "мир",
  "и",
  "он",
  "сказал",
  "вышел",
  "chapter",
  "hello",
  "world",
  "the",
];
const lowerFirst = (word: string) => word.charAt(0).toLocaleLowerCase() + word.slice(1);

export function createMemorySpellChecker(
  options: { known?: Iterable<string>; failLoad?: boolean } = {},
): SpellChecker & { calls: Array<{ lang: SpellLanguage; words: string[] }> } {
  const known = new Set([...(options.known ?? DEFAULT_MEMORY_WORDS)].map(lowerFirst));
  const calls: Array<{ lang: SpellLanguage; words: string[] }> = [];
  const ensureLoaded = () => {
    if (options.failLoad)
      throw new AppError("spell.dictionaryLoad", "Spelling dictionary could not be loaded");
  };
  return {
    calls,
    async check(lang, words) {
      ensureLoaded();
      calls.push({ lang, words: [...words] });
      return words.filter((word) => !known.has(lowerFirst(word)));
    },
    async suggest(_lang, word) {
      ensureLoaded();
      const target = lowerFirst(word);
      return [...known]
        .filter((item) => item[0] === target[0] && Math.abs(item.length - target.length) <= 1)
        .filter((item) => item !== target)
        .slice(0, 5);
    },
  };
}
