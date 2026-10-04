import type { Book, BookMutation } from "@/types/book";

export interface ResourceRename {
  from: string;
  to: string;
}
export type RenamePlan =
  | { renames: ResourceRename[] }
  | { error: "empty" | "conflict"; path?: string };
export type TextEdit = { from: number; to: number; insert: string };

const IMAGE_REF = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

export function planBatchRename(book: Book, selection: string[], name: string): RenamePlan {
  if (name === "") return { error: "empty" };
  const width = String(selection.length).length;
  const selected = new Set(selection);
  const renames: ResourceRename[] = [];
  for (const [index, from] of selection.entries()) {
    const extension = from.slice(from.lastIndexOf("."));
    const to = `images/${name}_${String(index + 1).padStart(width, "0")}${extension}`;
    if (book.resources.has(to) && !selected.has(to)) return { error: "conflict", path: to };
    if (to !== from) renames.push({ from, to });
  }
  return { renames };
}

/**
 * Every rewrite is computed against the original text, so swaps (a→b, b→a)
 * need no temporary names.
 */
export function renameResources(
  book: Book,
  renames: ResourceRename[],
): { mutation: BookMutation; chapterEdits: Map<string, TextEdit[]> } {
  const map = new Map(renames.map(({ from, to }) => [from, to]));
  const chapterEdits = new Map<string, TextEdit[]>();
  const chapters = book.chapters.map((chapter) => {
    const edits: TextEdit[] = [];
    for (const match of chapter.source.matchAll(IMAGE_REF)) {
      const target = map.get(match[1]!);
      if (!target) continue;
      const from = match.index! + match[0].length - 1 - match[1]!.length;
      edits.push({ from, to: from + match[1]!.length, insert: target });
    }
    if (edits.length === 0) return chapter;
    chapterEdits.set(chapter.id, edits);
    let source = chapter.source;
    for (const edit of [...edits].reverse())
      source = source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
    return { ...chapter, source };
  });
  const resources = new Map(
    [...book.resources].map(([path, resource]) => [map.get(path) ?? path, resource] as const),
  );
  const cover = book.metadata.cover ? (map.get(book.metadata.cover) ?? book.metadata.cover) : null;
  const customCss =
    book.customCss?.replace(CSS_URL, (whole, quote: string, path: string) => {
      const target = map.get(path.trim());
      return target ? `url(${quote}${target}${quote})` : whole;
    }) ?? null;
  const newPaths = new Set(renames.map(({ to }) => to));
  return {
    mutation: {
      book: { ...book, chapters, resources, customCss, metadata: { ...book.metadata, cover } },
      metadataCoverChanged: cover !== book.metadata.cover,
      changedChapters: new Set(chapterEdits.keys()),
      removedChapters: new Set(),
      changedResources: newPaths,
      removedResources: new Set(
        renames.map(({ from }) => from).filter((path) => !newPaths.has(path)),
      ),
    },
    chapterEdits,
  };
}
