import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { useBookSearch } from "@/composables/use-book-search";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { findInBook } from "@/services/search/find";
import { chapterEditorStates, resetChapterEditors } from "@/components/editor/editor-commands";
import { useLayoutStore } from "@/stores/layout";
import { setCover } from "@/services/book/metadata";

function makeBook(id = "urn:uuid:550e8400-e29b-41d4-a716-446655440000") {
  const book = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => id.slice("urn:uuid:".length),
    newChapterId: () => "chapter1",
  });
  book.chapters.push({ id: "chapter2", source: "hero hero" });
  book.chapters[0]!.source = "hero one";
  return book;
}

describe("useBookSearch", () => {
  beforeEach(() => setActivePinia(createPinia()));

  beforeEach(() => resetChapterEditors());

  it("disables only stale chapter undo after a later edit", () => {
    const project = useProjectStore();
    const value = makeBook();
    value.chapters[1]!.source = "other";
    project.setBook(value);
    const search = useBookSearch();

    search.replaceAll({ text: "hero", caseSensitive: true, wholeWord: false, regex: false }, "x");
    const notification = useNotificationsStore().items[0]!;
    project.updateChapterSource("chapter1", "later edit");

    // The item exposes its state as a live value, not a snapshot.
    expect(notification.undoState?.()).toBe(false);
    expect(notification.undoEnabled).toBe(false);
    expect(project.book?.chapters[1]?.source).toBe("other");
  });

  it("restores a deleted chapter at its original position", () => {
    const project = useProjectStore();
    project.setBook(makeBook());
    const search = useBookSearch();
    const removed = project.book!.chapters[0]!;

    search.deleteChapter(removed.id);
    const notification = useNotificationsStore().items[0]!;
    notification.undo?.();

    expect(project.book?.chapters.map((chapter) => chapter.id)).toEqual(["chapter1", "chapter2"]);
  });

  it("does not partially undo when any replaced chapter became stale", () => {
    const project = useProjectStore();
    project.setBook(makeBook());
    const search = useBookSearch();
    const undo = search.replaceAll(
      { text: "hero", caseSensitive: true, wholeWord: false, regex: false },
      "x",
    )!;

    project.updateChapterSource("chapter2", "later edit");
    search.undoReplace(undo);

    expect(useNotificationsStore().items[0]?.undoEnabled).toBe(false);
    expect(project.book?.chapters.map((chapter) => chapter.source)).toEqual([
      "x one",
      "later edit",
    ]);
  });

  it("expands regex captures for one replacement and validates the original range", () => {
    const project = useProjectStore();
    const value = makeBook();
    value.chapters[0]!.source = "hero 12";
    project.setBook(value);
    const search = useBookSearch();
    const query = {
      text: "(?<word>hero) (\\d+)",
      caseSensitive: true,
      wholeWord: false,
      regex: true,
    };
    const found = findInBook(value, query);
    if ("error" in found) throw new Error(found.error);

    search.replaceOne(query, found[0]!, "$2 — $<word>");
    expect(project.book?.chapters[0]?.source).toBe("12 — hero");

    search.replaceOne(query, { ...found[0]!, from: 99, to: 105 }, "bad");
    expect(project.book?.chapters[0]?.source).toBe("12 — hero");
    expect(chapterEditorStates.get("chapter1")?.doc.toString()).toBe("12 — hero");
  });

  it("creates an editor history for an unopened chapter replacement", () => {
    const project = useProjectStore();
    project.setBook(makeBook());
    const search = useBookSearch();

    search.replaceChapter(
      "chapter2",
      { text: "hero", caseSensitive: true, wholeWord: false, regex: false },
      "x",
    );

    expect(chapterEditorStates.get("chapter2")?.doc.toString()).toBe("x x");
    expect(project.book?.chapters[1]?.source).toBe("x x");
  });

  it("selects the next chapter after deleting the current one and restores it on undo", () => {
    const project = useProjectStore();
    project.setBook(makeBook());
    const layout = useLayoutStore();
    layout.center = { kind: "chapter", id: "chapter1" };
    const search = useBookSearch();

    search.deleteChapter("chapter1");
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter2" });
    useNotificationsStore().items[0]?.undo?.();
    expect(layout.center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("does not undo a chapter deletion into a different book generation", () => {
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const search = useBookSearch();

    search.deleteChapter("chapter1");
    const notification = useNotificationsStore().items[0]!;
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));

    notification.undo?.();

    expect(project.book?.metadata.id).toBe("urn:uuid:550e8400-e29b-41d4-a716-446655440002");
    expect(project.book?.chapters).toHaveLength(2);
    expect(notification.undoEnabled).toBe(false);
  });

  it("does not overwrite a newer cover selection when undoing resource deletion", () => {
    const project = useProjectStore();
    const book = makeBook();
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    book.resources.set("images/b.png", { bytes: new Uint8Array([2]), mediaType: "image/png" });
    book.metadata.cover = "images/a.png";
    project.setBook(book);
    const search = useBookSearch();

    search.deleteResource("images/a.png");
    const notification = useNotificationsStore().items[0]!;
    project.applyMutation(setCover(project.book!, "images/b.png"));

    notification.undo?.();

    expect(project.book?.resources.has("images/a.png")).toBe(true);
    expect(project.book?.metadata.cover).toBe("images/b.png");
  });

  it("restores the deleted cover after an unrelated chapter edit", () => {
    const project = useProjectStore();
    const book = makeBook();
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    book.metadata.cover = "images/a.png";
    project.setBook(book);
    const search = useBookSearch();

    search.deleteResource("images/a.png");
    const notification = useNotificationsStore().items[0]!;
    project.updateChapterSource("chapter1", "unrelated edit");

    notification.undo?.();

    expect(project.book?.resources.has("images/a.png")).toBe(true);
    expect(project.book?.metadata.cover).toBe("images/a.png");
  });

  it("does not restore a deleted cover after an explicit clear", () => {
    const project = useProjectStore();
    const book = makeBook();
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    book.metadata.cover = "images/a.png";
    project.setBook(book);
    const search = useBookSearch();

    search.deleteResource("images/a.png");
    const notification = useNotificationsStore().items[0]!;
    project.applyMutation(setCover(project.book!, null));

    notification.undo?.();

    expect(project.book?.resources.has("images/a.png")).toBe(true);
    expect(project.book?.metadata.cover).toBeNull();
  });

  it("does not undo a resource deletion into a different book generation", () => {
    const project = useProjectStore();
    const first = makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001");
    first.resources.set("images/a.png", {
      bytes: new Uint8Array([1]),
      mediaType: "image/png",
    });
    project.setBook(first);
    const search = useBookSearch();

    search.deleteResource("images/a.png");
    const notification = useNotificationsStore().items[0]!;
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));

    notification.undo?.();

    expect(project.book?.metadata.id).toBe("urn:uuid:550e8400-e29b-41d4-a716-446655440002");
    expect(project.book?.resources.has("images/a.png")).toBe(false);
    expect(notification.undoEnabled).toBe(false);
  });

  it("deletes several images under one toast that restores them all", () => {
    const project = useProjectStore();
    const book = makeBook();
    book.resources.set("images/a.png", { bytes: new Uint8Array([1]), mediaType: "image/png" });
    book.resources.set("images/b.png", { bytes: new Uint8Array([2]), mediaType: "image/png" });
    project.setBook(book);
    const search = useBookSearch();
    search.deleteResources(["images/a.png", "images/b.png"]);
    const notifications = useNotificationsStore();
    expect(notifications.items).toHaveLength(1);
    expect(notifications.items[0]!.message).toBe("2 images deleted");
    notifications.items[0]!.undo!();
    expect(project.book!.resources.has("images/a.png")).toBe(true);
    expect(project.book!.resources.has("images/b.png")).toBe(true);
  });
});
