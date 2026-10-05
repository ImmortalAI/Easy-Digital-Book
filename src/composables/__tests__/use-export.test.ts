import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { createInMemoryPlatformServices } from "@/services/platform";
import { createExportController } from "@/composables/use-export";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import type { Book } from "@/types/book";
import type { ImageProcessor, PlatformServices } from "@/types/platform";
import type { Logger } from "@/types/platform";
import type { buildEpub } from "@/services/epub/build";
import type { ExportBuilder } from "@/services/export/types";

const makeBook = (): Book => ({
  ...createBook({
    locale: "en",
    now: new Date("2026-01-01T00:00:00Z"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  }),
  metadata: {
    ...createBook({
      locale: "en",
      now: new Date("2026-01-01T00:00:00Z"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    }).metadata,
    title: "Novel",
    version: "v1",
  },
});

const processor: ImageProcessor = {
  process: async ({ bytes, plan }) => ({
    bytes,
    mediaType: plan.format === "png" ? "image/png" : "image/jpeg",
    width: plan.width,
    height: plan.height,
  }),
  dispose: vi.fn<() => void>(),
};

function setup() {
  setActivePinia(createPinia());
  const services = createInMemoryPlatformServices();
  const project = useProjectStore();
  const settings = useSettingsStore();
  project.configure(services);
  settings.configure(services.settings);
  project.setBook(makeBook());
  return { services, project, settings };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("export controller", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("previews the sanitized EPUB filename with the selected version option", () => {
    const { services, project, settings } = setup();
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
    });

    expect(controller.fileName.value).toBe("Novel (v1).epub");
    controller.options.value.versionInTitle = false;
    expect(controller.fileName.value).toBe("Novel.epub");
  });

  it("does not write output when export is cancelled", async () => {
    const { services, project, settings } = setup();
    const writeAtomic = vi.spyOn(services.files, "writeFileAtomic");
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: vi.fn<typeof buildEpub>() },
    });
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      controller.exportEpub({ signal: aborted.signal, path: "/tmp/novel.epub" }),
    ).resolves.toBeNull();
    expect(writeAtomic).not.toHaveBeenCalled();
  });

  it("persists export choices and the output directory after success", async () => {
    const { services, project, settings } = setup();
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: vi.fn<typeof buildEpub>(async () => new Uint8Array([1, 2, 3])) },
    });
    const reveal = vi.spyOn(services.opener, "reveal");
    controller.options.value.imagePreset = "original";
    controller.options.value.grayscale = true;
    controller.options.value.titlePage = false;

    await controller.exportEpub({ path: "/exports/Novel.epub" });

    expect(reveal).not.toHaveBeenCalled();

    expect(await services.settings.get("export", {})).toMatchObject({
      imagePreset: "original",
      grayscale: true,
      titlePage: false,
      lastDir: "/exports",
    });
  });

  it("passes a localized EPUB filter name to the native save dialog", async () => {
    const { services, project, settings } = setup();
    vi.spyOn(services.dialogs, "save").mockResolvedValue("/exports/Novel.epub");
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: vi.fn<typeof buildEpub>(async () => new Uint8Array([1])) },
    });

    await controller.exportEpub({ dialogFilterName: "Livre EPUB" });

    expect(services.dialogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: "Livre EPUB", extensions: ["epub"] }] }),
    );
  });

  it("logs export failures without book source text", async () => {
    const { services, project, settings } = setup();
    const source = "SECRET BOOK SOURCE";
    project.book!.chapters[0]!.source = source;
    const logger = {
      debug: vi.fn<Logger["debug"]>(),
      info: vi.fn<Logger["info"]>(),
      warn: vi.fn<Logger["warn"]>(),
      error: vi.fn<Logger["error"]>(),
    } satisfies Logger;
    const controller = createExportController({
      services: { ...services, logger } as PlatformServices,
      project,
      settings,
      imageProcessor: processor,
      builders: {
        epub: vi.fn<typeof buildEpub>(async () => {
          throw new Error(source);
        }),
      },
    });

    await expect(controller.exportEpub({ path: "/exports/Novel.epub" })).rejects.toThrow(source);
    expect(logger.error).toHaveBeenCalled();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(source);
  });

  it("keeps the selected format, options, and book snapshot while the save dialog is open", async () => {
    const { services, project, settings } = setup();
    const dialog = deferred<string | null>();
    vi.spyOn(services.dialogs, "save").mockReturnValue(dialog.promise);
    const epubBuilder = vi.fn<ExportBuilder>(async () => new Uint8Array([1]));
    const azw3Builder = vi.fn<ExportBuilder>(async () => new Uint8Array([2]));
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: epubBuilder, azw3: azw3Builder },
    });
    controller.format.value = "epub";
    controller.options.value.grayscale = false;

    const exporting = controller.exportBook();
    await Promise.resolve();
    controller.format.value = "azw3";
    controller.options.value.grayscale = true;
    project.book!.metadata.title = "Changed";
    project.book!.chapters[0]!.source = "# Changed";
    dialog.resolve("/exports/Novel.epub");

    await expect(exporting).resolves.toBe("/exports/Novel.epub");
    expect(epubBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ title: "Novel" }) }),
      expect.objectContaining({ grayscale: false }),
      expect.objectContaining({ yieldControl: expect.any(Function) }),
    );
    expect(azw3Builder).not.toHaveBeenCalled();
  });

  it("selects a builder and save filter from the chosen format and retries after cancellation", async () => {
    const { services, project, settings } = setup();
    const epubBuilder = vi.fn<ExportBuilder>(async () => new Uint8Array([1]));
    const azw3Builder = vi.fn<ExportBuilder>(async () => new Uint8Array([2]));
    const writeAtomic = vi.spyOn(services.files, "writeFileAtomic");
    vi.spyOn(services.dialogs, "save")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("/exports/Novel.azw3");
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: epubBuilder, azw3: azw3Builder },
    });
    controller.format.value = "azw3";

    await expect(controller.exportBook()).resolves.toBeNull();
    expect(controller.exporting.value).toBe(false);
    controller.options.value.grayscale = true;
    await expect(controller.exportBook()).resolves.toBe("/exports/Novel.azw3");
    expect(services.dialogs.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(/Novel \(v1\)\.azw3$/),
        filters: [{ name: "AZW3 book", extensions: ["azw3"] }],
      }),
    );
    expect(azw3Builder).toHaveBeenCalledOnce();
    expect(azw3Builder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ grayscale: true }),
      expect.anything(),
    );
    expect(epubBuilder).not.toHaveBeenCalled();
    expect(writeAtomic).toHaveBeenCalledOnce();
    expect(await services.settings.get("export", {})).toMatchObject({
      format: "azw3",
      lastDir: "/exports",
    });
  });

  it("does not change the previous output when an atomic write fails", async () => {
    const { services, project, settings } = setup();
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: vi.fn<ExportBuilder>(async () => new Uint8Array([1])) },
    });
    await controller.exportBook({ path: "/exports/first.epub" });
    services.files.writeFileAtomic = async () => {
      throw new Error("disk full");
    };

    await expect(controller.exportBook({ path: "/exports/second.epub" })).rejects.toThrow(
      "disk full",
    );
    expect(controller.lastOutput.value).toBe("/exports/first.epub");
  });

  it("releases the export lock after a builder failure so a changed operation can retry", async () => {
    const { services, project, settings } = setup();
    const azw3Builder = vi
      .fn<ExportBuilder>()
      .mockRejectedValueOnce(new Error("conversion failed"))
      .mockResolvedValueOnce(new Uint8Array([2]));
    const epubBuilder = vi.fn<ExportBuilder>(async () => new Uint8Array([1]));
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: epubBuilder, azw3: azw3Builder },
    });
    controller.format.value = "azw3";

    await expect(controller.exportBook({ path: "/exports/failed.azw3" })).rejects.toThrow(
      "conversion failed",
    );
    expect(controller.exporting.value).toBe(false);
    expect(controller.lastOutput.value).toBeNull();
    controller.format.value = "epub";

    await expect(controller.exportBook({ path: "/exports/retry.epub" })).resolves.toBe(
      "/exports/retry.epub",
    );
    expect(epubBuilder).toHaveBeenCalledOnce();
    expect(azw3Builder).toHaveBeenCalledOnce();
    expect(controller.lastOutput.value).toBe("/exports/retry.epub");
  });

  it("does not atomically write when the signal aborts during building", async () => {
    const { services, project, settings } = setup();
    const aborted = new AbortController();
    const writeAtomic = vi.spyOn(services.files, "writeFileAtomic");
    const builder = vi.fn<ExportBuilder>(async () => {
      aborted.abort();
      return new Uint8Array([1]);
    });
    const controller = createExportController({
      services,
      project,
      settings,
      imageProcessor: processor,
      builders: { epub: builder },
    });

    await expect(
      controller.exportBook({ path: "/exports/cancelled.epub", signal: aborted.signal }),
    ).resolves.toBeNull();
    expect(writeAtomic).not.toHaveBeenCalled();
  });
});
