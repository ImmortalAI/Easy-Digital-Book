import type { ExportProgress } from "@/services/export/types";
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { checkBook } from "@/services/checks/book-checks";
import { buildAzw3 } from "@/services/azw3/build";
import { buildEpub } from "@/services/epub/build";
import { makeExportFileName } from "@/services/export/file-name";
import type {
  BuildDependencies,
  ExportBuilder,
  ExportFormat,
  ExportOptions,
} from "@/services/export/types";
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
  builders?: Partial<Record<ExportFormat, ExportBuilder>>;
}
export interface ExportController {
  options: Ref<ExportOptions>;
  format: Ref<ExportFormat>;
  fileName: ComputedRef<string>;
  warnings: ComputedRef<ReturnType<typeof checkBook>>;
  progress: Ref<ExportProgress | null>;
  exporting: Ref<boolean>;
  error: Ref<AppError | null>;
  lastOutput: Ref<string | null>;
  exportBook(request?: ExportRequest): Promise<string | null>;
  /** Temporary compatibility alias for the export dialog, migrated in Task 9. */
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
  const format = ref<ExportFormat>(settings.exportSettings.format);
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
        format.value = value.format;
      }
    },
    { deep: true },
  );
  const fileName = computed(() =>
    project.book
      ? makeExportFileName(project.book.metadata, exportOptions.value.versionInTitle, format.value)
      : `book.${format.value}`,
  );
  const warnings = computed(() => (project.book ? checkBook(snapshotBook(project.book)) : []));

  async function exportBook(request: ExportRequest = {}): Promise<string | null> {
    if (!project.book) throw new AppError("export.noProject", "No project is open");
    if (request.signal?.aborted) return null;
    if (exporting.value) return null;
    exporting.value = true;
    error.value = null;
    progress.value = null;
    let processor = options.imageProcessor;
    let ownedProcessor = false;
    try {
      const selectedFormat = format.value;
      const selectedOptions = { ...exportOptions.value };
      const snapshot = snapshotBook(project.book);
      const defaultFileName = makeExportFileName(
        snapshot.metadata,
        selectedOptions.versionInTitle,
        selectedFormat,
      );
      const target =
        request.path ??
        (await services.dialogs.save({
          title: request.dialogTitle ?? `Export ${selectedFormat.toUpperCase()}`,
          defaultPath: joinPath(settings.exportSettings.lastDir ?? "", defaultFileName),
          filters: [
            {
              name: request.dialogFilterName ?? `${selectedFormat.toUpperCase()} book`,
              extensions: [selectedFormat],
            },
          ],
        }));
      if (!target) return null;
      checkCancelled(request.signal);
      if (!processor) {
        processor = new BrowserImageProcessor();
        ownedProcessor = true;
      }
      const buildDeps: BuildDependencies = {
        imageProcessor: processor,
        now: options.now ?? (() => new Date()),
        signal: request.signal,
        onProgress: (value) => {
          progress.value = value;
        },
        yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
      };
      const builder =
        options.builders?.[selectedFormat] ?? (selectedFormat === "epub" ? buildEpub : buildAzw3);
      const bytes = await builder(snapshot, selectedOptions, buildDeps);
      checkCancelled(request.signal);
      await services.files.writeFileAtomic(target, bytes);
      lastOutput.value = target;
      const nextSettings = {
        ...settings.exportSettings,
        ...selectedOptions,
        format: selectedFormat,
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
      services.logger.error("Book export failed", { code: appError.code, name: appError.name });
      throw appError;
    } finally {
      if (ownedProcessor) processor?.dispose();
      exporting.value = false;
    }
  }

  const exportEpub = exportBook;

  async function revealOutput(): Promise<void> {
    if (!lastOutput.value) return;
    try {
      await services.opener.reveal(lastOutput.value);
    } catch (revealError) {
      services.logger.warn("Exported book could not reveal output", {
        code: appErrorFromUnknown(revealError, "platform.opener").code,
      });
    }
  }

  return {
    options: exportOptions,
    format,
    fileName,
    warnings,
    progress,
    exporting,
    error,
    lastOutput,
    exportBook,
    exportEpub,
    revealOutput,
  };
}
