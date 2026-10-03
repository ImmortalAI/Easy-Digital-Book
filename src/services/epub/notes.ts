import { XMLValidator } from "fast-xml-parser";
import { AppError } from "@/types/errors";
import type { RenderedChapter } from "./chapter";
import { prependToFirstParagraph } from "./footnotes";
import { getLabels } from "./labels";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );

/** The endnotes page, or null when no chapter has a note. */
export function notesXhtml(
  chapters: RenderedChapter[],
  language: string,
  includeCustomCss: boolean,
): string | null {
  const withNotes = chapters.filter((chapter) => chapter.notes.length > 0);
  if (withNotes.length === 0) return null;
  const heading = getLabels(language).notes;
  const lang = esc(language || "en");
  const groups = withNotes
    .map((chapter) => {
      const href = `c-${esc(chapter.id)}.xhtml`;
      const notes = chapter.notes
        .map((note) => {
          const marker = note.referenced
            ? `<a class="endnote-backlink" href="${href}#fnref-${note.number}">${note.number}.</a> `
            : `<span class="endnote-number">${note.number}.</span> `;
          return `<div epub:type="endnote" class="endnote" id="fn-${note.number}">\n${prependToFirstParagraph(note.xhtml, marker)}\n</div>`;
        })
        .join("\n");
      return `<section class="endnotes-chapter"><h2><a href="${href}">${esc(chapter.title)}</a></h2>\n${notes}\n</section>`;
    })
    .join("\n");
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">\n<head><meta charset="UTF-8"/><title>${esc(heading)}</title><link rel="stylesheet" type="text/css" href="theme.css"/>${includeCustomCss ? '<link rel="stylesheet" type="text/css" href="custom.css"/>' : ""}</head>\n<body><section epub:type="endnotes" role="doc-endnotes"><h1>${esc(heading)}</h1>\n${groups}\n</section></body>\n</html>`;
  const validation = XMLValidator.validate(xhtml);
  if (validation !== true)
    throw new AppError(
      "export.invalidXhtml",
      `${heading}: invalid XHTML`,
      { line: validation.err.line, column: validation.err.col },
      { params: { chapter: 0, title: heading } },
    );
  return xhtml;
}
