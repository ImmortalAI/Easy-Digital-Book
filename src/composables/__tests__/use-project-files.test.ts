import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { createInMemoryPlatformServices } from "@/services/platform";
import { writeEdb } from "@/services/edb/write";
import { readEdb } from "@/services/edb/read";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import type { WindowCloseEvent } from "@/types/platform";
import type { UnsavedAction, UnsavedDecision } from "@/composables/use-unsaved-guard";
import { createProjectFiles } from "../use-project-files";
import { buildAzw3 } from "@/services/azw3/build";
import { exportOptions, fixtureBook, fixtureProcessor } from "@/services/azw3/__tests__/fixtures";
import { makeZip } from "@/services/epub/zip";
import { writePalmDb } from "@/services/azw3/palmdb";
import { EMBEDDED_PROJECT_ENTRY } from "@/services/export/embedded-project";
import type { Book } from "@/types/book";
import { createAutosave } from "../use-autosave";

const makeBook = () =>
  createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("project files", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("names a never-saved untitled book after the file on first save", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: true });
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.saveAs("/books/My novel.edb")).resolves.toBe(true);

    expect(project.book?.metadata.title).toBe("My novel");
    const saved = await readEdb(await services.files.readFile("/books/My novel.edb"), {
      now: () => new Date("2026-01-03"),
    });
    expect(saved.book.metadata.title).toBe("My novel");
  });

  it("keeps a title the author typed, and never renames on later saves", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    const book = makeBook();
    project.setBook({ ...book, metadata: { ...book.metadata, title: "Saga" } }, null, {
      dirty: true,
    });
    const files = createProjectFiles({ services, locale: "en" });
    await files.saveAs("/books/draft.edb");
    expect(project.book?.metadata.title).toBe("Saga");

    project.setBook(makeBook(), "/books/old.edb", { dirty: false });
    await files.saveAs("/books/copy.edb");
    expect(project.book?.metadata.title).toBe("Untitled");
  });

  it("leaves the title alone when the save dialog is cancelled", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), null, { dirty: true });
    vi.spyOn(services.dialogs, "save").mockResolvedValue(null);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.saveAs()).resolves.toBe(false);
    expect(project.book?.metadata.title).toBe("Untitled");
  });

  it("reveals the saved project file", async () => {
    const services = createInMemoryPlatformServices();
    const project = useProjectStore();
    project.configure(services);
    project.setBook(makeBook(), "/books/saga.edb", { dirty: false });
    const reveal = vi.spyOn(services.opener, "reveal").mockResolvedValue(undefined);
    const files = createProjectFiles({ services, locale: "en" });

    await files.reveal();

    expect(reveal).toHaveBeenCalledWith("/books/saga.edb");
  });

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
    const roundTrip = await readEdb(saved, { now: () => new Date("2026-01-03") });
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
    const decide = vi.fn<(action: UnsavedAction) => Promise<UnsavedDecision>>(async () => "cancel");
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
    const decide = vi.fn<(action: UnsavedAction) => Promise<UnsavedDecision>>(
      async () => "discard",
    );
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

  it("deletes a recovery session and drops it from the start screen's list", async () => {
    const services = createInMemoryPlatformServices();
    const book = makeBook();
    await services.recovery.writeChanges(
      book,
      {
        changedChapters: new Set(["chapter1"]),
        removedChapters: new Set(),
        changedResources: new Set(),
        removedResources: new Set(),
      },
      null,
    );
    const files = createProjectFiles({ services });
    await files.refreshRecovery();
    expect(files.recoverySessions.value).toHaveLength(1);

    await files.deleteRecovery(book.metadata.id);

    expect(files.recoverySessions.value).toEqual([]);
    expect(await services.recovery.restore(book.metadata.id)).toBeNull();
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

describe("opening a project embedded in a book", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const edbOf = (book: Book) => writeEdb(book, new Date("2026-01-02"), { updateModified: false });
  const epubWith = (project: Uint8Array | null) => {
    const entries: Array<[string, string | Uint8Array]> = [["mimetype", "application/epub+zip"]];
    if (project) entries.push([EMBEDDED_PROJECT_ENTRY, project]);
    return makeZip(entries);
  };
  const everything = (book: Book) => ({
    changedChapters: new Set(book.chapters.map(({ id }) => id)),
    removedChapters: new Set<string>(),
    changedResources: new Set(book.resources.keys()),
    removedResources: new Set<string>(),
  });

  it("opens the project of an EPUB as an unsaved book that is not in Recent", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/novel.epub", await epubWith(await edbOf(makeBook())));
    const files = createProjectFiles({ services, locale: "en" });
    useLayoutStore().center = { kind: "metadata" };

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);

    const project = useProjectStore();
    expect(project.book?.chapters[0]?.source).toBe("# Chapter 1");
    expect(project.filePath).toBeNull();
    expect(project.fileMtime).toBeNull();
    expect(project.dirty).toBe(true);
    expect(await services.settings.get("recentFiles", [])).toEqual([]);
    expect(useDiagnosticsStore().readWarnings).toEqual([]);
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("opens the project of an AZW3", async () => {
    const services = createInMemoryPlatformServices();
    const book = fixtureBook();
    await services.files.writeFile(
      "/inbox/novel.azw3",
      await buildAzw3(
        book,
        { ...exportOptions(), embedProject: true },
        {
          imageProcessor: fixtureProcessor(),
          now: () => new Date("2026-01-08T03:04:05.000Z"),
        },
      ),
    );
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.azw3")).resolves.toBe(true);

    expect(useProjectStore().book?.metadata.id).toBe(book.metadata.id);
    expect(useProjectStore().filePath).toBeNull();
    expect(useProjectStore().dirty).toBe(true);
  });

  it("says so when the book has no project and keeps the current one", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/plain.epub", await epubWith(null));
    const project = useProjectStore();
    project.configure(services);
    const current = makeBook();
    project.setBook(current, "/books/current.edb", { dirty: false });
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/plain.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith(
      "This book does not contain a project file",
      "Open project",
    );
    expect(project.book?.metadata.id).toBe(current.metadata.id);
    expect(project.filePath).toBe("/books/current.edb");
  });

  it("reports a broken embedded project with the usual open error", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile(
      "/inbox/broken.epub",
      await epubWith(Uint8Array.from([1, 2, 3])),
    );
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/broken.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith("Could not open project", "Open project");
    expect(useProjectStore().book).toBeNull();
  });

  it("asks before discarding unsaved recovery work of the same book", async () => {
    const services = createInMemoryPlatformServices({ confirm: false });
    const original = makeBook();
    const edb = await edbOf(original);
    await services.files.writeFile("/inbox/novel.epub", await epubWith(edb));
    await services.recovery.writeChanges(original, everything(original), "/books/original.edb");
    const confirm = vi.spyOn(services.dialogs, "confirm");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(false);

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0]).toContain("discards them");
    expect(await services.recovery.list()).toEqual([
      expect.objectContaining({
        bookId: original.metadata.id,
        originalPath: "/books/original.edb",
      }),
    ]);
    expect(useProjectStore().book).toBeNull();
  });

  it("says a KindleGen book with its own sources has no project file", async () => {
    const services = createInMemoryPlatformServices();
    // KindleGen stores a zip of the book's sources in SRCS; it is not an .edb.
    const sources = await makeZip([["source.html", "<p>Text</p>"]]);
    const srcs = new Uint8Array(16 + sources.length);
    srcs.set([0x53, 0x52, 0x43, 0x53, 0, 0, 0, 0x10, 0, 0, 0, 0x2f, 0, 0, 0, 1]);
    srcs.set(sources, 16);
    const zero = new Uint8Array(280);
    const view = new DataView(zero.buffer);
    zero.set(new TextEncoder().encode("MOBI"), 16);
    view.setUint32(20, 264);
    view.setUint32(224, 1);
    view.setUint32(228, 1);
    await services.files.writeFile(
      "/inbox/kindlegen.azw3",
      writePalmDb([zero, srcs], "KindleGen", { created: new Date("2026-01-01T00:00:00Z") }),
    );
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/kindlegen.azw3")).resolves.toBe(false);

    expect(message).toHaveBeenCalledWith(
      "This book does not contain a project file",
      "Open project",
    );
  });

  it("drops a recovery session of the same book so the original file cannot be overwritten", async () => {
    const services = createInMemoryPlatformServices({ confirm: true });
    const original = makeBook();
    const edb = await edbOf(original);
    await services.files.writeFile("/books/original.edb", edb);
    await services.files.writeFile("/inbox/novel.epub", await epubWith(edb));
    await services.recovery.writeChanges(original, everything(original), "/books/original.edb");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);
    expect(await services.recovery.list()).toEqual([]);
    expect(files.recoverySessions.value).toEqual([]);

    // The next autosave must not inherit the original project's path.
    const autosave = createAutosave({ project: useProjectStore(), services });
    await autosave.persist();
    autosave.stop();
    expect(await services.recovery.list()).toEqual([
      expect.objectContaining({ bookId: original.metadata.id, originalPath: null }),
    ]);
  });

  it("detaches from the original file when the same book is open and dirty", async () => {
    const services = createInMemoryPlatformServices();
    const original = makeBook();
    const edb = await edbOf(original);
    await services.files.writeFile("/books/original.edb", edb);
    await services.files.writeFile("/inbox/novel.epub", await epubWith(edb));
    const project = useProjectStore();
    project.configure(services);
    project.setBook(original, "/books/original.edb", { dirty: true });
    await services.recovery.writeChanges(original, everything(original), "/books/original.edb");
    const files = createProjectFiles({
      services,
      locale: "en",
      requestDecision: async () => "discard",
    });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);

    expect(project.filePath).toBeNull();
    expect(await services.recovery.list()).toEqual([]);
    const saveDialog = vi.spyOn(services.dialogs, "save").mockResolvedValue(null);
    const write = vi.spyOn(services.files, "writeFileAtomic");
    await expect(files.save()).resolves.toBe(false);
    expect(saveDialog).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not open the book when the old recovery session cannot be removed", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/novel.epub", await epubWith(await edbOf(makeBook())));
    const project = useProjectStore();
    project.configure(services);
    const current = fixtureBook();
    project.setBook(current, "/books/current.edb", { dirty: false });
    vi.spyOn(services.recovery, "remove").mockRejectedValue(new Error("idb"));
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith("Could not open project", "Open project");
    expect(project.book?.metadata.id).toBe(current.metadata.id);
    expect(project.filePath).toBe("/books/current.edb");
  });

  it("decides by the bytes, not by the extension", async () => {
    const services = createInMemoryPlatformServices();
    const edb = await edbOf(makeBook());
    await services.files.writeFile("/inbox/renamed.edb", await epubWith(edb));
    await services.files.writeFile("/inbox/project.epub", edb);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/renamed.edb")).resolves.toBe(true);
    expect(useProjectStore().filePath).toBeNull();
    expect(await services.settings.get("recentFiles", [])).toEqual([]);

    await expect(files.openPath("/inbox/project.epub")).resolves.toBe(true);
    expect(useProjectStore().filePath).toBe("/inbox/project.epub");
    expect(useProjectStore().dirty).toBe(false);
  });

  it("offers project files and books in the Open dialog", async () => {
    const services = createInMemoryPlatformServices();
    const open = vi.spyOn(services.dialogs, "open").mockResolvedValue(null);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.open()).resolves.toBe(false);

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "Easy Digital Book", extensions: ["edb", "epub", "azw3"] }],
      }),
    );
  });
});
