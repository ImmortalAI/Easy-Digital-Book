import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { createInMemoryPlatformServices } from "@/services/platform";
import { writeEdb } from "@/services/edb/write";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import type { WindowCloseEvent } from "@/types/platform";
import { createProjectFiles } from "../use-project-files";

const makeBook = () =>
  createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("project files", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("creates a dirty untitled project", async () => {
    const services = createInMemoryPlatformServices();
    const files = createProjectFiles({
      services,
      locale: "en",
      now: () => new Date("2026-01-02"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter2",
    });

    await expect(files.newBook()).resolves.toBe(true);
    expect(useProjectStore().filePath).toBeNull();
    expect(useProjectStore().dirty).toBe(true);
    expect(useProjectStore().book?.chapters[0]?.source).toBe("# Chapter 1");
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter2" });
  });

  it("does not replace the current project after a fatal open error", async () => {
    const services = createInMemoryPlatformServices();
    const current = makeBook();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(current, null, { dirty: true });
    const message = vi.spyOn(services.dialogs, "message");
    services.files.readFile = async () => new Uint8Array([1, 2, 3]);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("broken.edb")).resolves.toBe(false);
    expect(project.book?.metadata.id).toBe(current.metadata.id);
    expect(project.book?.chapters[0]?.source).toBe(current.chapters[0]?.source);
    expect(message).toHaveBeenCalledOnce();
  });

  it("asks before overwriting a file whose mtime changed", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), "book.edb", { dirty: true, fileMtime: 100 });
    project.updateChapterSource("chapter1", "# Changed");
    services.files.stat = async () => ({ mtime: 200, size: 10 });
    const write = vi.spyOn(services.files, "writeFileAtomic");
    vi.spyOn(services.dialogs, "confirm").mockResolvedValue(false);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.save()).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(project.dirty).toBe(true);
  });

  it("keeps the original modified timestamp on a clean Save As", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    const original = makeBook();
    project.configure(services);
    project.setBook(original, "old.edb", { dirty: false, fileMtime: 100 });
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.saveAs("copy.edb")).resolves.toBe(true);
    const saved = await services.files.readFile("copy.edb");
    const roundTrip = await import("@/services/edb/read").then(({ readEdb }) =>
      readEdb(saved, { now: () => new Date("2026-01-03") }),
    );
    expect(roundTrip.book.metadata.modified).toBe(original.metadata.modified);
  });

  it("opens a valid project, records warnings, and adds it to recents", async () => {
    const services = createInMemoryPlatformServices();
    const source = makeBook();
    const bytes = await writeEdb(source, new Date("2026-01-02"));
    await services.files.writeFile("book.edb", bytes);
    services.files.stat = async () => ({ mtime: 300, size: bytes.byteLength });
    const files = createProjectFiles({ services, locale: "en" });
    useLayoutStore().center = { kind: "metadata" };

    await expect(files.openPath("book.edb")).resolves.toBe(true);
    expect(useProjectStore().filePath).toBe("book.edb");
    expect(useProjectStore().dirty).toBe(false);
    expect(await services.settings.get("recentFiles", [])).toEqual(["book.edb"]);
    expect(useDiagnosticsStore().readWarnings).toEqual([]);
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("drains native open paths after subscribing to the wakeup event", async () => {
    const services = createInMemoryPlatformServices();
    const source = makeBook();
    const bytes = await writeEdb(source, new Date("2026-01-02"));
    await services.files.writeFile("book.edb", bytes);
    services.window = {
      async listenOpenPaths() {
        return () => {};
      },
      async takePendingOpenPaths() {
        return ["book.edb"];
      },
      async onCloseRequested() {
        return () => {};
      },
    };
    const files = createProjectFiles({ services, locale: "en" });

    await files.startLifecycle();
    expect(useProjectStore().filePath).toBe("book.edb");
    await files.disposeLifecycle();
  });

  it("closes a saved project and returns to no project", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    const book = makeBook();
    project.setBook(book, "book.edb", { dirty: false });
    useDiagnosticsStore().setReadWarnings([{ code: "x", message: "stale" }] as never);
    const remove = vi.spyOn(services.recovery, "remove");
    const decide = vi.fn(async () => "cancel" as const);
    const files = createProjectFiles({ services, requestDecision: decide });

    await expect(files.close()).resolves.toBe(true);

    expect(decide).not.toHaveBeenCalled();
    expect(project.book).toBeNull();
    expect(project.filePath).toBeNull();
    expect(useDiagnosticsStore().read).toEqual([]);
    expect(remove).toHaveBeenCalledWith(book.metadata.id);
  });

  it("asks about unsaved changes before closing, and closes on Don't save", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: true });
    const decide = vi.fn(async () => "discard" as const);
    const files = createProjectFiles({ services, requestDecision: decide });

    await expect(files.close()).resolves.toBe(true);

    expect(decide).toHaveBeenCalledWith("close");
    expect(project.book).toBeNull();
  });

  it("keeps the project open when closing is cancelled", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    const book = makeBook();
    project.setBook(book, null, { dirty: true });
    const remove = vi.spyOn(services.recovery, "remove");
    const files = createProjectFiles({ services, requestDecision: async () => "cancel" });

    await expect(files.close()).resolves.toBe(false);

    expect(project.book?.metadata.id).toBe(book.metadata.id);
    expect(project.dirty).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("closes even when the recovery copy cannot be removed", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: false });
    services.recovery.remove = async () => {
      throw new Error("recovery unavailable");
    };
    const files = createProjectFiles({ services });

    await expect(files.close()).resolves.toBe(true);
    expect(project.book).toBeNull();
  });

  it("prevents native close when the unsaved guard is cancelled", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: true });
    let closeHandler: ((event: WindowCloseEvent) => void | Promise<void>) | undefined;
    services.window = {
      async listenOpenPaths() {
        return () => {};
      },
      async takePendingOpenPaths() {
        return [];
      },
      async onCloseRequested(handler) {
        closeHandler = handler;
        return () => {};
      },
    };
    const files = createProjectFiles({
      services,
      requestDecision: async () => "cancel",
    });
    await files.startLifecycle();
    const event = { preventDefault: vi.fn<() => void>() };
    await closeHandler?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await files.disposeLifecycle();
  });

  it("allows a confirmed close even when recovery cleanup fails", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: false });
    services.recovery.remove = async () => {
      throw new Error("recovery unavailable");
    };
    let closeHandler: ((event: WindowCloseEvent) => void | Promise<void>) | undefined;
    services.window = {
      async listenOpenPaths() {
        return () => {};
      },
      async takePendingOpenPaths() {
        return [];
      },
      async onCloseRequested(handler) {
        closeHandler = handler;
        return () => {};
      },
    };
    const files = createProjectFiles({ services });
    await files.startLifecycle();

    await expect(closeHandler?.({ preventDefault: vi.fn<() => void>() })).resolves.toBeUndefined();
    await files.disposeLifecycle();
  });

  it("restores the original file mtime when recovery has a file path", async () => {
    const services = createInMemoryPlatformServices();
    const original = makeBook();
    await services.recovery.writeChanges(
      original,
      {
        changedChapters: new Set(original.chapters.map((chapter) => chapter.id)),
        removedChapters: new Set(),
        changedResources: new Set(original.resources.keys()),
        removedResources: new Set(),
      },
      "book.edb",
    );
    services.files.stat = async () => ({ mtime: 123, size: 10 });
    const files = createProjectFiles({ services });
    useLayoutStore().center = { kind: "css" };

    await expect(files.restoreRecovery(original.metadata.id)).resolves.toBe(true);
    expect(useProjectStore().filePath).toBe("book.edb");
    expect(useProjectStore().fileMtime).toBe(123);
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("removes a recent entry when opening it proves that the file is missing", async () => {
    const services = createInMemoryPlatformServices();
    await services.settings.set("recentFiles", ["missing.edb"]);
    services.files.readFile = async () => {
      throw new Error("File not found");
    };
    services.files.exists = async () => false;
    const files = createProjectFiles({ services });

    await expect(files.openPath("missing.edb")).resolves.toBe(false);
    expect(await services.settings.get("recentFiles", [])).toEqual([]);
  });

  it("runs the unsaved guard before opening the native project picker", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: true });
    const open = vi.spyOn(services.dialogs, "open");
    const files = createProjectFiles({ services, requestDecision: async () => "cancel" });

    await expect(files.open()).resolves.toBe(false);

    expect(open).not.toHaveBeenCalled();
  });

  it("reports an unreadable picked image instead of crashing the app", async () => {
    const services = createInMemoryPlatformServices();
    services.dialogs.open = async () => "/images/pic.png";
    services.files.readFile = async () => {
      throw new Error("EACCES");
    };
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    // pickImage is awaited from fire-and-forget click handlers, so a rejection
    // here reaches window.onunhandledrejection and the crash dialog.
    await expect(files.pickImage()).resolves.toBeNull();
    expect(message).toHaveBeenCalledOnce();
  });
});
