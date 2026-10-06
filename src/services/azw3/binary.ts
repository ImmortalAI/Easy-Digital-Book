import { AppError } from "@/types/errors";

function checkWrite(bytes: Uint8Array, offset: number, value: number, width: number): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value >= 2 ** (width * 8) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > bytes.length - width
  ) {
    throw new AppError("export.azw3Limit", "Unsigned binary field is out of range", {
      offset,
      value,
      width,
    });
  }
}

export function writeUint16BE(bytes: Uint8Array, offset: number, value: number): void {
  checkWrite(bytes, offset, value, 2);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value);
}

export function writeUint24BE(bytes: Uint8Array, offset: number, value: number): void {
  checkWrite(bytes, offset, value, 3);
  bytes[offset] = value >>> 16;
  bytes[offset + 1] = value >>> 8;
  bytes[offset + 2] = value;
}

export function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  checkWrite(bytes, offset, value, 4);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
}

function varUInt(value: number, backward: boolean): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new AppError("export.azw3Limit", "Variable-width integer is outside u32", { value });
  }
  const groups: number[] = [];
  do {
    groups.push(value % 128);
    value = Math.floor(value / 128);
  } while (value > 0);
  groups.reverse();
  const marker = backward ? 0 : groups.length - 1;
  groups[marker] = groups[marker]! | 0x80;
  return Uint8Array.from(groups);
}

/** BE 7-bit groups, with the last physical byte marked. */
export function encodeVarUInt(value: number): Uint8Array {
  return varUInt(value, false);
}
/** BE 7-bit groups, with the first physical byte marked; read from the end. */
export function encodeBackwardVarUInt(value: number): Uint8Array {
  return varUInt(value, true);
}
