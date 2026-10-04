import type { ExportProgress } from "@/services/export/types";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { checkBook } from "@/services/checks/book-checks";
import { buildEpub, type BuildEpubDependencies, type ExportOptions } from "@/services/epub/build";
import { makeEpubFileName } from "@/services/epub/file-name";
import { BrowserImageProcessor } from "@/services/platform/image-processor";
import { snapshotBook, type useProjectStore } from "@/stores/project";
import type { useSettingsStore } from "@/stores/settings";
import { AppError, appErrorFromUnknown } from "@/types/errors";
import type { ImageProcessor, PlatformServices } from "@/types/platform";

export type { ExportProgress } from "@/services/export/types";
export interface ExportRequest {
  path?: string;
  signal?: AbortSignal;
  dialogTitle?: string;
  dialogFilterName?: string;
}
export interface ExportControllerOptions {
  services: PlatformServices;
  project: ReturnType<typeof useProjectStore>;
  settings: ReturnType<typeof useSettingsStore>;
  imageProcessor?: ImageProcessor;
  now?: () => Date;
  build?: typeof buildEpub;
}
export interface ExportController {
  options: Ref<ExportOptions>;
  fileName: ComputedRef<string>;
  warnings: ComputedRef<ReturnType<typeof checkBook>>;
  progress: Ref<ExportProgress | null>;
  exporting: Ref<boolean>;
  error: Ref<AppError | null>;
  lastOutput: Ref<string | null>;
  exportEpub(request?: ExportRequest): Promise<string | null>;
  revealOutput(): Promise<void>;
}

const directoryOf = (path: string): string => {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash < 0 ? "" : path.slice(0, slash) || path.slice(0, 1);
};
const joinPath = (directory: string, fileName: string): string =>
  directory
    ? `${directory.replace(/[\\/]$/, "")}${directory.includes("\\") ? "\\" : "/"}${fileName}`
    : fileName;
const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
};

export function createExportController(options: ExportControllerOptions): ExportController {
  const { services, project, settings } = options;
  const exportOptions = ref<ExportOptions>({
    imagePreset: settings.exportSettings.imagePreset,
    grayscale: settings.exportSettings.grayscale,
    titlePage: settings.exportSettings.titlePage,
    versionInTitle: settings.exportSettings.versionInTitle,
  });
  const progress = ref<ExportProgress | null>(null);
  const exporting = ref(false);
  const error = ref<AppError | null>(null);
  const lastOutput = ref<string | null>(null);
  watch(
    () => settings.exportSettings,
    (value) => {
      if (!exporting.value) {
        Object.assign(exportOptions.value, {
          imagePreset: value.imagePreset,
          grayscale: value.grayscale,
          titlePage: value.titlePage,
          versionInTitle: value.versionInTitle,
        });
      }
    },
    { deep: true },
  );
  const fileName = computed(() =>
    project.book
      ? makeEpubFileName(project.book.metadata, exportOptions.value.versionInTitle)
      : "book.epub",
  );
  const warnings = computed(() => (project.book ? checkBook(snapshotBook(project.book)) : []));

  async function exportEpub(request: ExportRequest = {}): Promise<string | null> {
    if (!project.book) throw new AppError("export.noProject", "No project is open");
    if (request.signal?.aborted) return null;
    if (exporting.value) return null;
    exporting.value = true;
    error.value = null;
    progress.value = null;
    let processor = options.imageProcessor;
    let ownedProcessor = false;
    try {
      const target =
        request.path ??
        (await services.dialogs.save({
          title: request.dialogTitle ?? "Export EPUB",
          defaultPath: joinPath(settings.exportSettings.lastDir ?? "", fileName.value),
          filters: [{ name: request.dialogFilterName ?? "EPUB", extensions: ["epub"] }],
        }));
      if (!target) return null;
      checkCancelled(request.signal);
      const snapshot = snapshotBook(project.book);
      if (!processor) {
        processor = new BrowserImageProcessor();
        ownedProcessor = true;
      }
      const buildDeps: BuildEpubDependencies = {
        imageProcessor: processor,
        now: options.now ?? (() => new Date()),
        signal: request.signal,
        onProgress: (value) => {
          progress.value = value;
        },
      };
      const bytes = await (options.build ?? buildEpub)(snapshot, exportOptions.value, buildDeps);
      checkCancelled(request.signal);
      await services.files.writeFileAtomic(target, bytes);
      lastOutput.value = target;
      const nextSettings = {
        ...settings.exportSettings,
        ...exportOptions.value,
        lastDir: directoryOf(target),
      };
      settings.exportSettings = nextSettings;
      await settings.persist();
      return target;
    } catch (cause) {
      const cancelled = cause instanceof AppError && cause.code === "export.cancelled";
      if (cancelled || (cause instanceof DOMException && cause.name === "AbortError")) {
        error.value = null;
        return null;
      }
      const appError = appErrorFromUnknown(cause, "export.failed");
      error.value = appError;
      services.logger.error("EPUB export failed", { code: appError.code, name: appError.name });
      throw appError;
    } finally {
      if (ownedProcessor) processor?.dispose();
      exporting.value = false;
    }
  }

  async function revealOutput(): Promise<void> {
    if (!lastOutput.value) return;
    try {
      await services.opener.reveal(lastOutput.value);
    } catch (revealError) {
      services.logger.warn("EPUB exported but could not reveal output", {
        code: appErrorFromUnknown(revealError, "platform.opener").code,
      });
    }
  }

  return {
    options: exportOptions,
    fileName,
    warnings,
    progress,
    exporting,
    error,
    lastOutput,
    exportEpub,
    revealOutput,
  };
}
