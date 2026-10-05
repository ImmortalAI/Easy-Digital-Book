import { AppError } from "@/types/errors";
import { writeUint16BE, writeUint32BE } from "./binary";
import type { HeaderInput } from "./types";

export type { HeaderInput } from "./types";

const encoder = new TextEncoder();
const NULL = 0xffffffff;
const EXTH_OFFSET = 280;

function invalid(message: string, details?: unknown): never {
  throw new AppError("export.invalidMetadata", message, details);
}
function limit(message: string, details?: unknown): never {
  throw new AppError("export.azw3Limit", message, details);
}
function uuidParts(value: string): { uuid: string; uid: number } {
  const uuid = value.replace(/^urn:uuid:/i, "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    invalid("Book identifier must be a canonical UUID", { id: value });
  }
  return { uuid: uuid.toLowerCase(), uid: Number.parseInt(uuid.slice(0, 8), 16) };
}

const languageCodes: Readonly<Record<string, number>> = {
  en: 0x09,
  ru: 0x19,
  zh: 0x04,
  ja: 0x11,
  ko: 0x12,
  de: 0x07,
  fr: 0x0c,
  es: 0x0a,
  it: 0x10,
  pt: 0x16,
  uk: 0x22,
  pl: 0x15,
  ar: 0x01,
  he: 0x0d,
  hi: 0x39,
};
const exactLocales: Readonly<Record<string, number>> = {
  "en-US": 0x0409,
  "en-GB": 0x0809,
  "en-AU": 0x0c09,
  "en-CA": 0x1009,
  "zh-CN": 0x0804,
  "zh-SG": 0x1004,
  "zh-TW": 0x0404,
  "zh-HK": 0x0c04,
  "de-DE": 0x0407,
  "de-CH": 0x0807,
  "de-AT": 0x0c07,
  "fr-FR": 0x040c,
  "fr-CA": 0x0c0c,
  "es-ES": 0x040a,
  "es-MX": 0x080a,
  "it-IT": 0x0410,
  "pt-BR": 0x0416,
  "pt-PT": 0x0816,
  "ru-RU": 0x0419,
  "ja-JP": 0x0411,
  "ko-KR": 0x0412,
};
function mobiLanguage(tag: string): number {
  let canonical = tag;
  try {
    canonical = Intl.getCanonicalLocales(tag)[0] ?? tag;
  } catch {
    return 0;
  }
  if (exactLocales[canonical] !== undefined) return exactLocales[canonical]!;
  const parts = canonical.split("-");
  const base = parts[0]!.toLowerCase();
  if (base === "zh") {
    const script = parts.find((part) => part.length === 4)?.toLowerCase();
    if (script === "hans") return 0x0804;
    if (script === "hant") return 0x0404;
  }
  return languageCodes[base] ?? 0;
}
function canonicalLanguage(tag: string): string {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? invalid("Book language tag is empty");
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    return invalid("Book language must be a valid BCP 47 tag", { language: tag });
  }
}

function assertU32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > NULL)
    limit(`${name} is outside u32`, { value });
}
function roleIndex(indices: ReadonlyMap<string, number>, key: string, required = false): number {
  const value = indices.get(key);
  if (value === undefined) {
    if (required) invalid(`Missing required AZW3 record index: ${key}`);
    return NULL;
  }
  assertU32(value, key);
  return value;
}
function pushExthString(
  entries: Array<{ type: number; payload: Uint8Array }>,
  type: number,
  value: string | null,
): void {
  if (value !== null && value !== "") entries.push({ type, payload: encoder.encode(value) });
}
function pushExthInteger(
  entries: Array<{ type: number; payload: Uint8Array }>,
  type: number,
  value: number,
): void {
  assertU32(value, `EXTH ${type}`);
  const payload = new Uint8Array(4);
  writeUint32BE(payload, 0, value);
  entries.push({ type, payload });
}
function exthBytes(input: HeaderInput, normalizedUuid: string): Uint8Array {
  const entries: Array<{ type: number; payload: Uint8Array }> = [];
  for (const author of input.metadata.authors)
    entries.push({ type: 100, payload: encoder.encode(author) });
  pushExthString(entries, 103, input.metadata.description);
  for (const translator of input.metadata.translators)
    entries.push({ type: 108, payload: encoder.encode(translator) });
  pushExthString(entries, 106, input.exportedAt.toISOString());
  pushExthString(entries, 112, input.metadata.id);
  pushExthString(entries, 113, normalizedUuid);
  pushExthInteger(entries, 125, input.resourceCount);
  if (input.coverIndex !== null) {
    pushExthInteger(entries, 201, input.coverIndex);
    if (input.thumbnailIndex !== null) pushExthInteger(entries, 202, input.thumbnailIndex);
    pushExthInteger(entries, 203, 0);
  }
  entries.push({ type: 501, payload: encoder.encode("EBOK") });
  pushExthString(entries, 503, input.displayTitle);
  entries.push({ type: 524, payload: encoder.encode(canonicalLanguage(input.metadata.language)) });

  let length = 12;
  for (const entry of entries) length += 8 + entry.payload.length;
  const bytes = new Uint8Array(Math.ceil(length / 4) * 4);
  bytes.set(encoder.encode("EXTH"), 0);
  writeUint32BE(bytes, 4, length);
  writeUint32BE(bytes, 8, entries.length);
  let offset = 12;
  for (const entry of entries) {
    writeUint32BE(bytes, offset, entry.type);
    writeUint32BE(bytes, offset + 4, entry.payload.length + 8);
    bytes.set(entry.payload, offset + 8);
    offset += entry.payload.length + 8;
  }
  return bytes;
}

function validateInput(input: HeaderInput): { uuid: string; uid: number } {
  const identity = uuidParts(input.metadata.id);
  canonicalLanguage(input.metadata.language);
  for (const [value, name] of [
    [input.textLength, "textLength"],
    [input.textRecordCount, "textRecordCount"],
    [input.resourceCount, "resourceCount"],
    [input.flowCount, "flowCount"],
  ] as const)
    assertU32(value, name);
  if (input.textRecordCount > 65535 || input.textRecordCount < 1)
    limit("PalmDOC text record count must be 1..65535");
  if (input.resourceCount > 65535) limit("Resource record count exceeds PalmDB limit");
  if (input.flowCount < 1) limit("AZW3 must contain at least one flow");
  if (!(input.exportedAt instanceof Date) || Number.isNaN(input.exportedAt.getTime()))
    invalid("Invalid export timestamp");
  if ((input.resourceCount === 0) !== (input.recordIndices.has("firstResource") === false)) {
    invalid("First resource record index must be present exactly when resources exist");
  }
  for (const [index, name] of [
    [input.coverIndex, "coverIndex"],
    [input.thumbnailIndex, "thumbnailIndex"],
  ] as const) {
    if (index !== null && (!Number.isInteger(index) || index < 0 || index >= input.resourceCount)) {
      invalid(`${name} must address an existing resource`, {
        index,
        resourceCount: input.resourceCount,
      });
    }
  }
  if (input.thumbnailIndex !== null && input.coverIndex === null)
    invalid("A thumbnail requires a cover");
  const ncx = input.recordIndices.has("ncx");
  for (const key of ["skel", "frag", "fdst", "flis", "fcis"])
    roleIndex(input.recordIndices, key, true);
  if (ncx) roleIndex(input.recordIndices, "ncx");
  roleIndex(input.recordIndices, "firstResource");
  roleIndex(input.recordIndices, "guide");
  return identity;
}

/** Build PalmDOC + 264-byte MOBI v8 header, padded EXTH and UTF-8 title. */
export function buildRecordZero(input: HeaderInput): Uint8Array {
  const { uuid, uid } = validateInput(input);
  const exth = exthBytes(input, uuid);
  const title = encoder.encode(input.displayTitle);
  const bytes = new Uint8Array(EXTH_OFFSET + exth.length + title.length);
  writeUint16BE(bytes, 0, 2);
  writeUint32BE(bytes, 4, input.textLength);
  writeUint16BE(bytes, 8, input.textRecordCount);
  writeUint16BE(bytes, 10, 4096);
  bytes.set(encoder.encode("MOBI"), 16);
  writeUint32BE(bytes, 20, 264);
  writeUint32BE(bytes, 24, 2);
  writeUint32BE(bytes, 28, 65001);
  writeUint32BE(bytes, 32, uid);
  writeUint32BE(bytes, 36, 8);
  for (let offset = 40; offset <= 76; offset += 4) writeUint32BE(bytes, offset, NULL);
  writeUint32BE(bytes, 80, input.textRecordCount + 1);
  writeUint32BE(bytes, 84, EXTH_OFFSET + exth.length);
  writeUint32BE(bytes, 88, title.length);
  writeUint32BE(bytes, 92, mobiLanguage(input.metadata.language));
  writeUint32BE(bytes, 104, 8);
  writeUint32BE(
    bytes,
    108,
    input.resourceCount ? roleIndex(input.recordIndices, "firstResource", true) : NULL,
  );
  writeUint32BE(bytes, 128, 0x50);
  writeUint32BE(bytes, 164, NULL);
  writeUint32BE(bytes, 168, NULL);
  writeUint32BE(bytes, 192, roleIndex(input.recordIndices, "fdst", true));
  writeUint32BE(bytes, 196, input.flowCount);
  writeUint32BE(bytes, 200, roleIndex(input.recordIndices, "fcis", true));
  writeUint32BE(bytes, 204, 1);
  writeUint32BE(bytes, 208, roleIndex(input.recordIndices, "flis", true));
  writeUint32BE(bytes, 212, 1);
  writeUint32BE(bytes, 224, NULL);
  writeUint32BE(bytes, 228, 0);
  writeUint32BE(bytes, 232, NULL);
  writeUint32BE(bytes, 236, NULL);
  writeUint32BE(bytes, 240, input.recordIndices.has("ncx") ? 3 : 1);
  writeUint32BE(bytes, 244, roleIndex(input.recordIndices, "ncx"));
  writeUint32BE(bytes, 248, roleIndex(input.recordIndices, "frag", true));
  writeUint32BE(bytes, 252, roleIndex(input.recordIndices, "skel", true));
  writeUint32BE(bytes, 256, NULL); // DATP is omitted by the supported PalmDOC profile.
  writeUint32BE(bytes, 260, roleIndex(input.recordIndices, "guide"));
  writeUint32BE(bytes, 264, NULL);
  writeUint32BE(bytes, 268, 0);
  writeUint32BE(bytes, 272, NULL);
  writeUint32BE(bytes, 276, 0);
  bytes.set(exth, EXTH_OFFSET);
  bytes.set(title, EXTH_OFFSET + exth.length);
  return bytes;
}
