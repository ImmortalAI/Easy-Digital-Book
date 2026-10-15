import JSZip from "jszip";

/** Zip entry that carries the project inside an exported EPUB: container root, not in the OPF. */
export const EMBEDDED_PROJECT_ENTRY = "project.edb";

export type BookContainer = "epub" | "azw3";
export interface EmbeddedProjectLookup {
  /** The book format recognised from the bytes; `null` when they are not an exported book. */
  container: BookContainer | null;
  /** The embedded `.edb` bytes; `null` when the book carries none. */
  project: Uint8Array | null;
}

const NOT_A_BOOK: EmbeddedProjectLookup = { container: null, project: null };
const NULL_INDEX = 0xffffffff;
const SRCS_HEADER_LENGTH = 16;
// Offsets from the start of record 0.
const MOBI_MAGIC_OFFSET = 16;
const SRCS_INDEX_OFFSET = 224;
const SRCS_COUNT_OFFSET = 228;

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** Record boundaries of a PalmDB file, or `null` when the record list is inconsistent. */
function palmRecords(bytes: Uint8Array): Array<{ start: number; end: number }> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(76);
  const first = 78 + count * 8;
  if (count < 1 || first > bytes.length) return null;
  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = view.getUint32(78 + i * 8);
    if (start < first || start > bytes.length || (i > 0 && start < starts[i - 1]!)) return null;
    starts.push(start);
  }
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? bytes.length }));
}

function projectFromPalm(bytes: Uint8Array): Uint8Array | null {
  const records = palmRecords(bytes);
  if (!records) return null;
  const zero = bytes.subarray(records[0]!.start, records[0]!.end);
  if (zero.length < SRCS_COUNT_OFFSET + 4 || !hasAscii(zero, MOBI_MAGIC_OFFSET, "MOBI"))
    return null;
  const view = new DataView(zero.buffer, zero.byteOffset, zero.byteLength);
  // A shorter MOBI header ends before the SRCS fields; those bytes are then EXTH data.
  if (view.getUint32(20) < SRCS_COUNT_OFFSET + 4 - MOBI_MAGIC_OFFSET) return null;
  const index = view.getUint32(SRCS_INDEX_OFFSET);
  if (index === NULL_INDEX || index === 0 || view.getUint32(SRCS_COUNT_OFFSET) === 0) return null;
  const record = records[index];
  if (!record) return null;
  const srcs = bytes.subarray(record.start, record.end);
  if (srcs.length < SRCS_HEADER_LENGTH || !hasAscii(srcs, 0, "SRCS")) return null;
  return srcs.slice(SRCS_HEADER_LENGTH);
}

async function lookupZip(bytes: Uint8Array): Promise<EmbeddedProjectLookup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
    const mimetype = await zip.file("mimetype")?.async("string");
    // Some tools end the entry with a newline.
    if (mimetype?.trim() !== "application/epub+zip") return NOT_A_BOOK;
  } catch {
    return NOT_A_BOOK;
  }
  try {
    const entry = zip.file(EMBEDDED_PROJECT_ENTRY);
    return { container: "epub", project: entry ? await entry.async("uint8array") : null };
  } catch {
    return { container: "epub", project: null };
  }
}

/**
 * Recognise an exported book by its bytes (never by file extension) and return
 * the project embedded in it. Truncated or inconsistent input yields `null`
 * fields; this never throws.
 */
export async function findEmbeddedProject(bytes: Uint8Array): Promise<EmbeddedProjectLookup> {
  if (bytes.length >= 78 && hasAscii(bytes, 60, "BOOKMOBI")) {
    try {
      return { container: "azw3", project: projectFromPalm(bytes) };
    } catch {
      return { container: "azw3", project: null };
    }
  }
  if (hasAscii(bytes, 0, "PK")) return lookupZip(bytes);
  return NOT_A_BOOK;
}

/** The embedded `.edb` bytes of an exported EPUB or AZW3, or `null`. */
export async function extractEmbeddedProject(bytes: Uint8Array): Promise<Uint8Array | null> {
  return (await findEmbeddedProject(bytes)).project;
}
