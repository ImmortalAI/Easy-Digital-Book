import { importImage, type ImageHash, type ImportImageResult } from "@/services/book/resources";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import type { Book } from "@/types/book";

export interface ImageImportIdentity {
  generation: number;
  bookId: string;
}

interface ImageImportProject {
  book: Book | null;
  bookGeneration: number;
}

export function captureImageImportIdentity(
  project: ImageImportProject,
): ImageImportIdentity | null {
  return project.book
    ? { generation: project.bookGeneration, bookId: project.book.metadata.id }
    : null;
}

export function isImageImportIdentityCurrent(
  project: ImageImportProject,
  identity: ImageImportIdentity,
): boolean {
  return (
    project.bookGeneration === identity.generation && project.book?.metadata.id === identity.bookId
  );
}

export function validateLanguage(value: string): { valid: boolean; canonical?: string } {
  try {
    const canonical = Intl.getCanonicalLocales(value.trim())[0];
    return canonical ? { valid: true, canonical } : { valid: false };
  } catch {
    return { valid: false };
  }
}

export function insertImageParagraph(source: string, position: number, path: string): string {
  const before = source.slice(0, position);
  const after = source.slice(position);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "\n";
  return `${before}${prefix}![](${path})${suffix}${after}`;
}

export function imageCursorPosition(source: string, position: number): number {
  const before = source.slice(0, position);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  return position + prefix.length + 2;
}

async function browserSha256(bytes: Uint8Array): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ImageImportOptions {
  chapterId?: string;
  position?: number;
  fileName?: string;
  onInserted?: (result: ImportImageResult, cursor: number) => void;
  pickFile?: () => Promise<ImageFile | null>;
  sha256?: ImageHash["sha256"];
}
export interface ImageImportCallOptions {
  /** Show the result (its chapter, or the image) once imported; on by default. */
  navigate?: boolean;
}
export interface ImageFile {
  name: string;
  bytes: Uint8Array;
  type?: string;
}

export function useImageImport(options: ImageImportOptions = {}) {
  const project = useProjectStore();
  const layout = useLayoutStore();
  const deps: ImageHash = { sha256: options.sha256 ?? browserSha256 };

  async function add(
    fileName: string,
    bytes: Uint8Array,
    chapterId = options.chapterId,
    position?: number,
    expected?: ImageImportIdentity | null,
    { navigate = true }: ImageImportCallOptions = {},
  ) {
    const identity = expected ?? captureImageImportIdentity(project);
    if (!identity || !isImageImportIdentityCurrent(project, identity) || !project.book) return null;
    const result = await importImage(project.book, fileName, bytes, deps);
    const isCurrent = () => isImageImportIdentityCurrent(project, identity);
    if (!isCurrent()) return null;
    if (result.inserted) project.applyMutation(result);
    const chapter = chapterId
      ? project.book.chapters.find((item) => item.id === chapterId)
      : undefined;
    if (chapter && position !== undefined) {
      const source = insertImageParagraph(chapter.source, position, result.path);
      project.updateChapterSource(chapter.id, source);
      options.onInserted?.(result, imageCursorPosition(chapter.source, position));
    }
    if (!isCurrent()) return null;
    if (!navigate) return result;
    layout.center = chapter
      ? { kind: "chapter", id: chapter.id }
      : { kind: "image", path: result.path };
    return result;
  }

  async function importFile(
    file: ImageFile,
    chapterId?: string,
    position?: number,
    identity?: ImageImportIdentity | null,
    callOptions?: ImageImportCallOptions,
  ) {
    return add(file.name, file.bytes, chapterId, position, identity, callOptions);
  }

  async function pickAndImport(
    chapterId?: string,
    position?: number,
    callOptions?: ImageImportCallOptions,
  ) {
    const expected = captureImageImportIdentity(project);
    if (!expected) return null;
    const file = await options.pickFile?.();
    return file ? add(file.name, file.bytes, chapterId, position, expected, callOptions) : null;
  }

  async function importClipboardImage(
    data: DataTransfer | null,
    chapterId = options.chapterId,
    position = options.position,
  ) {
    const file = [...(data?.files ?? [])].find((item) => item.type.startsWith("image/"));
    if (!file) return null;
    const identity = captureImageImportIdentity(project);
    if (!identity) return null;
    return add(
      options.fileName ?? `pasted-${timestamp()}.png`,
      new Uint8Array(await file.arrayBuffer()),
      chapterId,
      position,
      identity,
    );
  }

  return { add, importFile, pickAndImport, importClipboardImage };
}

function timestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
