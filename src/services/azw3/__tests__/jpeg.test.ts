import { describe, expect, it } from "vitest";
import { jpegNeedsKindleCleanup } from "../jpeg";
import { jpeg } from "./fixtures";

const segment = (marker: number, payload: string) => {
  const bytes = new TextEncoder().encode(payload);
  return [0xff, marker, 0, bytes.length + 2, ...bytes];
};
const file = (...segments: number[][]) =>
  Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2, 0xff, 0xd9]);

describe("jpegNeedsKindleCleanup", () => {
  it("accepts a JFIF JPEG without EXIF", () => {
    expect(jpegNeedsKindleCleanup(file(segment(0xe0, "JFIF\0")))).toBe(false);
  });

  it("flags JPEGs without JFIF or with an EXIF segment", () => {
    expect(jpegNeedsKindleCleanup(file(segment(0xdb, "q")))).toBe(true);
    expect(jpegNeedsKindleCleanup(file(segment(0xe0, "JFIF\0"), segment(0xe1, "Exif\0\0")))).toBe(
      true,
    );
    expect(jpegNeedsKindleCleanup(jpeg)).toBe(true);
  });

  it("ignores APP1 XMP and markers after the scan starts", () => {
    expect(
      jpegNeedsKindleCleanup(file(segment(0xe0, "JFIF\0"), segment(0xe1, "http://ns.adobe.com/"))),
    ).toBe(false);
  });

  it("leaves non-JPEG and truncated data alone", () => {
    expect(jpegNeedsKindleCleanup(Uint8Array.from([0x89, 0x50]))).toBe(false);
    expect(jpegNeedsKindleCleanup(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });
});
