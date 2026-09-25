import { inject, ref, type InjectionKey, type Ref } from "vue";
import { createBook } from "@/services/book/create";
import { readEdb } from "@/services/edb/read";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { getRuntimePlatformServices } from "@/services/platform";
import type { PlatformServices, RecoverySessionSummary, Unlisten } from "@/types/platform";
import type { Book } from "@/types/book";
import type { ImageFile } from "./use-image-import";
import { createErrorActions, type ErrorActions } from "./use-error-actions";
import { createExportController, type ExportController } from "./use-export";
import { createSettingsActions, type SettingsActions } from "./use-settings-actions";
import {
  createUnsavedGuard,
  useUnsavedGuard,
  type UnsavedAction,
  type UnsavedDecision,
  type UnsavedGuard,
  type UnsavedPrompt,
} from "./use-unsaved-guard";
import { useSafeI18n } from "./use-safe-i18n";

export interface ProjectFilesOptions {
  services: PlatformServices;
  locale?: string;
  now?: () => Date;
  newUuid?: () => string;
  newChapterId?: () => string;
  requestDecision?: (action: UnsavedAction) => Promise<UnsavedDecision>;
}

export interface ProjectFilesController {
  services: PlatformServices;
  project: ReturnType<typeof useProjectStore>;
  settings: ReturnType<typeof useSettingsStore>;
  settingsActions: SettingsActions;
  errorActions: ErrorActions;
  exportController: ExportController;
  recoverySessions: Ref<RecoverySessionSummary[]>;
  prompt: UnsavedPrompt | null;
  guard: UnsavedGuard;
  initialize(): Promise<void>;
  refreshRecovery(): Promise<void>;
  newBook(): Promise<boolean>;
  open(): Promise<boolean>;
  openPath(path: string): Promise<boolean>;
  restoreRecovery(bookId: string): Promise<boolean>;
  save(): Promise<boolean>;
  saveAs(path?: string): Promise<boolean>;
  /** Closes the project (after the unsaved-changes check) and returns to the start screen. */
  close(): Promise<boolean>;
  /** Throws away a recovery session listed on the start screen. */
  deleteRecovery(bookId: string): Promise<void>;
  startLifecycle(): Promise<void>;
  disposeLifecycle(): Promise<void>;
  pickImage(): Promise<ImageFile | null>;
}

export const projectFilesKey: InjectionKey<ProjectFilesController> = Symbol("project-files");

function localeForBook(locale: string): "ru" | "en" | "zh-CN" {
  if (locale === "ru" || locale.startsWith("ru-")) return "ru";
  if (locale === "zh-CN" || locale.startsWith("zh-")) return "zh-CN";
  return "en";
}

function defaultUuid(): string {
  return crypto.randomUUID();
}

function defaultChapterId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => (byte % 36).toString(36)).join("");
}

function projectFileName(title: string, fallback: string): string {
  const printable = [...title].filter((character) => character.charCodeAt(0) >= 32).join("");
  const safe = printable
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ");
  return `${safe || fallback}.edb`;
}

function selectFirstChapter(book: Book, layout: ReturnType<typeof useLayoutStore>): void {
  const firstChapter = book.chapters[0];
  if (firstChapter) layout.center = { kind: "chapter", id: firstChapter.id };
}

export function createProjectFiles(options: ProjectFilesOptions): ProjectFilesController {
  const services = options.services;
  const project = useProjectStore();
  const settings = useSettingsStore();
  const layout = useLayoutStore();
  const diagnostics = useDiagnosticsStore();
  const { t } = useSafeI18n();
  const recoverySessions = ref<RecoverySessionSummary[]>([]);
  const now = options.now ?? (() => new Date());
  const detectedLocale = typeof navigator === "undefined" ? "en" : navigator.language;
  const locale = localeForBook(options.locale ?? detectedLocale);
  let lifecycleStarted = false;
  let cleanup: Unlisten[] = [];
  let openQueue = Promise.resolve();

  project.configure(services, t);
  settings.configure(services.settings);
  layout.configure(services.settings);
  const settingsActions = createSettingsActions({ services, settings });
  const errorActions = createErrorActions(services);
  const exportController = createExportController({ services, project, settings });

  let save!: () => Promise<boolean>;
  const guard = createUnsavedGuard({
    isDirty: () => project.dirty,
    save: () => save(),
    requestDecision: options.requestDecision ?? (async () => "discard"),
  });

  async function refreshRecovery(): Promise<void> {
    try {
      recoverySessions.value = await services.recovery.list();
    } catch (error) {
      services.logger.warn("Could not list recovery sessions", { error });
      recoverySessions.value = [];
    }
  }

  async function initialize(): Promise<void> {
    await Promise.all([settings.load(), layout.load()]);
    for (const path of [...settings.recentFiles]) {
      try {
        if (!(await services.files.exists(path))) {
          await settings.removeRecent(path);
          await services.dialogs.message(
            t("files.fileNotFound", "File not found: {path}", { path }).replace("{path}", path),
            t("files.recentTitle", "Recent file"),
          );
        }
      } catch (error) {
        services.logger.warn("Could not validate recent file", { error });
      }
    }
    await refreshRecovery();
  }

  async function newBook(): Promise<boolean> {
    if (!(await guard.guard("new"))) return false;
    const previousId = project.book?.metadata.id;
    const book = createBook({
      locale,
      now: now(),
      newUuid: options.newUuid ?? defaultUuid,
      newChapterId: options.newChapterId ?? defaultChapterId,
    });
    project.setBook(book, null, { dirty: true });
    selectFirstChapter(book, layout);
    diagnostics.clear();
    if (previousId) await services.recovery.remove(previousId);
    await refreshRecovery();
    return true;
  }

  async function openPathAfterGuard(path: string): Promise<boolean> {
    const previousId = project.book?.metadata.id;
    let bytes: Uint8Array;
    try {
      bytes = await services.files.readFile(path);
    } catch (error) {
      try {
        if (!(await services.files.exists(path))) await settings.removeRecent(path);
      } catch (existsError) {
        services.logger.warn("Could not validate missing project", { error: existsError });
      }
      services.logger.error("Failed to read project", { error });
      await services.dialogs.message(
        t("files.openFailed", "Could not open project"),
        t("files.openTitle", "Open project"),
      );
      return false;
    }

    let result;
    try {
      result = await readEdb(bytes, { now });
    } catch (error) {
      services.logger.error("Failed to decode project", { error });
      await services.dialogs.message(
        t("files.openFailed", "Could not open project"),
        t("files.openTitle", "Open project"),
      );
      return false;
    }

    let fileMtime: number | null = null;
    try {
      fileMtime = (await services.files.stat(path)).mtime;
    } catch (error) {
      services.logger.warn("Could not stat opened project", { error });
    }

    let matchingRecovery: RecoverySessionSummary | undefined;
    try {
      matchingRecovery = (await services.recovery.list()).find(
        (session) => session.originalPath === path && session.updatedAt > (fileMtime ?? 0),
      );
    } catch (error) {
      services.logger.warn("Could not inspect recovery session", { error });
    }
    let recovered = null;
    if (matchingRecovery) {
      const restore = await services.dialogs.confirm(
        t("files.recoverMessage", "A newer recovery session is available. Restore it?"),
        t("files.recoverTitle", "Recover project"),
      );
      if (restore) recovered = await services.recovery.restore(matchingRecovery.bookId);
      if (!recovered) await services.recovery.remove(matchingRecovery.bookId);
    }

    const nextBook = recovered ?? result.book;
    project.setBook(nextBook, path, {
      dirty: Boolean(recovered || result.migrated),
      fileMtime,
    });
    selectFirstChapter(nextBook, layout);
    diagnostics.clear();
    diagnostics.setReadWarnings(result.warnings);
    try {
      await settings.addRecent(path);
    } catch (error) {
      services.logger.warn("Could not update recent files", { error });
    }
    if (previousId && previousId !== nextBook.metadata.id)
      await services.recovery.remove(previousId);
    await refreshRecovery();
    return true;
  }

  async function open(): Promise<boolean> {
    if (!(await guard.guard("open"))) return false;
    const path = await services.dialogs.open({
      title: t("files.openTitle", "Open project"),
      filters: [{ name: t("files.openFilter", "Easy Digital Book"), extensions: ["edb"] }],
    });
    return path ? openPathAfterGuard(path) : false;
  }

  async function openPath(path: string): Promise<boolean> {
    if (!(await guard.guard("open"))) return false;
    return openPathAfterGuard(path);
  }

  async function pickImage(): Promise<ImageFile | null> {
    const path = await services.dialogs.open({
      title: t("files.importImage", "Import image"),
      filters: [
        {
          name: t("files.imageFilter", "Images"),
          extensions: ["png", "jpg", "jpeg", "gif", "webp"],
        },
      ],
    });
    if (!path) return null;
    try {
      return {
        name: path.split(/[\\/]/).pop() ?? t("files.imageFallback", "image"),
        bytes: await services.files.readFile(path),
      };
    } catch (error) {
      // Callers are fire-and-forget click handlers, so an unguarded rejection
      // would surface as the global "unexpected error" dialog.
      services.logger.error("Could not read the picked image", { error });
      await services.dialogs.message(
        t("files.imageReadFailed", "Could not read the image"),
        t("files.importImage", "Import image"),
      );
      return null;
    }
  }

  save = async () => {
    if (!project.book) return false;
    if (!project.filePath) return saveAs();
    return project.save(project.filePath);
  };

  async function saveAs(path?: string): Promise<boolean> {
    const target =
      path ??
      (await services.dialogs.save({
        title: t("files.saveTitle", "Save project"),
        defaultPath: projectFileName(
          project.book?.metadata.title ?? t("files.untitled", "Untitled"),
          t("files.untitled", "Untitled"),
        ),
        filters: [{ name: t("files.openFilter", "Easy Digital Book"), extensions: ["edb"] }],
      }));
    return target ? project.save(target) : false;
  }

  async function deleteRecovery(bookId: string): Promise<void> {
    try {
      await services.recovery.remove(bookId);
    } catch (error) {
      services.logger.warn("Could not delete recovery session", { error });
    }
    await refreshRecovery();
  }

  async function restoreRecovery(bookId: string): Promise<boolean> {
    if (!(await guard.guard("open"))) return false;
    const recovered = await services.recovery.restore(bookId);
    if (!recovered) {
      await refreshRecovery();
      return false;
    }
    let fileMtime: number | null = null;
    if (recovered.originalPath) {
      try {
        fileMtime = (await services.files.stat(recovered.originalPath)).mtime;
      } catch (error) {
        services.logger.warn("Could not stat recovered project", { error });
      }
    }
    project.setBook(recovered, recovered.originalPath, { dirty: true, fileMtime });
    selectFirstChapter(recovered, layout);
    diagnostics.clear();
    await refreshRecovery();
    return true;
  }

  async function drainOpenPaths(): Promise<void> {
    const paths = await services.window.takePendingOpenPaths();
    for (const path of paths) {
      if (!path.toLowerCase().endsWith(".edb")) continue;
      openQueue = openQueue.then(async () => {
        await openPath(path);
      });
    }
    await openQueue;
  }

  /** Stops autosave for the open book and removes its recovery session. */
  async function discardRecovery(): Promise<void> {
    if (!project.book) return;
    project.invalidateRecovery();
    try {
      await services.recovery.remove(project.book.metadata.id);
    } catch (error) {
      services.logger.warn("Could not remove recovery session on close", { error });
    }
  }

  async function close(): Promise<boolean> {
    if (!(await guard.guard("close"))) return false;
    await discardRecovery();
    project.reset();
    diagnostics.clear();
    await refreshRecovery();
    return true;
  }

  async function startLifecycle(): Promise<void> {
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    const unlistenOpen = await services.window.listenOpenPaths(() => {
      void drainOpenPaths();
    });
    const unlistenClose = await services.window.onCloseRequested(async (event) => {
      if (!(await guard.guard("close"))) {
        event.preventDefault();
        return;
      }
      await discardRecovery();
    });
    cleanup = [unlistenOpen, unlistenClose];
    await drainOpenPaths();
  }

  async function disposeLifecycle(): Promise<void> {
    lifecycleStarted = false;
    const listeners = cleanup;
    cleanup = [];
    await Promise.all(listeners.map((unlisten) => unlisten()));
  }

  return {
    services,
    project,
    settings,
    settingsActions,
    errorActions,
    exportController,
    recoverySessions,
    prompt: null,
    guard,
    initialize,
    refreshRecovery,
    newBook,
    open,
    openPath,
    restoreRecovery,
    deleteRecovery,
    save,
    saveAs,
    close,
    pickImage,
    startLifecycle,
    disposeLifecycle,
  };
}

export function useProjectFiles(
  options: Partial<ProjectFilesOptions> = {},
): ProjectFilesController {
  const prompt = useUnsavedGuard();
  const controller = createProjectFiles({
    services: options.services ?? getRuntimePlatformServices(),
    locale: options.locale,
    now: options.now,
    newUuid: options.newUuid,
    newChapterId: options.newChapterId,
    requestDecision: prompt.requestDecision,
  });
  return { ...controller, prompt };
}

export function injectProjectFiles(): ProjectFilesController {
  return inject(projectFilesKey) ?? useProjectFiles();
}
