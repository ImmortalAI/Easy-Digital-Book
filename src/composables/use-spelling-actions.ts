import { getRuntimePlatformServices } from "@/services/platform";
import { addToDictionary as addWord } from "@/services/book/dictionary";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";
import type { SpellLanguage } from "@/types/spelling";

/** The only place spelling UI touches the platform and the book. */
export function useSpellingActions() {
  const services = getRuntimePlatformServices();
  const project = useProjectStore();
  const spelling = useSpellingStore();
  return {
    async suggest(lang: SpellLanguage, word: string): Promise<string[]> {
      try {
        return await services.spell.suggest(lang, word);
      } catch (error) {
        services.logger.warn("Spelling suggestions failed", {
          code: (error as { code?: string }).code,
        });
        return [];
      }
    },
    addToDictionary(word: string) {
      if (!project.book) return;
      const mutation = addWord(project.book, word);
      if (mutation.book !== project.book) project.applyMutation(mutation);
    },
    ignore: (word: string) => spelling.ignore(word),
    openLogs: () => services.logs.openDirectory(),
  };
}
