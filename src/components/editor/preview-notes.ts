import { renderToHTML, type NovLangDocument } from "novlang-js";
import {
  countFootnotes,
  extractFootnotes,
  prependToFirstParagraph,
  replaceNoteMarkers,
} from "@/services/epub/footnotes";

/** The same markup classes as notes.xhtml, so custom.css styles both alike. */
export function renderPreviewHtml(document: NovLangDocument, firstNumber: number): string {
  const extracted = extractFootnotes(document, firstNumber);
  const body = replaceNoteMarkers(
    renderToHTML(extracted.document),
    (n, first) =>
      `<sup><a class="noteref"${first ? ` id="fnref-${n}"` : ""} href="#fn-${n}">${n}</a></sup>`,
  );
  if (extracted.notes.length === 0) return body;
  const notes = extracted.notes
    .map((note) => {
      const marker = note.referenced
        ? `<a class="endnote-backlink" href="#fnref-${note.number}">${note.number}.</a> `
        : `<span class="endnote-number">${note.number}.</span> `;
      const html = renderToHTML({ type: "document", children: note.children });
      return `<div class="endnote" id="fn-${note.number}">\n${prependToFirstParagraph(html, marker)}\n</div>`;
    })
    .join("\n");
  return `${body}<section class="endnotes-chapter preview-notes">${notes}</section>`;
}

export function firstNoteNumber(
  chapterIds: string[],
  chapterId: string,
  documents: Map<string, { document: NovLangDocument }>,
): number {
  let number = 1;
  for (const id of chapterIds) {
    if (id === chapterId) break;
    const parsed = documents.get(id);
    if (parsed) number += countFootnotes(parsed.document);
  }
  return number;
}
