import type { PreparedExport } from "@/services/export/types";
import { AppError } from "@/types/errors";
import { concatBytes } from "@/utils/bytes";
import { encodeBackwardVarUInt, encodeVarUInt, writeUint16BE, writeUint32BE } from "./binary";
import { linkTarget, requirePosition } from "./links";
import type { TextLayout } from "./types";

const utf8 = new TextEncoder();
const HEADER = 192;
const BUDGET = 60 * 1024;
const align4 = (length: number) => Math.ceil(length / 4) * 4;
const descriptors = {
  skel: [1, 1, 3, 0, 6, 2, 12, 0],
  frag: [2, 1, 1, 0, 3, 1, 2, 0, 4, 1, 4, 0, 6, 2, 8, 0],
  ncx: [
    1, 1, 1, 0, 2, 1, 2, 0, 3, 1, 4, 0, 4, 1, 8, 0, 21, 1, 16, 0, 22, 1, 32, 0, 23, 1, 64, 0, 6, 2,
    128, 0,
  ],
};
type Row = { key: string; control: number; values: number[] };
type Section = { start: number; end: number };

function limit(message: string): never {
  throw new AppError("export.azw3Limit", message);
}
function padded(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(align4(bytes.length));
  result.set(bytes);
  return result;
}
function keyBytes(key: string): Uint8Array {
  const bytes = utf8.encode(key);
  if (bytes.length > 255) limit("INDX key exceeds 255 UTF-8 bytes");
  return concatBytes(Uint8Array.of(bytes.length), bytes);
}

/** CNCX addresses reserve a 64 KiB address space for every physical string record. */
class Strings {
  private addresses = new Map<string, number>();
  private completed: Uint8Array[] = [];
  private parts: Uint8Array[] = [];
  private length = 0;

  add(value: string): number {
    const existing = this.addresses.get(value);
    if (existing !== undefined) return existing;
    const bytes = utf8.encode(value);
    const entry = concatBytes(encodeVarUInt(bytes.length), bytes);
    if (align4(entry.length) >= 65536) limit("CNCX string cannot fit in one record");
    if (this.length && align4(this.length + entry.length) > BUDGET) this.flush();
    const address = this.completed.length * 65536 + this.length;
    // Validate before recording an address that could exceed the u32 VWI domain.
    encodeVarUInt(address);
    this.addresses.set(value, address);
    this.parts.push(entry);
    this.length += entry.length;
    return address;
  }

  private flush(): void {
    this.completed.push(padded(concatBytes(...this.parts)));
    this.parts = [];
    this.length = 0;
  }
  records(): Uint8Array[] {
    if (this.length) this.flush();
    return this.completed;
  }
}

function indexRecord(entries: Uint8Array[], table?: Uint8Array): Uint8Array {
  const prefixLength = HEADER + (table?.length ?? 0);
  const entriesLength = entries.reduce((sum, bytes) => sum + bytes.length, 0);
  const idxt = align4(prefixLength + entriesLength);
  const size = idxt + align4(4 + entries.length * 2);
  if (size >= 65536) limit("INDX record exceeds its 16-bit address space");
  const record = new Uint8Array(size);
  record.set(utf8.encode("INDX"));
  writeUint32BE(record, 4, HEADER);
  writeUint32BE(record, 12, table ? 0 : 1);
  writeUint32BE(record, 16, table ? 2 : 0);
  writeUint32BE(record, 20, idxt);
  writeUint32BE(record, 24, entries.length);
  writeUint32BE(record, 28, table ? 65001 : 0xffffffff);
  writeUint32BE(record, 32, 0xffffffff);
  if (table) {
    writeUint32BE(record, 180, HEADER);
    record.set(table, HEADER);
  }
  record.set(utf8.encode("IDXT"), idxt);
  let offset = prefixLength;
  for (const [i, entry] of entries.entries()) {
    writeUint16BE(record, idxt + 4 + i * 2, offset);
    record.set(entry, offset);
    offset += entry.length;
  }
  return record;
}

function family(
  kind: keyof typeof descriptors,
  rows: Row[],
  strings = new Strings(),
): Uint8Array[] {
  const table = new Uint8Array(16 + descriptors[kind].length);
  table.set(utf8.encode("TAGX"));
  writeUint32BE(table, 4, table.length);
  writeUint32BE(table, 8, 1);
  table.set(descriptors[kind], 12);
  table[table.length - 1] = 1;
  const data: Uint8Array[] = [];
  const geometry: Uint8Array[] = [];
  let entries: Uint8Array[] = [];
  let entryLength = 0;
  let lastKey = "";
  const flush = () => {
    data.push(indexRecord(entries));
    const count = new Uint8Array(2);
    writeUint16BE(count, 0, entries.length);
    geometry.push(concatBytes(keyBytes(lastKey), count));
    entries = [];
    entryLength = 0;
  };
  for (const row of rows) {
    const entry = concatBytes(
      keyBytes(row.key),
      Uint8Array.of(row.control),
      ...row.values.map(encodeVarUInt),
    );
    const eventualSize =
      align4(HEADER + entryLength + entry.length) + align4(4 + (entries.length + 1) * 2);
    if (entries.length && eventualSize > BUDGET) flush();
    entries.push(entry);
    entryLength += entry.length;
    lastKey = row.key;
  }
  if (entries.length || !data.length) flush();
  const cncx = strings.records();
  const meta = indexRecord(geometry, table);
  writeUint32BE(meta, 36, rows.length);
  writeUint32BE(meta, 52, cncx.length);
  return [meta, ...data, ...cncx];
}

/** Complete trailers, including the backward VWI length, appended after UTF-8 overlap. */
function textTrailers(sections: Section[], lengths: readonly number[]): Uint8Array[] {
  let start = 0;
  let first = 0;
  return lengths.map((length) => {
    const end = start + length;
    while (first < sections.length && sections[first]!.end <= start) first++;
    const overlapping: number[] = [];
    for (let i = first; i < sections.length && sections[i]!.start < end; i++) {
      if (sections[i]!.end > start && sections[i]!.end > sections[i]!.start) overlapping.push(i);
    }
    if (overlapping.length > 255)
      limit(
        "Supported flat TBS profile allows at most 255 overlapping navigation entries per text record",
      );
    let payload: Uint8Array = new Uint8Array();
    if (overlapping.length) {
      const ordinal = overlapping[0]!;
      const last = overlapping.at(-1)!;
      if (last - ordinal + 1 !== overlapping.length)
        limit("TBS navigation entries must form a contiguous ordinal range");
      const span = sections[last]!.start < start && sections[last]!.end > end;
      const multiple = overlapping.length > 1;
      const flags = 2 + (multiple ? 4 : 0) + (span ? 1 : 0);
      payload = concatBytes(
        encodeVarUInt(ordinal * 8 + flags),
        encodeVarUInt(8),
        multiple ? Uint8Array.of(overlapping.length) : new Uint8Array(),
        span ? encodeVarUInt(0) : new Uint8Array(),
      );
    }
    let total = payload.length + 1;
    while (payload.length + encodeBackwardVarUInt(total).length !== total)
      total = payload.length + encodeBackwardVarUInt(total).length;
    start = end;
    return concatBytes(payload, encodeBackwardVarUInt(total));
  });
}

export function buildIndexes(
  layout: TextLayout,
  navigation: PreparedExport["navigation"],
  textRecordPayloadLengths: readonly number[],
): {
  skel: Uint8Array[];
  frag: Uint8Array[];
  ncx: Uint8Array[];
  fdst: Uint8Array;
  tbs: Uint8Array[];
} {
  if (
    textRecordPayloadLengths.some(
      (length) => !Number.isInteger(length) || length < 1 || length > 4096,
    ) ||
    textRecordPayloadLengths.reduce((sum, length) => sum + length, 0) !== layout.text.length
  )
    limit(
      "Text record payload lengths must cover the uncompressed stream with 1..4096-byte records",
    );
  const fdst = new Uint8Array(12 + layout.flows.length * 8);
  fdst.set(utf8.encode("FDST"));
  writeUint32BE(fdst, 4, 12);
  writeUint32BE(fdst, 8, layout.flows.length);
  let flowEnd = 0;
  for (const [i, flow] of layout.flows.entries()) {
    if (flow.start !== flowEnd || flow.end < flow.start)
      limit("FDST flows must be ordered and contiguous");
    writeUint32BE(fdst, 12 + i * 8, flow.start);
    writeUint32BE(fdst, 16 + i * 8, flow.end);
    flowEnd = flow.end;
  }
  if (!layout.flows.length || flowEnd !== layout.text.length)
    limit("FDST flows must cover the uncompressed stream");
  const skel = family(
    "skel",
    layout.skeletons.map((skeleton) => ({
      key: skeleton.key,
      control: 0x0a,
      values: [
        skeleton.fragmentCount,
        skeleton.fragmentCount,
        skeleton.physicalStart,
        skeleton.skeletonByteLength,
        skeleton.physicalStart,
        skeleton.skeletonByteLength,
      ],
    })),
  );
  const selectors = new Strings();
  const frag = family(
    "frag",
    layout.fragments.map((fragment) => ({
      key: String(fragment.insertionOffset).padStart(10, "0"),
      control: 0x0f,
      values: [
        selectors.add(fragment.selector),
        fragment.fileIndex,
        fragment.globalFragmentIndex,
        fragment.fragmentStart,
        fragment.byteLength,
      ],
    })),
    selectors,
  );
  const labels = new Strings();
  const positions = navigation.map((entry) => {
    const target = linkTarget("", entry.href);
    if (target === null)
      throw new AppError("export.azw3Link", "Navigation target must be internal", {
        href: entry.href,
      });
    return requirePosition(layout.positions, target);
  });
  const sections = positions.map((position, i) => ({
    start: position.reconstructedOffset,
    end: positions[i + 1]?.reconstructedOffset ?? layout.flows[0]!.end,
  }));
  const rows = positions.map((position, i) => {
    const section = sections[i]!;
    if (section.start < 0 || section.end < section.start || section.end > layout.flows[0]!.end)
      limit("NCX sections must be in reading order inside HTML flow0");
    const fragment = layout.fragments[position.fid];
    if (!fragment || position.offset < 0 || position.offset >= fragment.byteLength)
      limit("NCX position points outside its fragment");
    return {
      key: i.toString(16).toUpperCase().padStart(2, "0"),
      control: 0x8f,
      values: [
        section.start,
        section.end - section.start,
        labels.add(navigation[i]!.title),
        0,
        position.fid,
        position.offset,
      ],
    };
  });
  return {
    skel,
    frag,
    ncx: rows.length ? family("ncx", rows, labels) : [],
    fdst,
    tbs: textTrailers(sections, textRecordPayloadLengths),
  };
}
