import { makeExportFileName } from "@/services/export/file-name";
import type { BookMetadata } from "@/types/book";

export function makeEpubFileName(
  metadata: Pick<BookMetadata, "title" | "version">,
  versionInTitle: boolean,
): string {
  return makeExportFileName(metadata, versionInTitle, "epub");
}
