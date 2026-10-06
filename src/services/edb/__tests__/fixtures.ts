import JSZip from "jszip";

export async function archive(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, value] of Object.entries(files)) zip.file(path, value);
  return zip.generateAsync({ type: "uint8array" });
}

export const validBook = {
  format: "easy-digital-book",
  formatVersion: 2,
  book: {
    id: "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
    title: "Book",
    version: null,
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    language: "en",
    authors: ["Author"],
    translators: [],
    series: null,
    description: null,
    cover: null,
  },
  chapters: [{ id: "chapter1" }],
};

export function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ ...validBook, ...overrides });
}
