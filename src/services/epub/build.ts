import { AppError } from "@/types/errors";
import type { Book } from "@/types/book";
import { prepareExport } from "@/services/export/prepare";
import type { BuildDependencies, ExportOptions } from "@/services/export/types";
import { containerXml } from "./container";
import { navXhtml } from "./nav";
import { ncx } from "./ncx";
import { opf } from "./opf";
import { makeZip } from "./zip";

export type {
  ExportOptions,
  BuildDependencies as BuildEpubDependencies,
} from "@/services/export/types";

const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
};
export async function buildEpub(
  book: Book,
  options: ExportOptions,
  deps: BuildDependencies,
): Promise<Uint8Array> {
  const prepared = await prepareExport(book, options, deps);
  const exported = deps.now();
  const includeTitle = prepared.documents.some((document) => document.kind === "title");
  const includeNotes = prepared.documents.some((document) => document.kind === "notes");
  const notesTitle =
    prepared.navigation.find((entry) => entry.href === "notes.xhtml")?.title ?? null;
  const entries: Array<[string, string | Uint8Array]> = [
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", containerXml],
  ];
  entries.push([
    "OEBPS/content.opf",
    opf(
      {
        ...book,
        metadata: prepared.metadata,
        customCss: prepared.styles.find((style) => style.path === "custom.css")?.css ?? null,
      },
      prepared.chapters,
      prepared.images.map((image, i) => ({
        path: image.path,
        mediaType: image.output.mediaType,
        id: image.isCover ? "cover-image" : `image-${i + 1}`,
      })),
      includeTitle,
      exported,
      options.versionInTitle,
      includeNotes,
    ),
  ]);
  entries.push(
    [
      "OEBPS/nav.xhtml",
      navXhtml(prepared.chapters, includeTitle, prepared.metadata.title, notesTitle),
    ],
    [
      "OEBPS/toc.ncx",
      ncx(prepared.chapters, prepared.metadata.id, prepared.metadata.title, notesTitle),
    ],
  );
  for (const document of prepared.documents)
    entries.push([`OEBPS/${document.path}`, document.xhtml]);
  for (const style of prepared.styles) entries.push([`OEBPS/${style.path}`, style.css]);
  for (const image of prepared.images) entries.push([`OEBPS/${image.path}`, image.output.bytes]);
  deps.onProgress?.({ stage: "zip", done: 0, total: entries.length });
  check(deps.signal);
  const result = await makeZip(entries);
  check(deps.signal);
  deps.onProgress?.({ stage: "zip", done: entries.length, total: entries.length });
  return result;
}
