import {
  createChapterEditor,
  replaceChapterEditorText,
  chapterEditorStates,
} from "@/components/editor/editor-commands";
import { removeChapter } from "@/services/book/chapters";
import { removeResources } from "@/services/book/resources";
import { replaceMatches, type ReplacementChange } from "@/services/search/replace";
import type { SearchQuery, SearchResult } from "@/services/search/query";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import type { Resource } from "@/types/book";
import { useSafeI18n } from "@/composables/use-safe-i18n";
export type ReplaceAllUndo = { originals: Map<string, string>; revisionAfter: Map<string, number> };

function replacementChanges(
  change: ReplacementChange,
): Array<{ from: number; to: number; insert: string }> {
  return change.matches
    .map((match) => ({ from: match.from, to: match.to, insert: match.replacementPreview ?? "" }))
    .sort((a, b) => b.from - a.from);
}

export function useBookSearch() {
  const project = useProjectStore();
  const notifications = useNotificationsStore();
  const layout = useLayoutStore();
  const { t } = useSafeI18n();

  function applyChange(change: ReplacementChange): void {
    const chapter = project.book?.chapters.find((item) => item.id === change.chapterId);
    if (!chapter) return;
    if (!chapterEditorStates.has(chapter.id)) createChapterEditor(chapter.id, chapter.source);
    const source = replaceChapterEditorText(chapter.id, replacementChanges(change));
    project.updateChapterSource(chapter.id, source);
  }

  function replaceOne(query: SearchQuery, result: SearchResult, replacement: string): boolean {
    if (!project.book) return false;
    const source = project.book.chapters.find((chapter) => chapter.id === result.chapterId)?.source;
    if (
      source === undefined ||
      result.from < 0 ||
      result.to < result.from ||
      result.to > source.length ||
      source.slice(result.from, result.to) !== result.matched
    )
      return false;
    const planned = replaceMatches(
      { ...project.book, chapters: [{ id: result.chapterId, source }] },
      query,
      replacement,
    );
    const plannedMatch =
      "error" in planned
        ? undefined
        : planned.changes
            .find((change) => change.chapterId === result.chapterId)
            ?.matches.find(
              (match) =>
                match.from === result.from &&
                match.to === result.to &&
                match.matched === result.matched,
            );
    if (!plannedMatch) return false;
    const change: ReplacementChange = {
      chapterId: result.chapterId,
      source: source.slice(0, result.from) + replacement + source.slice(result.to),
      matches: [{ ...result, replacementPreview: plannedMatch.replacementPreview ?? replacement }],
    };
    applyChange(change);
    return true;
  }

  function replaceChapter(chapterId: string, query: SearchQuery, replacement: string): number {
    if (!project.book) return 0;
    const book = {
      ...project.book,
      chapters: project.book.chapters.filter((item) => item.id === chapterId),
    };
    const result = replaceMatches(book, query, replacement);
    if ("error" in result) return 0;
    result.changes.forEach(applyChange);
    return result.changes.reduce((total, change) => total + change.matches.length, 0);
  }

  /**
   * `isIncluded` lets the caller drop matches the user excluded in the UI.
   * applyChange rebuilds the text from `matches`, never from `change.source`,
   * so filtering the plan this way stays consistent.
   */
  function replaceAll(
    query: SearchQuery,
    replacement: string,
    isIncluded?: (chapterId: string, match: SearchResult) => boolean,
  ): ReplaceAllUndo | null {
    if (!project.book) return null;
    const result = replaceMatches(project.book, query, replacement);
    if ("error" in result) return null;
    const changes = isIncluded
      ? result.changes
          .map((change) => ({
            ...change,
            matches: change.matches.filter((match) => isIncluded(change.chapterId, match)),
          }))
          .filter((change) => change.matches.length > 0)
      : result.changes;
    if (changes.length === 0) return null;
    const originals = new Map(
      changes.map((change) => [
        change.chapterId,
        project.book!.chapters.find((chapter) => chapter.id === change.chapterId)!.source,
      ]),
    );
    changes.forEach(applyChange);
    const revisionAfter = new Map(
      changes.map((change) => [change.chapterId, project.chapterRevision(change.chapterId)]),
    );
    const undo: ReplaceAllUndo = { originals, revisionAfter };
    notifications.add({
      message: t("search.replaced", "Replaced {count} matches").replace(
        "{count}",
        String(changes.reduce((total, change) => total + change.matches.length, 0)),
      ),
      kind: "success",
      undo: () => undoReplace(undo),
      undoState: () =>
        [...undo.revisionAfter].every(([id, revision]) => project.chapterRevision(id) === revision),
    });
    return undo;
  }

  function undoReplace(undo: ReplaceAllUndo): void {
    const canUndo = [...undo.revisionAfter].every(
      ([chapterId, revision]) => project.chapterRevision(chapterId) === revision,
    );
    if (!canUndo) return;
    for (const [chapterId, source] of undo.originals) {
      if (project.book?.chapters.some((chapter) => chapter.id === chapterId)) {
        const current = project.book.chapters.find((chapter) => chapter.id === chapterId)!.source;
        if (!chapterEditorStates.has(chapterId)) createChapterEditor(chapterId, current);
        const state = chapterEditorStates.get(chapterId)!;
        if (state.doc.toString() !== source) {
          replaceChapterEditorText(chapterId, [{ from: 0, to: state.doc.length, insert: source }]);
        }
        project.updateChapterSource(chapterId, source);
      }
    }
  }

  function deleteChapter(chapterId: string): void {
    if (!project.book) return;
    const generationAtDelete = project.bookGeneration;
    const bookIdAtDelete = project.book.metadata.id;
    const index = project.book.chapters.findIndex((chapter) => chapter.id === chapterId);
    const chapter = project.book.chapters[index];
    if (!chapter || project.book.chapters.length <= 1) return;
    const wasCurrent = layout.center.kind === "chapter" && layout.center.id === chapterId;
    const nextChapterId =
      project.book.chapters[index + 1]?.id ?? project.book.chapters[index - 1]?.id ?? "";
    project.applyMutation(removeChapter(project.book, chapterId));
    const canUndo = () =>
      project.bookGeneration === generationAtDelete &&
      project.book?.metadata.id === bookIdAtDelete &&
      !project.book.chapters.some((item) => item.id === chapterId);
    if (wasCurrent && nextChapterId) layout.center = { kind: "chapter", id: nextChapterId };
    notifications.add({
      message: t("delete.chapterToast", "Chapter deleted"),
      undoState: canUndo,
      undo: () => {
        if (!project.book || !canUndo()) return;
        const next = [...project.book.chapters];
        next.splice(Math.min(index, next.length), 0, chapter);
        project.applyMutation({
          book: { ...project.book, chapters: next },
          changedChapters: new Set([chapterId]),
          removedChapters: new Set(),
          changedResources: new Set(),
          removedResources: new Set(),
        });
        if (wasCurrent) layout.center = { kind: "chapter", id: chapterId };
      },
    });
  }

  function deleteResources(paths: string[]): void {
    if (!project.book) return;
    const generationAtDelete = project.bookGeneration;
    const bookIdAtDelete = project.book.metadata.id;
    const existing = project.book.resources;
    const saved = new Map<string, Resource>();
    for (const path of paths) {
      const resource = existing.get(path);
      if (resource) saved.set(path, resource);
    }
    if (saved.size === 0) return;
    const previousCover = project.book.metadata.cover;
    const removed = removeResources(project.book, [...saved.keys()]);
    project.applyMutation(removed);
    const expectedCoverAfterDelete = removed.book.metadata.cover;
    const coverRevisionAfterDelete = project.coverRevision;
    const canUndo = () =>
      project.bookGeneration === generationAtDelete &&
      project.book?.metadata.id === bookIdAtDelete &&
      [...saved.keys()].every((path) => !project.book?.resources.has(path));
    notifications.add({
      message:
        saved.size === 1
          ? t("delete.imageToast", "Image deleted")
          : t("delete.imagesToast", "{count} images deleted").replace(
              "{count}",
              String(saved.size),
            ),
      undoState: canUndo,
      undo: () => {
        if (!project.book || !canUndo()) return;
        const resources = new Map(project.book.resources);
        for (const [path, resource] of saved) resources.set(path, resource);
        const restoreCover = project.book.metadata.cover === expectedCoverAfterDelete;
        const canRestoreCover = project.coverRevision === coverRevisionAfterDelete && restoreCover;
        project.applyMutation({
          book: {
            ...project.book,
            resources,
            metadata: canRestoreCover
              ? { ...project.book.metadata, cover: previousCover }
              : project.book.metadata,
          },
          changedChapters: new Set(),
          removedChapters: new Set(),
          changedResources: new Set(saved.keys()),
          removedResources: new Set(),
        });
      },
    });
  }

  function deleteResource(path: string): void {
    deleteResources([path]);
  }

  return {
    replaceOne,
    replaceChapter,
    replaceAll,
    undoReplace,
    deleteChapter,
    deleteResource,
    deleteResources,
  };
}
