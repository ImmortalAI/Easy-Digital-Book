import { useDebounceFn } from "@vueuse/core";
import { onScopeDispose, watch } from "vue";
import { getRuntimePlatformServices } from "@/services/platform";
import { tokenize } from "@/services/spell/tokenize";
import { languageOf } from "@/services/spell/language";
import { useLayoutStore } from "@/stores/layout";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { appErrorFromUnknown } from "@/types/errors";
import type { Chapter } from "@/types/book";
import type { Logger, SpellChecker } from "@/types/platform";
import { SPELL_LANGUAGES, type Misspelling, type SpellLanguage } from "@/types/spelling";

export const SPELL_DEBOUNCE_MS = 300;
export const SPELL_BATCH_SIZE = 2000;
// One "unavailable" notification per app session, not per book.
let notifiedUnavailable = false;
export function resetSpellcheckSession(): void {
  notifiedUnavailable = false;
}

/** One subscription per open book shell; the editor only reads the store. */
export function useSpellcheck(options: { checker?: SpellChecker; logger?: Logger } = {}): void {
  const services = options.checker && options.logger ? null : getRuntimePlatformServices();
  const checker = options.checker ?? services!.spell;
  const logger = options.logger ?? services!.logger;
  const project = useProjectStore();
  const layout = useLayoutStore();
  const settings = useSettingsStore();
  const spelling = useSpellingStore();
  const notifications = useNotificationsStore();
  const { t } = useSafeI18n();
  const pending = new Set<string>();
  let generation = 0;
  let running = false;
  let disposed = false;

  const canRun = () => !disposed && settings.spelling.enabled && spelling.status !== "unavailable";

  function nextChapter(): Chapter | undefined {
    const chapters = project.book?.chapters ?? [];
    const open = layout.center.kind === "chapter" ? layout.center.id : "";
    return (
      (pending.has(open) ? chapters.find((chapter) => chapter.id === open) : undefined) ??
      chapters.find((chapter) => pending.has(chapter.id))
    );
  }

  async function checkChapter(chapter: Chapter, runGeneration: number) {
    const source = chapter.source;
    const tokens: Misspelling[] = tokenize(source).flatMap((token) => {
      const lang = languageOf(token.word);
      return lang ? [{ ...token, lang }] : [];
    });
    const unknown: Record<SpellLanguage, Set<string>> = { ru: new Set(), en: new Set() };
    for (const token of tokens)
      if (spelling.cached(token.lang, token.word) === undefined)
        unknown[token.lang].add(token.word);
    for (const lang of SPELL_LANGUAGES) {
      const words = [...unknown[lang]];
      for (let index = 0; index < words.length; index += SPELL_BATCH_SIZE) {
        const batch = words.slice(index, index + SPELL_BATCH_SIZE);
        const started = performance.now();
        const misspelled = new Set(await checker.check(lang, batch));
        if (runGeneration !== generation) return;
        logger.debug("Spell check batch", {
          lang,
          words: batch.length,
          ms: Math.round(performance.now() - started),
        });
        spelling.remember(lang, batch, misspelled);
      }
    }
    if (runGeneration !== generation) return;
    spelling.setChapter(
      chapter.id,
      source,
      tokens.filter((token) => spelling.cached(token.lang, token.word) === false),
    );
  }

  /** Returns true when checking must stop for this session. */
  function handleError(error: unknown): boolean {
    const appError = appErrorFromUnknown(error, "spell.check");
    if (appError.code === "spell.dictionaryLoad") {
      spelling.status = "unavailable";
      pending.clear();
      logger.error("Spelling dictionary could not be loaded", { code: appError.code });
      if (!notifiedUnavailable) {
        notifiedUnavailable = true;
        notifications.add({
          kind: "warning",
          message: t("spelling.unavailable", "Spell checking is unavailable"),
        });
      }
      return true;
    }
    logger.warn("Spell check failed", { code: appError.code });
    return false;
  }

  async function drain() {
    if (running) return;
    running = true;
    const runGeneration = generation;
    try {
      for (;;) {
        if (!canRun() || runGeneration !== generation) break;
        const chapter = nextChapter();
        if (!chapter) break;
        pending.delete(chapter.id);
        try {
          await checkChapter(chapter, runGeneration);
        } catch (error) {
          if (handleError(error)) break;
        }
      }
    } finally {
      running = false;
      if (!disposed) {
        if (spelling.status === "checking" && (!pending.size || !canRun()))
          spelling.status = "idle";
        if (canRun() && pending.size) void drain();
      }
    }
  }
  const schedule = useDebounceFn(() => void drain(), SPELL_DEBOUNCE_MS);

  function queueBook() {
    pending.clear();
    if (!canRun()) return;
    for (const chapter of project.book?.chapters ?? []) pending.add(chapter.id);
    if (pending.size) spelling.status = "checking";
    void drain();
  }

  const stopBook = watch(
    () => project.bookGeneration,
    () => {
      generation++;
      schedule.cancel();
      spelling.resetBook();
      queueBook();
    },
    { immediate: true },
  );
  const stopChapters = watch(
    () => project.book?.chapters,
    (chapters, previous) => {
      if (!chapters || !previous) return;
      const before = new Map(previous.map((chapter) => [chapter.id, chapter.source]));
      const ids = new Set(chapters.map((chapter) => chapter.id));
      for (const id of spelling.chapters.keys()) if (!ids.has(id)) spelling.removeChapter(id);
      for (const id of [...pending]) if (!ids.has(id)) pending.delete(id);
      for (const chapter of chapters)
        if (before.get(chapter.id) !== chapter.source) pending.add(chapter.id);
      if (pending.size && canRun()) schedule();
    },
  );
  const stopEnabled = watch(
    () => settings.spelling.enabled,
    (enabled) => {
      if (enabled) queueBook();
    },
  );
  onScopeDispose(() => {
    disposed = true;
    generation++;
    schedule.cancel();
    stopBook();
    stopChapters();
    stopEnabled();
  });
}
