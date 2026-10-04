import type { Book } from "@/types/book";
import type { RenderedChapter } from "./chapter";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
export function opf(
  book: Book,
  chapters: RenderedChapter[],
  resources: Array<{ path: string; mediaType: string; id: string }>,
  includeTitle: boolean,
  exported: Date,
  versionInTitle: boolean,
  includeNotes = false,
): string {
  const m = book.metadata;
  const title = versionInTitle && m.version ? `${m.title} (${m.version})` : m.title;
  const creators = m.authors
    .map(
      (a, i) =>
        `<dc:creator id="creator-${i}">${esc(a)}</dc:creator><meta property="role" refines="#creator-${i}" scheme="marc:relators">aut</meta>`,
    )
    .join("");
  const contributors = m.translators
    .map(
      (a, i) =>
        `<dc:contributor id="translator-${i}">${esc(a)}</dc:contributor><meta property="role" refines="#translator-${i}" scheme="marc:relators">trl</meta>`,
    )
    .join("");
  const series = m.series
    ? `<meta id="series" property="belongs-to-collection">${esc(m.series.name)}</meta><meta property="collection-type" refines="#series">series</meta><meta property="group-position" refines="#series">${m.series.index}</meta><meta name="calibre:series" content="${esc(m.series.name)}"/><meta name="calibre:series_index" content="${m.series.index}"/>`
    : "";
  const coverId = resources.find((r) => r.id === "cover-image")?.id;
  const cover = coverId ? `<meta name="cover" content="${coverId}"/>` : "";
  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    includeTitle
      ? `<item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>`
      : "",
    `<item id="theme" href="theme.css" media-type="text/css"/>`,
    book.customCss ? `<item id="custom" href="custom.css" media-type="text/css"/>` : "",
    ...chapters.map(
      (_, i) =>
        `<item id="chapter-${i + 1}" href="c-${chapters[i]!.id}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
    includeNotes ? `<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>` : "",
    ...resources.map(
      (r) =>
        `<item id="${r.id}" href="${esc(r.path)}" media-type="${r.mediaType}"${r.id === "cover-image" ? ' properties="cover-image"' : ""}/>`,
    ),
  ]
    .filter(Boolean)
    .join("");
  const spine = `${includeTitle ? '<itemref idref="title-page"/>' : ""}${chapters.map((_, i) => `<itemref idref="chapter-${i + 1}"/>`).join("")}${includeNotes ? '<itemref idref="notes"/>' : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${esc(m.id)}</dc:identifier><dc:title>${esc(title)}</dc:title>${creators}${contributors}<dc:language>${esc(m.language)}</dc:language>${m.description ? `<dc:description>${esc(m.description)}</dc:description>` : ""}<meta property="dcterms:modified">${exported.toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>${series}${cover}</metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`;
}
