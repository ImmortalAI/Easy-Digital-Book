import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { chapterEditorStates, resetChapterEditors } from "@/components/editor/editor-commands";
import { useImageActions } from "@/composables/use-image-actions";
import { createBook } from "@/services/book/create";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";

const png = { mediaType: "image/png" as const, bytes: new Uint8Array([1]) };

beforeEach(() => {
  setActivePinia(createPinia());
  resetChapterEditors();
  const book = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  useProjectStore().setBook({
    ...book,
    chapters: [{ id: "chapter1", source: "![](images/a.png)" }],
    resources: new Map([["images/a.png", png]]),
  });
});

describe("useImageActions", () => {
  it("renames with a toast and undoes it", () => {
    const project = useProjectStore();
    const notifications = useNotificationsStore();
    useImageActions().renameImages([{ from: "images/a.png", to: "images/x_1.png" }]);
    expect([...project.book!.resources.keys()]).toEqual(["images/x_1.png"]);
    expect(project.book!.chapters[0]!.source).toBe("![](images/x_1.png)");
    expect(chapterEditorStates.get("chapter1")!.doc.toString()).toBe("![](images/x_1.png)");
    expect(notifications.items).toHaveLength(1);
    expect(notifications.items[0]!.message).toContain("1");
    notifications.items[0]!.undo!();
    expect([...project.book!.resources.keys()]).toEqual(["images/a.png"]);
    expect(project.book!.chapters[0]!.source).toBe("![](images/a.png)");
  });

  it("does not undo over an image that took the old name", () => {
    const project = useProjectStore();
    const notifications = useNotificationsStore();
    useImageActions().renameImages([{ from: "images/a.png", to: "images/x_1.png" }]);
    const fresh = { mediaType: "image/png" as const, bytes: new Uint8Array([9]) };
    project.applyMutation({
      book: {
        ...project.book!,
        resources: new Map([...project.book!.resources, ["images/a.png", fresh]]),
      },
      changedChapters: new Set(),
      removedChapters: new Set(),
      changedResources: new Set(["images/a.png"]),
      removedResources: new Set(),
    });
    expect(notifications.items[0]!.undoEnabled).toBe(false);
    notifications.items[0]!.undo!();
    expect(project.book!.resources.size).toBe(2);
    expect([...project.book!.resources.get("images/a.png")!.bytes]).toEqual([9]);
  });
});
