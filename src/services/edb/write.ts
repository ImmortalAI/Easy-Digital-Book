import type { Book } from "@/types/book";
import { normalizeDictionary, serializeDictionary } from "@/services/book/dictionary";
import { CURRENT_EDB_FORMAT_VERSION } from "@/types/manifest";
import { buildDeterministicZip, type ZipEntry } from "./zip";

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
export async function writeEdb(
  book: Book,
  now: Date,
  options: { updateModified?: boolean } = {},
): Promise<Uint8Array> {
  const metadata = {
    ...book.metadata,
    ...(options.updateModified === false ? {} : { modified: now.toISOString() }),
  };
  const manifest = {
    format: "easy-digital-book" as const,
    formatVersion: CURRENT_EDB_FORMAT_VERSION,
    book: metadata,
    chapters: book.chapters.map(({ id }) => ({ id })),
  };
  const entries: ZipEntry[] = [
    { path: "manifest.json", bytes: utf8(JSON.stringify(manifest)), binary: false },
  ];
  for (const chapter of book.chapters)
    entries.push({
      path: `chapters/${chapter.id}.nov`,
      bytes: utf8(chapter.source.replace(/\r\n?/g, "\n")),
      binary: false,
    });
  for (const path of [...book.resources.keys()].sort())
    entries.push({ path, bytes: book.resources.get(path)!.bytes, binary: true });
  if (book.customCss !== null)
    entries.push({
      path: "styles/custom.css",
      bytes: utf8(book.customCss.replace(/\r\n?/g, "\n")),
      binary: false,
    });
  if (book.dictionary.length)
    entries.push({
      path: "dictionary.txt",
      bytes: utf8(serializeDictionary(normalizeDictionary(book.dictionary))),
      binary: false,
    });
  return buildDeterministicZip(entries);
}
