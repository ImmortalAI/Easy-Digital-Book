import type { ExportFormat } from "@/services/export/types";
import type { BookMetadata } from "@/types/book";

const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function makeExportFileName(
  metadata: Pick<BookMetadata, "title" | "version">,
  versionInTitle: boolean,
  format: ExportFormat,
): string {
  const suffix = versionInTitle && metadata.version ? ` (${metadata.version})` : "";
  let basename = `${metadata.title}${suffix}`
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .map((char) => (/\p{Cc}/u.test(char) ? "_" : char))
    .join("")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!basename) basename = "book";
  if (reserved.test(basename)) basename = `_${basename}`;
  return `${basename.slice(0, 120).replace(/[. ]+$/g, "") || "book"}.${format}`;
}
