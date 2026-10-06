import { AppError } from "@/types/errors";
import { writeUint16BE, writeUint32BE } from "./binary";

function limit(message: string, details?: unknown): never {
  throw new AppError("export.azw3Limit", message, details);
}
function requireU32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    limit(`${name} is outside u32`, { value });
  }
}

/** Return the fixed FLIS, length-bearing FCIS, and EOF records. */
export function buildEndRecords(textLength: number, textRecordCount: number): Uint8Array[] {
  requireU32(textLength, "textLength");
  if (!Number.isInteger(textRecordCount) || textRecordCount < 1 || textRecordCount > 65535) {
    limit("PalmDOC text record count must be 1..65535", { textRecordCount });
  }
  const expectedCount = Math.ceil(textLength / 4096);
  if (expectedCount !== textRecordCount) {
    limit("Text record count is inconsistent with the 4096-byte PalmDOC record size", {
      textLength,
      textRecordCount,
      expectedCount,
    });
  }
  const flis = Uint8Array.from([
    0x46, 0x4c, 0x49, 0x53, 0, 0, 0, 8, 0, 0x41, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0, 1, 0,
    3, 0, 0, 0, 3, 0, 0, 0, 1, 0xff, 0xff, 0xff, 0xff,
  ]);
  const fcis = new Uint8Array(52);
  fcis.set([0x46, 0x43, 0x49, 0x53]);
  writeUint32BE(fcis, 4, 20);
  writeUint32BE(fcis, 8, 16);
  writeUint32BE(fcis, 12, 2);
  writeUint32BE(fcis, 20, textLength);
  writeUint32BE(fcis, 28, 40);
  writeUint32BE(fcis, 36, 40);
  writeUint32BE(fcis, 40, 8);
  writeUint16BE(fcis, 44, 1);
  writeUint16BE(fcis, 46, 1);
  return [flis, fcis, Uint8Array.from([0xe9, 0x8e, 0x0d, 0x0a])];
}
