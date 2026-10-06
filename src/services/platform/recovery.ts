import { openDB } from "idb";
import { normalizeDictionary } from "@/services/book/dictionary";
import type { Book, Resource } from "@/types/book";
import type {
  Logger,
  RecoveredBook,
  RecoverySessionSummary,
  RecoveryStore,
} from "@/types/platform";

interface SessionRow extends RecoverySessionSummary {
  metadata: Book["metadata"];
  chapterOrder: string[];
  customCss: string | null;
  dictionary?: string[];
}
interface ChapterRow {
  bookId: string;
  chapterId: string;
  source: string;
}
interface ResourceRow {
  bookId: string;
  path: string;
  bytes: Uint8Array;
  mediaType: Resource["mediaType"];
}
interface RecoverySchema {
  sessions: SessionRow;
  chapters: ChapterRow;
  resources: ResourceRow;
}

const database = () =>
  openDB<RecoverySchema>("edb-recovery", 1, {
    upgrade(db) {
      db.createObjectStore("sessions", { keyPath: "bookId" });
      db.createObjectStore("chapters", { keyPath: ["bookId", "chapterId"] });
      db.createObjectStore("resources", { keyPath: ["bookId", "path"] });
    },
  });

const cloneBytes = (bytes: Uint8Array) => new Uint8Array(bytes);

export function createRecoveryStore(logger?: Logger): RecoveryStore {
  return {
    async list() {
      const db = await database();
      return db.getAll("sessions").then((rows) =>
        rows.map(({ bookId, originalPath, title, version, updatedAt }) => ({
          bookId,
          originalPath,
          title,
          version,
          updatedAt,
        })),
      );
    },
    async writeChanges(book, delta, originalPath) {
      const db = await database();
      const tx = db.transaction(["sessions", "chapters", "resources"], "readwrite");
      const old = await tx.objectStore("sessions").get(book.metadata.id);
      await tx.objectStore("sessions").put({
        bookId: book.metadata.id,
        originalPath: originalPath ?? old?.originalPath ?? null,
        title: book.metadata.title,
        version: book.metadata.version,
        updatedAt: Date.now(),
        metadata: book.metadata,
        chapterOrder: book.chapters.map(({ id }) => id),
        customCss: book.customCss,
        dictionary: book.dictionary,
      });
      for (const id of delta.removedChapters)
        await tx.objectStore("chapters").delete([book.metadata.id, id]);
      for (const id of delta.changedChapters) {
        const chapter = book.chapters.find((item) => item.id === id);
        if (chapter)
          await tx
            .objectStore("chapters")
            .put({ bookId: book.metadata.id, chapterId: id, source: chapter.source });
      }
      for (const path of delta.removedResources)
        await tx.objectStore("resources").delete([book.metadata.id, path]);
      for (const path of delta.changedResources) {
        const resource = book.resources.get(path);
        if (resource)
          await tx.objectStore("resources").put({
            bookId: book.metadata.id,
            path,
            bytes: cloneBytes(resource.bytes),
            mediaType: resource.mediaType,
          });
      }
      // A first save must include all rows, even when the caller has no dirty sets.
      if (!old) {
        for (const chapter of book.chapters)
          if (!delta.changedChapters.has(chapter.id))
            await tx
              .objectStore("chapters")
              .put({ bookId: book.metadata.id, chapterId: chapter.id, source: chapter.source });
        for (const [path, resource] of book.resources)
          if (!delta.changedResources.has(path))
            await tx.objectStore("resources").put({
              bookId: book.metadata.id,
              path,
              bytes: cloneBytes(resource.bytes),
              mediaType: resource.mediaType,
            });
      }
      await tx.done;
    },
    async restore(bookId) {
      const db = await database();
      try {
        const tx = db.transaction(["sessions", "chapters", "resources"], "readonly");
        const session = await tx.objectStore("sessions").get(bookId);
        if (!session) return null;
        if (
          !Array.isArray(session.chapterOrder) ||
          !session.metadata ||
          typeof session.metadata.title !== "string"
        )
          throw new Error("invalid session");
        const chapterRows = await tx.objectStore("chapters").getAll();
        const resourceRows = await tx.objectStore("resources").getAll();
        const chapters = session.chapterOrder.map((id: string) => {
          const row = chapterRows.find((item) => item.bookId === bookId && item.chapterId === id);
          if (!row) throw new Error("missing chapter");
          return { id, source: row.source };
        });
        const resources = new Map<string, Resource>();
        for (const row of resourceRows)
          if (row.bookId === bookId)
            resources.set(row.path, { bytes: cloneBytes(row.bytes), mediaType: row.mediaType });
        return {
          metadata: session.metadata,
          chapters,
          resources,
          customCss: session.customCss,
          dictionary: Array.isArray(session.dictionary)
            ? normalizeDictionary(session.dictionary)
            : [],
          originalPath: session.originalPath,
        } satisfies RecoveredBook;
      } catch {
        logger?.warn("Recovery session was corrupt", { bookId });
        await this.remove(bookId);
        return null;
      }
    },
    async remove(bookId) {
      const db = await database();
      const tx = db.transaction(["sessions", "chapters", "resources"], "readwrite");
      await tx.objectStore("sessions").delete(bookId);
      for (const row of await tx.objectStore("chapters").getAll())
        if (row.bookId === bookId) await tx.objectStore("chapters").delete([bookId, row.chapterId]);
      for (const row of await tx.objectStore("resources").getAll())
        if (row.bookId === bookId) await tx.objectStore("resources").delete([bookId, row.path]);
      await tx.done;
    },
  };
}
