import type {
  FileSystem,
  PlatformServices,
  RecoveredBook,
  RecoveryDelta,
  RecoverySessionSummary,
  RecoveryStore,
  SettingsRepository,
} from "@/types/platform";
import type { Book, Resource } from "@/types/book";
import { createRecoveryStore } from "./recovery";
import { tauriDialogs } from "./dialogs";
import { tauriFileSystem } from "./fs";
import { tauriLogger } from "./logger";
import { tauriOpener } from "./opener";
import { tauriSettings } from "./settings";
import { githubUpdates, noUpdates } from "./updates";
import { tauriLogs } from "./logs";
import { tauriWindow } from "./window";
import { tauriSpellChecker } from "./spell";
import { createMemorySpellChecker } from "./memory-spell";

export const platformServices: PlatformServices = {
  files: tauriFileSystem,
  dialogs: tauriDialogs,
  settings: tauriSettings,
  recovery: createRecoveryStore(tauriLogger),
  logger: tauriLogger,
  logs: tauriLogs,
  opener: tauriOpener,
  updates: githubUpdates,
  window: tauriWindow,
  spell: tauriSpellChecker,
};

class MemoryFiles implements FileSystem {
  readonly data = new Map<string, Uint8Array>();
  async readFile(path: string) {
    const bytes = this.data.get(path);
    if (!bytes) throw new Error("File not found");
    return new Uint8Array(bytes);
  }
  async writeFile(path: string, bytes: Uint8Array) {
    this.data.set(path, new Uint8Array(bytes));
  }
  async writeFileAtomic(path: string, bytes: Uint8Array) {
    await this.writeFile(path, bytes);
  }
  async exists(path: string) {
    return this.data.has(path);
  }
  async stat(path: string) {
    return { mtime: null, size: this.data.get(path)?.byteLength ?? 0 };
  }
}
class MemorySettings implements SettingsRepository {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string, fallback: T) {
    return (this.data.get(key) as T | undefined) ?? fallback;
  }
  async set<T>(key: string, value: T) {
    this.data.set(key, value);
  }
  async remove(key: string) {
    this.data.delete(key);
  }
}

class MemoryRecovery implements RecoveryStore {
  readonly sessions = new Map<
    string,
    RecoverySessionSummary & {
      metadata: Book["metadata"];
      chapterOrder: string[];
      customCss: string | null;
      dictionary: string[];
    }
  >();
  readonly chapters = new Map<string, Map<string, string>>();
  readonly resources = new Map<string, Map<string, Resource>>();

  async list() {
    return [...this.sessions.values()].map(
      ({ bookId, originalPath, title, version, updatedAt }) => ({
        bookId,
        originalPath,
        title,
        version,
        updatedAt,
      }),
    );
  }
  async writeChanges(book: Book, delta: RecoveryDelta, originalPath?: string | null) {
    const old = this.sessions.get(book.metadata.id);
    this.sessions.set(book.metadata.id, {
      bookId: book.metadata.id,
      originalPath: originalPath ?? old?.originalPath ?? null,
      title: book.metadata.title,
      version: book.metadata.version,
      updatedAt: Date.now(),
      metadata: structuredClone(book.metadata),
      chapterOrder: book.chapters.map(({ id }) => id),
      customCss: book.customCss,
      dictionary: [...book.dictionary],
    });
    const chapters = this.chapters.get(book.metadata.id) ?? new Map<string, string>();
    const resources = this.resources.get(book.metadata.id) ?? new Map<string, Resource>();
    for (const id of delta.removedChapters) chapters.delete(id);
    for (const id of delta.changedChapters) {
      const chapter = book.chapters.find((item) => item.id === id);
      if (chapter) chapters.set(id, chapter.source);
    }
    for (const path of delta.removedResources) resources.delete(path);
    for (const path of delta.changedResources) {
      const resource = book.resources.get(path);
      if (resource)
        resources.set(path, {
          bytes: new Uint8Array(resource.bytes),
          mediaType: resource.mediaType,
        });
    }
    if (!old) {
      for (const chapter of book.chapters)
        if (!delta.changedChapters.has(chapter.id)) chapters.set(chapter.id, chapter.source);
      for (const [path, resource] of book.resources)
        if (!delta.changedResources.has(path))
          resources.set(path, {
            bytes: new Uint8Array(resource.bytes),
            mediaType: resource.mediaType,
          });
    }
    this.chapters.set(book.metadata.id, chapters);
    this.resources.set(book.metadata.id, resources);
  }
  async restore(bookId: string): Promise<RecoveredBook | null> {
    const session = this.sessions.get(bookId);
    if (!session) return null;
    const chapters = this.chapters.get(bookId);
    if (!chapters) return null;
    return {
      metadata: structuredClone(session.metadata),
      chapters: session.chapterOrder.map((id) => ({ id, source: chapters.get(id) ?? "" })),
      resources: new Map(
        [...(this.resources.get(bookId) ?? new Map()).entries()].map(([path, resource]) => [
          path,
          { bytes: new Uint8Array(resource.bytes), mediaType: resource.mediaType },
        ]),
      ),
      customCss: session.customCss,
      dictionary: [...session.dictionary],
      originalPath: session.originalPath,
    };
  }
  async remove(bookId: string) {
    this.sessions.delete(bookId);
    this.chapters.delete(bookId);
    this.resources.delete(bookId);
  }
}

export interface InMemoryPlatformOptions {
  dialogPaths?: { project?: string; epub?: string; azw3?: string };
  confirm?: boolean;
  spellWords?: string[];
  spellUnavailable?: boolean;
}

export interface InMemoryPlatformTestApi {
  files: Map<string, Uint8Array>;
  settings: Map<string, unknown>;
  cancelNextSave(): void;
}

export function createInMemoryPlatformServices(
  options: InMemoryPlatformOptions = {},
): PlatformServices & { test: InMemoryPlatformTestApi } {
  const files = new MemoryFiles();
  const settings = new MemorySettings();
  let cancelNextSave = false;
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const pendingOpenPaths: string[] = [];
  const openListeners = new Set<() => void>();
  const window: PlatformServices["window"] = {
    async listenOpenPaths(handler) {
      openListeners.add(handler);
      return () => {
        openListeners.delete(handler);
      };
    },
    async takePendingOpenPaths() {
      return pendingOpenPaths.splice(0);
    },
    async onCloseRequested() {
      return () => {};
    },
  };
  return {
    files,
    settings,
    dialogs: {
      async open() {
        return options.dialogPaths?.project ?? null;
      },
      async save(dialogOptions) {
        if (cancelNextSave) {
          cancelNextSave = false;
          return null;
        }
        const extensions = dialogOptions?.filters?.flatMap((filter) => filter.extensions) ?? [];
        if (extensions.includes("azw3")) return options.dialogPaths?.azw3 ?? null;
        if (extensions.includes("epub")) return options.dialogPaths?.epub ?? null;
        return options.dialogPaths?.project ?? null;
      },
      async confirm() {
        return options.confirm ?? false;
      },
      async message() {},
    },
    recovery: new MemoryRecovery(),
    logger,
    logs: { async openDirectory() {} },
    opener: { async reveal() {}, async open() {} },
    updates: noUpdates,
    window,
    spell: createMemorySpellChecker({
      known: options.spellWords,
      failLoad: options.spellUnavailable,
    }),
    test: {
      files: files.data,
      settings: settings.data,
      cancelNextSave() {
        cancelNextSave = true;
      },
    },
  };
}

let runtimeServices: PlatformServices | undefined;
export function setRuntimePlatformServices(services: PlatformServices): void {
  runtimeServices = services;
}
export function getRuntimePlatformServices(): PlatformServices {
  return runtimeServices ?? createInMemoryPlatformServices();
}

export * from "./recovery";
export * from "./image-processor";
