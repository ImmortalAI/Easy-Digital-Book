// Independent test-only PalmDB reader. It does not use writer primitives.
export function readPalmDb(bytes: Uint8Array) {
  if (bytes.length < 80) throw new Error("Truncated PalmDB header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(76);
  const first = 80 + count * 8;
  if (count === 0 || first > bytes.length) throw new Error("Invalid record list");
  const descriptors = Array.from({ length: count }, (_, i) => {
    const p = 78 + i * 8;
    return {
      offset: view.getUint32(p),
      flags: bytes[p + 4]!,
      uid: view.getUint32(p + 4) & 0xffffff,
    };
  });
  for (let i = 0; i < descriptors.length; i++) {
    const offset = descriptors[i]!.offset;
    if (offset < first || offset > bytes.length || (i > 0 && offset < descriptors[i - 1]!.offset))
      throw new Error("Invalid record offset");
  }
  const nameEnd = bytes.subarray(0, 32).indexOf(0);
  return {
    name: new TextDecoder().decode(bytes.subarray(0, nameEnd < 0 ? 32 : nameEnd)),
    created: view.getUint32(36),
    modified: view.getUint32(40),
    seed: view.getUint32(68),
    descriptors,
    records: descriptors.map(({ offset }, i) =>
      bytes.slice(offset, descriptors[i + 1]?.offset ?? bytes.length),
    ),
  };
}
