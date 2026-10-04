import type { RenderedChapter } from "./chapter";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
export function navXhtml(
  chapters: RenderedChapter[],
  titlePage: boolean,
  title: string,
  notesTitle: string | null = null,
): string {
  const entries =
    chapters.map((c) => `<li><a href="c-${esc(c.id)}.xhtml">${esc(c.title)}</a></li>`).join("") +
    (notesTitle ? `<li><a href="notes.xhtml">${esc(notesTitle)}</a></li>` : "");
  const landmarks = `${titlePage ? '<li><a epub:type="titlepage" href="title.xhtml">Title page</a></li>' : ""}${chapters.length ? `<li><a epub:type="bodymatter" href="c-${esc(chapters[0]!.id)}.xhtml">Start</a></li>` : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc" id="toc"><h1>${esc(title)}</h1><ol>${entries}</ol></nav><nav epub:type="landmarks"><ol>${landmarks}</ol></nav></body></html>`;
}
