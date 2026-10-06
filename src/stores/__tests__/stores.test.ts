import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { addChapter } from "@/services/book/chapters";
import { createInMemoryPlatformServices } from "@/services/platform";
import { useProjectStore } from "@/stores/project";
import { useNotificationsStore } from "@/stores/notifications";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const book = () =>
  createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("application stores", () => {
  it("remembers the preview look across loads", async () => {
    const services = createInMemoryPlatformServices();
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    settings.configure(services.settings);
    await settings.load();
    expect(settings.preview).toEqual({ paperStyle: true, dimImages: true });

    await settings.setPreview({ paperStyle: false });

    setActivePinia(createPinia());
    const reloaded = useSettingsStore();
    reloaded.configure(services.settings);
    await reloaded.load();
    expect(reloaded.preview).toEqual({ paperStyle: false, dimImages: true });
  });

  it("loads spelling settings with defaults and persists patches", async () => {
    const repository = createInMemoryPlatformServices().settings;
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    settings.configure(repository);
    await settings.load();
    expect(settings.spelling).toEqual({ enabled: true, languages: { ru: true, en: true } });
    await settings.setSpelling({ languages: { en: false } });
    expect(settings.spelling).toEqual({ enabled: true, languages: { ru: true, en: false } });
    expect(await repository.get("spelling", null)).toEqual(settings.spelling);
  });

  it("tracks revision and recovery deltas for mutations", () => {
    setActivePinia(createPinia());
    const project = useProjectStore();
    project.configure(createInMemoryPlatformServices());
    project.setBook(book());
    const result = addChapter(project.book!, { newId: () => "chapter2" });
    project.applyMutation(result);
    expect(project.dirty).toBe(true);
    expect(project.revision).toBe(1);
    expect(project.recoveryDelta.changedChapters).toContain("chapter2");
  });

  it("updates one chapter source through the normal mutation delta", () => {
    setActivePinia(createPinia());
    const project = useProjectStore();
    project.setBook(book());

    project.updateChapterSource("chapter1", "# Changed");

    expect(project.book?.chapters[0]?.source).toBe("# Changed");
    expect(project.revision).toBe(1);
    expect(project.recoveryDelta.changedChapters).toContain("chapter1");
  });

  it("keeps notifications until removed; the toast stack owns the three-toast limit", () => {
    setActivePinia(createPinia());
    const notifications = useNotificationsStore();
    const ids = ["one", "two", "three", "four"].map((message) => notifications.add({ message }));
    expect(notifications.items.map((item) => item.message)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    notifications.remove(ids[0]!);
    expect(notifications.items.map((item) => item.message)).toEqual(["two", "three", "four"]);
  });

  it("persists layout settings", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const layout = useLayoutStore();
    layout.configure(services.settings);
    layout.setSidebarVisible(false);
    await layout.persist();
    expect(await services.settings.get("layout", null)).toMatchObject({ sidebarVisible: false });
  });

  it("keeps late edits dirty when a save was already started", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const originalWrite = services.files.writeFile.bind(services.files);
    services.files.writeFile = async (...args) => {
      await blocked;
      return originalWrite(...args);
    };
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "book.edb");
    project.applyMutation(addChapter(project.book!, { newId: () => "chapter2" }));
    const saving = project.save();
    await Promise.resolve();
    project.applyMutation(addChapter(project.book!, { newId: () => "chapter3" }));
    release();
    expect(await saving).toBe(true);
    expect(project.savedRevision).toBe(1);
    expect(project.revision).toBe(2);
    expect(project.dirty).toBe(true);
  });

  it("locks before checking mtime so a second save cannot race the first", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const mtime = deferred<{ mtime: number | null; size: number }>();
    const stat = vi.fn<() => Promise<{ mtime: number | null; size: number }>>(() => mtime.promise);
    services.files.stat = stat;
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "book.edb", { dirty: true, fileMtime: 1 });

    const first = project.save();
    const second = project.save();
    await Promise.resolve();
    expect(stat).toHaveBeenCalledTimes(1);

    mtime.resolve({ mtime: 1, size: 0 });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });

  it("does not apply an old save result after the project changes", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const writeStarted = deferred();
    const releaseWrite = deferred();
    services.files.writeFileAtomic = async () => {
      writeStarted.resolve();
      await releaseWrite.promise;
    };
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "old.edb", { dirty: true });

    const saving = project.save();
    await writeStarted.promise;
    const replacement = book();
    replacement.metadata.id = "550e8400-e29b-41d4-a716-446655440001";
    replacement.metadata.modified = "2026-02-01T00:00:00.000Z";
    project.setBook(replacement, null, { dirty: true });
    releaseWrite.resolve();

    await expect(saving).resolves.toBe(true);
    expect(project.book?.metadata.id).toBe(replacement.metadata.id);
    expect(project.filePath).toBeNull();
    expect(project.savedRevision).toBe(0);
    expect(project.dirty).toBe(true);
    expect(project.book?.metadata.modified).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not apply a post-write mtime to a replacement project", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const statStarted = deferred();
    const mtime = deferred<{ mtime: number | null; size: number }>();
    services.files.stat = async () => {
      statStarted.resolve();
      return mtime.promise;
    };
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "old.edb", { dirty: true });

    const saving = project.save();
    await statStarted.promise;
    const replacement = book();
    replacement.metadata.id = "550e8400-e29b-41d4-a716-446655440001";
    project.setBook(replacement, null, { dirty: true });
    mtime.resolve({ mtime: 123, size: 10 });

    await expect(saving).resolves.toBe(true);
    expect(project.fileMtime).toBeNull();
  });

  it("shows a save error without clearing dirty state", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    services.files.writeFileAtomic = async () => {
      throw new Error("disk full");
    };
    const message = vi.spyOn(services.dialogs, "message");
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "book.edb", { dirty: true });

    await expect(project.save()).resolves.toBe(false);
    expect(project.dirty).toBe(true);
    expect(message).toHaveBeenCalledWith("Could not save project", "Save project");
  });

  it("uses atomic file writes and isolates recovery cleanup failures", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    let atomicCalls = 0;
    services.files.writeFileAtomic = async (path, bytes) => {
      atomicCalls++;
      await services.files.writeFile(path, bytes);
    };
    services.recovery.remove = async () => {
      throw new Error("recovery unavailable");
    };
    const project = useProjectStore();
    project.configure(services);
    project.setBook(book(), "book.edb");
    project.applyMutation(addChapter(project.book!, { newId: () => "chapter2" }));
    expect(await project.save()).toBe(true);
    expect(atomicCalls).toBe(1);
    expect(project.dirty).toBe(false);
  });

  it("persists complete export settings with approved defaults", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const settings = useSettingsStore();
    settings.configure(services.settings);
    await settings.load();
    expect(settings.exportSettings).toEqual({
      imagePreset: "kindle-paperwhite",
      grayscale: false,
      titlePage: true,
      versionInTitle: true,
      format: "epub",
      lastDir: null,
    });
    settings.exportSettings.imagePreset = "original";
    settings.exportSettings.lastDir = "/tmp";
    await settings.persist();
    expect(await services.settings.get("export", null)).toMatchObject({
      imagePreset: "original",
      lastDir: "/tmp",
      format: "epub",
    });
  });

  it("defaults missing and invalid export formats to EPUB and round-trips AZW3", async () => {
    const services = createInMemoryPlatformServices();
    await services.settings.set("export", { imagePreset: "original" });
    setActivePinia(createPinia());
    const missing = useSettingsStore();
    missing.configure(services.settings);
    await missing.load();
    expect(missing.exportSettings.format).toBe("epub");

    await services.settings.set("export", { format: "pdf" });
    setActivePinia(createPinia());
    const invalid = useSettingsStore();
    invalid.configure(services.settings);
    await invalid.load();
    expect(invalid.exportSettings.format).toBe("epub");

    invalid.exportSettings.format = "azw3";
    await invalid.persist();
    setActivePinia(createPinia());
    const reloaded = useSettingsStore();
    reloaded.configure(services.settings);
    await reloaded.load();
    expect(reloaded.exportSettings.format).toBe("azw3");
  });

  it("persists the theme choice with a system default", async () => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    const settings = useSettingsStore();
    settings.configure(services.settings);
    await settings.load();
    expect(settings.theme).toBe("system");
    settings.theme = "dark";
    await settings.persist();
    expect(await services.settings.get("theme", null)).toBe("dark");
  });
});

const bookOptions = {
  locale: "ru",
  now: "2026-10-06T00:00:00Z",
  newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
  newChapterId: () => "chapter1",
};

describe("spelling store", () => {
  it("filters by settings, book dictionary and ignores without new results", async () => {
    setActivePinia(createPinia());
    const project = useProjectStore();
    project.setBook({ ...createBook(bookOptions), dictionary: ["Минжуй"] });
    const settings = useSettingsStore();
    const spelling = useSpellingStore();
    spelling.setChapter("chapter1", "Минжуй превет wrold", [
      { word: "Минжуй", lang: "ru", from: 0, to: 6 },
      { word: "превет", lang: "ru", from: 7, to: 13 },
      { word: "wrold", lang: "en", from: 14, to: 19 },
    ]);
    expect(spelling.visible.get("chapter1")?.items.map((i) => i.word)).toEqual(["превет", "wrold"]);
    settings.spelling = { enabled: true, languages: { ru: true, en: false } };
    expect(spelling.total).toBe(1);
    spelling.ignore("превет");
    expect(spelling.total).toBe(0);
    expect(spelling.visible.has("chapter1")).toBe(false);
    settings.spelling = { enabled: false, languages: { ru: true, en: true } };
    expect(spelling.total).toBe(0);
  });
  it("keeps the word cache across books but resets chapters and ignores", () => {
    setActivePinia(createPinia());
    const spelling = useSpellingStore();
    spelling.remember("ru", ["мир", "мирр"], new Set(["мирр"]));
    spelling.setChapter("a", "мирр", [{ word: "мирр", lang: "ru", from: 0, to: 4 }]);
    spelling.ignore("мирр");
    spelling.resetBook();
    expect(spelling.cached("ru", "мир")).toBe(true);
    expect(spelling.cached("ru", "мирр")).toBe(false);
    expect(spelling.chapters.size).toBe(0);
    expect(spelling.total).toBe(0);
  });
});
