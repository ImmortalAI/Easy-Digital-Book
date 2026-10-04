import type { RenderedChapter } from "./chapter";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
export function ncx(
  chapters: RenderedChapter[],
  uid: string,
  title: string,
  notesTitle: string | null = null,
): string {
  const points = chapters
    .map(
      (c, i) =>
        `<navPoint id="navPoint-${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="c-${esc(c.id)}.xhtml"/></navPoint>`,
    )
    .join("");
  const notesPoint = notesTitle
    ? `<navPoint id="navPoint-notes" playOrder="${chapters.length + 1}"><navLabel><text>${esc(notesTitle)}</text></navLabel><content src="notes.xhtml"/></navPoint>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(uid)}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${points}${notesPoint}</navMap></ncx>`;
}
