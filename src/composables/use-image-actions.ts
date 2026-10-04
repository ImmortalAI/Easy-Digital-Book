import {
  createChapterEditor,
  chapterEditorStates,
  replaceChapterEditorText,
} from "@/components/editor/editor-commands";
import { renameResources, type ResourceRename } from "@/services/book/rename-resources";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";

export function useImageActions() {
  const project = useProjectStore();
  const notifications = useNotificationsStore();
  const { t } = useSafeI18n();

  function apply(renames: ResourceRename[]): boolean {
    if (!project.book || renames.length === 0) return false;
    const { mutation, chapterEdits } = renameResources(project.book, renames);
    for (const [chapterId, edits] of chapterEdits) {
      const chapter = project.book.chapters.find((item) => item.id === chapterId)!;
      if (!chapterEditorStates.has(chapterId)) createChapterEditor(chapterId, chapter.source);
      replaceChapterEditorText(
        chapterId,
        [...edits].sort((a, b) => b.from - a.from),
        { addToHistory: false },
      );
    }
    project.applyMutation(mutation);
    return true;
  }

  function renameImages(renames: ResourceRename[]) {
    const generation = project.bookGeneration;
    if (!apply(renames)) return;
    const canUndo = () =>
      project.bookGeneration === generation &&
      renames.every(({ to }) => project.book?.resources.has(to));
    notifications.add({
      message: t("gallery.renamedToast", "{count} images renamed", {
        count: renames.length,
      }).replace("{count}", String(renames.length)),
      kind: "success",
      undoState: canUndo,
      undo: () => {
        if (canUndo()) apply(renames.map(({ from, to }) => ({ from: to, to: from })));
      },
    });
  }

  return { renameImages };
}
