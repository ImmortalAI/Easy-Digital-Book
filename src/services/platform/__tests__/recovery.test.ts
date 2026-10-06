import { describe, expect, it } from "vitest";
import { openDB } from "idb";
import { createRecoveryStore } from "../recovery";
import { createInMemoryPlatformServices } from "../index";
import type { Book } from "@/types/book";

const book = (): Book => ({
  metadata: {
    id: "book",
    title: "Book",
    version: null,
    created: "",
    modified: "",
    language: "en",
    authors: [],
    translators: [],
    series: null,
    description: null,
    cover: null,
  },
  chapters: [
    { id: "one", source: "changed" },
    { id: "two", source: "unchanged" },
  ],
  resources: new Map([["images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" }]]),
  customCss: "body {}",
  dictionary: [],
});

describe("indexeddb recovery", () => {
  it("writes only changed chapters and preserves unchanged rows", async () => {
    const recovery = createRecoveryStore();
    await recovery.writeChanges(book(), {
      changedChapters: new Set(["one", "two"]),
      removedChapters: new Set(),
      changedResources: new Set(),
      removedResources: new Set(),
    });
    const next = book();
    next.chapters[0].source = "new";
    await recovery.writeChanges(next, {
      changedChapters: new Set(["one"]),
      removedChapters: new Set(),
      changedResources: new Set(),
      removedResources: new Set(),
    });
    expect(
      (await recovery.restore("book"))?.chapters.find((chapter) => chapter.id === "two")?.source,
    ).toBe("unchanged");
    expect(
      (await recovery.restore("book"))?.chapters.find((chapter) => chapter.id === "one")?.source,
    ).toBe("new");
  });

  it("deletes malformed session and rows without logging source contents", async () => {
    const logs: Array<{ message: string; details?: Record<string, unknown> }> = [];
    const recovery = createRecoveryStore({
      debug() {},
      info() {},
      error() {},
      warn(message, details) {
        logs.push({ message, details });
      },
    });
    const db = await openDB("edb-recovery", 1);
    const tx = db.transaction(["sessions", "chapters", "resources"], "readwrite");
    await tx
      .objectStore("sessions")
      .put({ bookId: "corrupt", title: "secret title", updatedAt: 1 });
    await tx
      .objectStore("chapters")
      .put({ bookId: "corrupt", chapterId: "one", source: "SECRET SOURCE" });
    await tx.objectStore("resources").put({
      bookId: "corrupt",
      path: "images/a.png",
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    });
    await tx.done;

    await expect(recovery.restore("corrupt")).resolves.toBeNull();
    const check = db.transaction(["sessions", "chapters", "resources"], "readonly");
    expect(await check.objectStore("sessions").get("corrupt")).toBeUndefined();
    expect(
      (await check.objectStore("chapters").getAll()).filter((row) => row.bookId === "corrupt"),
    ).toHaveLength(0);
    expect(
      (await check.objectStore("resources").getAll()).filter((row) => row.bookId === "corrupt"),
    ).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toEqual({ bookId: "corrupt" });
    expect(JSON.stringify(logs)).not.toContain("SECRET SOURCE");
  });

  it("returns a usable in-memory platform", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("book.edb", new Uint8Array([1, 2]));
    expect(await services.files.readFile("book.edb")).toEqual(new Uint8Array([1, 2]));
    await services.settings.set("locale", "ru");
    expect(await services.settings.get("locale", "en")).toBe("ru");
    expect(await services.dialogs.open()).toBeNull();
    expect(await services.updates.check()).toBe(false);

    await services.recovery.writeChanges(book(), {
      changedChapters: new Set(["one", "two"]),
      removedChapters: new Set(),
      changedResources: new Set(["images/a.png"]),
      removedResources: new Set(),
    });
    const next = book();
    next.chapters[0].source = "memory update";
    await services.recovery.writeChanges(next, {
      changedChapters: new Set(["one"]),
      removedChapters: new Set(),
      changedResources: new Set(),
      removedResources: new Set(),
    });
    expect((await services.recovery.restore("book"))?.chapters[1].source).toBe("unchanged");
    await services.recovery.remove("book");
    expect(await services.recovery.restore("book")).toBeNull();
  });
});
