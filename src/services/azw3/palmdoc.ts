import { AppError } from "@/types/errors";

const RECORD_SIZE = 4096;

export interface TextRecordPayload {
  /** Uncompressed payload only; concatenate these to restore the original byte stream. */
  bytes: Uint8Array;
  /** Uncompressed UTF-8 continuation bytes followed by their count (always present). */
  overlap: Uint8Array;
}

/** Deterministic greedy PalmDOC compressor with a fresh 2047-byte history per call. */
export function compressPalmDoc(input: Uint8Array): Uint8Array {
  if (input.length > RECORD_SIZE)
    throw new AppError("export.azw3Limit", "PalmDOC payload exceeds 4096 bytes", {
      length: input.length,
    });
  const output: number[] = [];
  const positions = new Map<number, number[]>();
  const keyAt = (i: number) => input[i]! * 65536 + input[i + 1]! * 256 + input[i + 2]!;
  const remember = (start: number, end: number) => {
    for (let i = start; i < end && i + 2 < input.length; i++) {
      const key = keyAt(i);
      const list = positions.get(key);
      if (list) list.push(i);
      else positions.set(key, [i]);
    }
  };
  let i = 0;
  while (i < input.length) {
    const start = i;
    let bestLength = 0;
    let bestDistance = 0;
    const maxLength = Math.min(10, input.length - i);
    const candidates = maxLength >= 3 ? positions.get(keyAt(i)) : undefined;
    if (candidates) {
      for (let j = candidates.length - 1; j >= 0; j--) {
        const previous = candidates[j]!;
        const distance = i - previous;
        if (distance > 2047) break;
        let length = 3;
        while (length < maxLength && input[previous + length] === input[i + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = distance;
        }
        if (bestLength === maxLength) break;
      }
    }
    if (bestLength >= 3) {
      const word = 0x8000 | (bestDistance << 3) | (bestLength - 3);
      output.push(word >>> 8, word & 255);
      i += bestLength;
    } else if (
      input[i] === 0x20 &&
      i + 1 < input.length &&
      input[i + 1]! >= 0x40 &&
      input[i + 1]! <= 0x7f
    ) {
      output.push(input[i + 1]! ^ 0x80);
      i += 2;
    } else if (input[i] === 0 || (input[i]! >= 9 && input[i]! <= 0x7f)) {
      output.push(input[i]!);
      i++;
    } else {
      // Reserved token bytes require an explicit literal-run prefix.
      i++;
      while (
        i < input.length &&
        i - start < 8 &&
        ((input[i]! >= 1 && input[i]! <= 8) || input[i]! >= 0x80)
      )
        i++;
      output.push(i - start, ...input.subarray(start, i));
    }
    remember(start, i);
  }
  return Uint8Array.from(output);
}

/** Split the raw UTF-8 stream. Overlap is a separate trailer, never part of compression. */
export function splitTextRecords(text: Uint8Array): TextRecordPayload[] {
  if (Math.ceil(text.length / RECORD_SIZE) > 65535)
    throw new AppError("export.azw3Limit", "Text requires more than 65535 records", {
      length: text.length,
    });
  const records: TextRecordPayload[] = [];
  for (let start = 0; start < text.length; start += RECORD_SIZE) {
    const end = Math.min(start + RECORD_SIZE, text.length);
    let continuationEnd = end;
    while (
      continuationEnd < text.length &&
      continuationEnd - end < 3 &&
      (text[continuationEnd]! & 0xc0) === 0x80
    )
      continuationEnd++;
    const count = continuationEnd - end;
    const overlap = new Uint8Array(count + 1);
    overlap.set(text.subarray(end, continuationEnd));
    overlap[count] = count;
    records.push({ bytes: text.slice(start, end), overlap });
  }
  return records;
}
