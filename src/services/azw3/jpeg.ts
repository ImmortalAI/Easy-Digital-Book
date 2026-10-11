const ascii = (bytes: Uint8Array, start: number, text: string) =>
  [...text].every((char, index) => bytes[start + index] === char.charCodeAt(0));

/**
 * Calibre re-saves such JPEGs for Kindle: the MOBI renderer needs a JFIF APP0
 * segment, and images with EXIF are not shown on the cover screen.
 * Only the header segments before the scan data are inspected.
 */
export function jpegNeedsKindleCleanup(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let jfif = false;
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const payload = offset + 4;
    if (marker === 0xe0 && ascii(bytes, payload, "JFIF\0")) jfif = true;
    if (marker === 0xe1 && ascii(bytes, payload, "Exif\0\0")) return true;
    offset += 2 + length;
  }
  return !jfif;
}
