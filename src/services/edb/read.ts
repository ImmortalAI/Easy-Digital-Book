import JSZip from "jszip";
import type { Book, ImageMediaType } from "@/types/book";
import type { AppWarning } from "@/types/diagnostics";
import { AppError } from "@/types/errors";
import { parseDictionaryText } from "@/services/book/dictionary";
import { parseManifest, normalizeMetadata } from "./manifest";

export interface ReadEdbDeps {
  now: () => Date;
}
export interface ReadEdbResult {
  book: Book;
  warnings: AppWarning[];
  migrated: boolean;
}
const mediaTypes: Record<string, ImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};
function normalized(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
export async function readEdb(bytes: Uint8Array, deps: ReadEdbDeps): Promise<ReadEdbResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new AppError("edb.notZip", "File is not a valid ZIP archive");
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new AppError("edb.noManifest", "Manifest is missing");
  let raw: unknown;
  try {
    raw = JSON.parse(await manifestFile.async("string"));
  } catch {
    throw new AppError("edb.badJson", "Manifest JSON is invalid");
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as Record<string, unknown>).format === "string" &&
    (raw as Record<string, unknown>).format !== "easy-digital-book"
  )
    throw new AppError("edb.foreignFormat", "Not an Easy Digital Book project");
  const parsed = parseManifest(raw);
  const warnings: AppWarning[] = [...parsed.warnings];
  const now = deps.now().toISOString();
  const metadata = normalizeMetadata(parsed.manifest.book, now, warnings);
  const chapters = [] as Book["chapters"];
  const listed = new Set<string>();
  for (const item of parsed.manifest.chapters) {
    listed.add(item.id);
    const file = zip.file(`chapters/${item.id}.nov`);
    if (!file) {
      chapters.push({ id: item.id, source: "" });
      warnings.push({
        code: "edb.missingChapter",
        message: `Chapter file is missing: ${item.id}`,
        chapterId: item.id,
      });
    } else chapters.push({ id: item.id, source: normalized(await file.async("string")) });
  }
  const chapterFiles = Object.keys(zip.files).filter((path) => /^chapters\/[^/]+\.nov$/.test(path));
  for (const path of chapterFiles) {
    const id = path.slice("chapters/".length, -4);
    if (!/^[a-z0-9]{8}$/.test(id)) {
      warnings.push({
        code: "edb.invalidChapterFile",
        message: `Invalid chapter filename ignored: ${path}`,
      });
      continue;
    }
    if (!listed.has(id)) {
      chapters.push({ id, source: normalized(await zip.file(path)!.async("string")) });
      warnings.push({
        code: "edb.orphanChapter",
        message: `Orphan chapter added: ${id}`,
        chapterId: id,
      });
    }
  }
  const resources = new Map<string, { bytes: Uint8Array; mediaType: ImageMediaType }>();
  for (const path of Object.keys(zip.files)
    .filter((p) => p.startsWith("images/") && !p.endsWith("/"))
    .sort()) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = mediaTypes[ext];
    if (mediaType)
      resources.set(path, { bytes: await zip.file(path)!.async("uint8array"), mediaType });
  }
  if (metadata.cover && !resources.has(metadata.cover)) {
    warnings.push({ code: "edb.missingCover", message: `Cover is missing: ${metadata.cover}` });
    metadata.cover = null;
  }
  const css = zip.file("styles/custom.css");
  const dictionaryFile = zip.file("dictionary.txt");
  return {
    book: {
      metadata,
      chapters,
      resources,
      customCss: css ? normalized(await css.async("string")) : null,
      dictionary: dictionaryFile ? parseDictionaryText(await dictionaryFile.async("string")) : [],
    },
    warnings,
    migrated: parsed.migrated,
  };
}
