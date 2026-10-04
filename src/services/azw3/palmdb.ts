import { AppError } from "@/types/errors";
import { writeUint16BE, writeUint24BE, writeUint32BE } from "./binary";

const PALM_EPOCH = Date.UTC(1904, 0, 1);

/** Deterministic BOOK/MOBI container; records may exceed the legacy 64 KiB limit. */
export function writePalmDb(
  records: readonly Uint8Array[],
  name: string,
  options: { created: Date },
): Uint8Array {
  const count = records.length;
  if (count < 1 || count > 65535) {
    throw new AppError("export.azw3Limit", "PalmDB requires 1..65535 records", { count });
  }
  const timestamp = Math.floor((options.created.getTime() - PALM_EPOCH) / 1000);
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffff) {
    throw new AppError("export.azw3Limit", "Creation date is outside the Palm epoch", {
      timestamp,
    });
  }
  let length = 80 + count * 8;
  for (const record of records) {
    length += record.length;
    if (length > 0xffffffff)
      throw new AppError("export.azw3Limit", "PalmDB exceeds u32 file size", { length });
  }
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode(name.replace(/[^ -~]/g, "_").slice(0, 31)));
  writeUint32BE(bytes, 36, timestamp);
  writeUint32BE(bytes, 40, timestamp);
  bytes.set(new TextEncoder().encode("BOOKMOBI"), 60);
  writeUint32BE(bytes, 68, 2 * count - 1);
  writeUint16BE(bytes, 76, count);
  let offset = 80 + count * 8;
  records.forEach((record, ordinal) => {
    const descriptor = 78 + ordinal * 8;
    writeUint32BE(bytes, descriptor, offset);
    writeUint24BE(bytes, descriptor + 5, 2 * ordinal);
    bytes.set(record, offset);
    offset += record.length;
  });
  return bytes;
}
