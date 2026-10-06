import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { Book, BookMutation } from "@/types/book";
import type { PlatformServices, RecoveryDelta } from "@/types/platform";
import { writeEdb } from "@/services/edb/write";

let configuredServices: PlatformServices | undefined;
let translate: (key: string, fallback: string, params?: unknown) => string = (_key, fallback) =>
  fallback;
export function snapshotBook(book: Book): Book {
  return {
    metadata: {
      ...book.metadata,
      authors: [...book.metadata.authors],
      translators: [...book.metadata.translators],
      series: book.metadata.series ? { ...book.metadata.series } : null,
    },
    chapters: book.chapters.map((chapter) => ({ ...chapter })),
    resources: new Map(
      [...book.resources].map(([path, resource]) => [
        path,
        { mediaType: resource.mediaType, bytes: new Uint8Array(resource.bytes) },
      ]),
    ),
    customCss: book.customCss,
    dictionary: [...book.dictionary],
  };
}
export interface SetBookOptions {
  dirty?: boolean;
  fileMtime?: number | null;
}
export const useProjectStore = defineStore("project", () => {
  const book = ref<Book | null>(null),
    filePath = ref<string | null>(null),
    revision = ref(0),
    savedRevision = ref(0),
    fileMtime = ref<number | null>(null),
    saving = ref(false),
    bookGeneration = ref(0),
    recoveryGeneration = ref(0),
    coverRevision = ref(0);
  const changedChapters = ref(new Set<string>()),
    removedChapters = ref(new Set<string>()),
    changedResources = ref(new Set<string>()),
    removedResources = ref(new Set<string>());
  const chapterRevisions = ref(new Map<string, number>());
  const dirty = computed(() => revision.value !== savedRevision.value);
  let services: PlatformServices | undefined = configuredServices;
  function configure(
    value: PlatformServices,
    translator?: (key: string, fallback: string, params?: unknown) => string,
  ) {
    services = value;
    if (translator) translate = translator;
  }
  function setServices(value: PlatformServices) {
    configure(value);
  }
  function setBook(value: Book, path: string | null = null, options: SetBookOptions = {}) {
    bookGeneration.value++;
    book.value = value;
    filePath.value = path;
    revision.value = options.dirty ? 1 : 0;
    savedRevision.value = 0;
    fileMtime.value = options.fileMtime ?? null;
    clearDelta();
    chapterRevisions.value = new Map(value.chapters.map((chapter) => [chapter.id, 0]));
    coverRevision.value = 0;
  }
  function clearDelta() {
    changedChapters.value = new Set();
    removedChapters.value = new Set();
    changedResources.value = new Set();
    removedResources.value = new Set();
  }
  function applyMutation(mutation: BookMutation) {
    if (!book.value) throw new Error("No project is open");
    const coverChanged =
      mutation.metadataCoverChanged === true ||
      book.value.metadata.cover !== mutation.book.metadata.cover;
    book.value = mutation.book;
    revision.value++;
    if (coverChanged) coverRevision.value++;
    const add = <T>(target: Set<T>, values: Set<T>) => {
      for (const value of values) target.add(value);
    };
    add(changedChapters.value, mutation.changedChapters);
    add(removedChapters.value, mutation.removedChapters);
    add(changedResources.value, mutation.changedResources);
    add(removedResources.value, mutation.removedResources);
    const next = new Map(chapterRevisions.value);
    for (const id of mutation.changedChapters) next.set(id, (next.get(id) ?? 0) + 1);
    for (const id of mutation.removedChapters) next.set(id, (next.get(id) ?? 0) + 1);
    chapterRevisions.value = next;
  }
  function updateChapterSource(id: string, source: string) {
    if (!book.value) throw new Error("No project is open");
    const chapter = book.value.chapters.find((item) => item.id === id);
    if (!chapter || chapter.source === source) return;
    applyMutation({
      book: {
        ...book.value,
        chapters: book.value.chapters.map((item) => (item.id === id ? { ...item, source } : item)),
      },
      changedChapters: new Set([id]),
      removedChapters: new Set(),
      changedResources: new Set(),
      removedResources: new Set(),
    });
  }
  function chapterRevision(id: string): number {
    return chapterRevisions.value.get(id) ?? 0;
  }
  const recoveryDelta = computed<RecoveryDelta>(() => ({
    changedChapters: changedChapters.value,
    removedChapters: removedChapters.value,
    changedResources: changedResources.value,
    removedResources: removedResources.value,
  }));
  async function save(path = filePath.value): Promise<boolean> {
    if (!book.value || !path) return false;
    if (!dirty.value && filePath.value === path) return true;
    if (!services) throw new Error("Platform services are not configured");
    if (saving.value) return false;
    saving.value = true;
    const generationAtStart = bookGeneration.value;
    const bookAtStart = book.value;
    const isCurrentProject = () =>
      bookGeneration.value === generationAtStart &&
      book.value?.metadata.id === bookAtStart.metadata.id;
    try {
      if (path === filePath.value && fileMtime.value !== null) {
        try {
          const current = await services.files.stat(path);
          if (current.mtime !== null && current.mtime !== fileMtime.value) {
            const overwrite = await services.dialogs.confirm(
              translate(
                "files.fileChanged",
                "The file was changed by another program. Overwrite it?",
              ),
              translate("files.fileChangedTitle", "File changed"),
            );
            if (!overwrite) return false;
          }
        } catch (error) {
          services.logger.warn("Could not verify file modification time", { error });
        }
      }
      if (!isCurrentProject()) return false;
      const snapshotRevision = revision.value;
      const updateModified = dirty.value;
      const snapshot = snapshotBook(bookAtStart);
      const savedAt = new Date();
      if (updateModified) snapshot.metadata.modified = savedAt.toISOString();
      try {
        const bytes = await writeEdb(snapshot, savedAt, { updateModified: false });
        await services.files.writeFileAtomic(path, bytes);
      } catch (error) {
        services.logger.error("Failed to save project", { error });
        try {
          await services.dialogs.message(
            translate("files.saveFailed", "Could not save project"),
            translate("files.saveTitle", "Save project"),
          );
        } catch (dialogError) {
          services.logger.warn("Could not show save error", { error: dialogError });
        }
        return false;
      }
      if (!isCurrentProject()) return true;
      let savedFileMtime: number | null = null;
      try {
        savedFileMtime = (await services.files.stat(path)).mtime;
      } catch {
        savedFileMtime = null;
      }
      if (!isCurrentProject()) return true;
      filePath.value = path;
      savedRevision.value = snapshotRevision;
      fileMtime.value = savedFileMtime;
      if (revision.value === snapshotRevision) {
        book.value.metadata.modified = snapshot.metadata.modified;
      }
      if (isCurrentProject() && revision.value === snapshotRevision) {
        clearDelta();
        try {
          await services.recovery.remove(snapshot.metadata.id);
        } catch (error) {
          services.logger.warn("Saved project but failed to remove recovery session", { error });
        }
      }
      return true;
    } finally {
      saving.value = false;
    }
  }
  async function saveAs(path: string) {
    return save(path);
  }
  function reset() {
    bookGeneration.value++;
    book.value = null;
    filePath.value = null;
    revision.value = 0;
    savedRevision.value = 0;
    fileMtime.value = null;
    clearDelta();
    chapterRevisions.value = new Map();
    coverRevision.value = 0;
  }
  function invalidateRecovery() {
    recoveryGeneration.value++;
  }
  return {
    book,
    filePath,
    revision,
    savedRevision,
    fileMtime,
    saving,
    bookGeneration,
    recoveryGeneration,
    coverRevision,
    dirty,
    recoveryDelta,
    configure,
    setServices,
    setBook,
    applyMutation,
    updateChapterSource,
    chapterRevision,
    save,
    saveAs,
    reset,
    invalidateRecovery,
  };
});
export function configureProjectServices(services: PlatformServices) {
  configuredServices = services;
}
