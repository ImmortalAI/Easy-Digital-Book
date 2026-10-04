import { expect } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import type { TextLayout } from "../types";
import type { PreparedExport } from "@/services/export/types";
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(b);
export const document = (path: string, body: string): PreparedExport["documents"][number] => ({
  path,
  kind: "chapter",
  xhtml: `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>T</title></head><body>${body}</body></html>`,
});
// Reader uses only physical stream bytes and the documented insertion geometry.
export function reconstruct(layout: TextLayout): Uint8Array[] {
  return layout.skeletons.map((skel) => {
    let result = layout.text.slice(
      skel.physicalStart,
      skel.physicalStart + skel.skeletonByteLength,
    );
    for (const frag of layout.fragments.filter((f) => f.fileIndex === skel.fileIndex)) {
      const offset = frag.insertionOffset - skel.reconstructedStart;
      const start = skel.physicalStart + skel.skeletonByteLength + frag.fragmentStart;
      const bytes = layout.text.slice(start, start + frag.byteLength);
      expect(bytes).toEqual(frag.bytes);
      const joined = new Uint8Array(result.length + bytes.length);
      joined.set(result.subarray(0, offset));
      joined.set(bytes, offset);
      joined.set(result.subarray(offset), offset + bytes.length);
      result = joined;
    }
    expect(result.length).toBe(skel.reconstructedLength);
    expect(XMLValidator.validate(decode(result))).toBe(true);
    return result;
  });
}
