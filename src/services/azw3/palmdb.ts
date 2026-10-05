import { AppError } from "@/types/errors";
import { writeUint16BE, writeUint24BE, writeUint32BE } from "./binary";

const PALM_EPOCH = Date.UTC(1904, 0, 1);
const COPY_BATCH_BYTES = 1024 * 1024;
export interface PalmDbControl {
  signal?: AbortSignal;
  yieldControl?: () => Promise<void>;
}

function* writePalmDbSteps(
  records: readonly Uint8Array[],
  name: string,
  options: { created: Date },
): Generator<void, Uint8Array, void> {
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
  for (const [i, record] of records.entries()) {
    length += record.length;
    if (length > 0xffffffff)
      throw new AppError("export.azw3Limit", "PalmDB exceeds u32 file size", { length });
    if ((i + 1) % 128 === 0) yield;
  }

  // Allocation is one synchronous operation; subsequent descriptor and payload
  // copies are cooperative so a cancelled large export never returns its buffer.
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode(name.replace(/[^ -~]/g, "_").slice(0, 31)));
  writeUint32BE(bytes, 36, timestamp);
  writeUint32BE(bytes, 40, timestamp);
  bytes.set(new TextEncoder().encode("BOOKMOBI"), 60);
  writeUint32BE(bytes, 68, 2 * count - 1);
  writeUint16BE(bytes, 76, count);
  let offset = 80 + count * 8;
  let copiedSinceYield = 0;
  for (const [ordinal, record] of records.entries()) {
    const descriptor = 78 + ordinal * 8;
    writeUint32BE(bytes, descriptor, offset);
    writeUint24BE(bytes, descriptor + 5, 2 * ordinal);
    for (let start = 0; start < record.length; start += COPY_BATCH_BYTES) {
      const end = Math.min(start + COPY_BATCH_BYTES, record.length);
      bytes.set(record.subarray(start, end), offset + start);
      copiedSinceYield += end - start;
      if (copiedSinceYield >= COPY_BATCH_BYTES) {
        copiedSinceYield = 0;
        yield;
      }
    }
    offset += record.length;
    if ((ordinal + 1) % 128 === 0) yield;
  }
  return bytes;
}

function complete<T>(steps: Generator<void, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Deterministic synchronous BOOK/MOBI container; retained for existing callers/tests. */
export function writePalmDb(
  records: readonly Uint8Array[],
  name: string,
  options: { created: Date },
): Uint8Array {
  return complete(writePalmDbSteps(records, name, options));
}

/** Cancellable assembler used for export; allocates once, then yields per 1 MiB copied. */
export async function writePalmDbAsync(
  records: readonly Uint8Array[],
  name: string,
  options: { created: Date },
  control: PalmDbControl = {},
): Promise<Uint8Array> {
  const cancelled = () => {
    if (control.signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
  };
  const steps = writePalmDbSteps(records, name, options);
  cancelled();
  let step = steps.next();
  while (!step.done) {
    cancelled();
    await control.yieldControl?.();
    cancelled();
    step = steps.next();
  }
  return step.value;
}
