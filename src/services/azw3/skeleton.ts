import type { PreparedExport } from "@/services/export/types";
import { AppError } from "@/types/errors";
import type { KindlePosition, TextLayout } from "./types";
import { linkTarget, normalizePath, positionUri, radix32, requirePosition } from "./links";
import { buildXml, children, parseXml, tagName, validateXml, type XmlNode } from "./xml";

const encoder = new TextEncoder();
const placeholder = "kindle:pos:fid:0000:off:0000000000";
// Preparation policy, not a device limit: a complete oversized block stays intact.
const targetFragmentBytes = 8192;
interface NodeRange {
  start: number;
  end: number;
}
interface FragmentRange {
  start: number;
  end: number;
  selector: string;
}
interface DocumentLayout {
  path: string;
  bytes: Uint8Array;
  fragments: FragmentRange[];
  targets: Map<string, number>;
  patches: Array<{ offset: number; target: string }>;
}
function join(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function assertU32(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new AppError("export.azw3Limit", "Text layout exceeds unsigned 32-bit geometry", {
      value,
    });
  }
}

/** Complete body-child runs become fragments; large sections retain their shells. */
function* partitionSteps(
  body: XmlNode,
  ranges: Map<XmlNode, NodeRange>,
): Generator<void, FragmentRange[], void> {
  const fragments: FragmentRange[] = [];
  let visited = 0;
  function* inside(parent: XmlNode): Generator<void, void, void> {
    let pending: FragmentRange | undefined;
    let precedingSkeletonAid: string | undefined;
    const flush = () => {
      if (pending) fragments.push(pending);
      pending = undefined;
    };
    for (const node of children(parent)) {
      visited++;
      if (visited % 128 === 0) yield;
      const range = ranges.get(node)!;
      const size = range.end - range.start;
      if (tagName(node) === "section" && size > targetFragmentBytes && children(node).length > 0) {
        flush();
        yield* inside(node);
        precedingSkeletonAid = node[":@"]!["@_aid"];
      } else {
        if (pending && range.end - pending.start > targetFragmentBytes) flush();
        if (!pending)
          pending = {
            start: range.start,
            end: range.end,
            selector: precedingSkeletonAid
              ? `S-//*[@aid='${precedingSkeletonAid}']`
              : `P-//*[@aid='${parent[":@"]!["@_aid"]}']`,
          };
        else pending.end = range.end;
      }
    }
    flush();
  }
  yield* inside(body);
  return fragments;
}

function* walkElements(
  nodes: XmlNode[],
  visit: (node: XmlNode, tag: string) => void,
): Generator<void, void, void> {
  let visited = 0;
  function* walk(list: XmlNode[]): Generator<void, void, void> {
    for (const node of list) {
      const tag = tagName(node);
      if (!tag) continue;
      visit(node, tag);
      visited++;
      if (visited % 128 === 0) yield;
      yield* walk(children(node));
    }
  }
  yield* walk(nodes);
}

function* serializeDocumentSteps(
  path: string,
  nodes: XmlNode[],
  body: XmlNode,
  pendingLinks: Map<XmlNode, string>,
): Generator<void, DocumentLayout, void> {
  const parts: Uint8Array[] = [];
  const ranges = new Map<XmlNode, NodeRange>();
  const targets = new Map<string, number>();
  const patches: DocumentLayout["patches"] = [];
  let length = 0;
  let visited = 0;
  const append = (text: string) => {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    length += bytes.length;
  };
  function* serialize(node: XmlNode): Generator<void, void, void> {
    const start = length;
    const tag = tagName(node);
    if (!tag) {
      append(buildXml([node]));
      ranges.set(node, { start, end: length });
      visited++;
      if (visited % 128 === 0) yield;
      return;
    }
    // Ask XMLBuilder to escape attributes and create the tag; no XML tokenizer.
    const shell = buildXml([{ [tag]: [], ...(node[":@"] ? { ":@": node[":@"] } : {}) }]);
    const closing = `</${tag}>`;
    const opening = shell.slice(0, -closing.length);
    const target = pendingLinks.get(node);
    if (target !== undefined) {
      const attribute = ` href="${placeholder}"`;
      const index = opening.indexOf(attribute);
      if (index < 0)
        throw new AppError("export.azw3Link", "Position slot missing from serialized anchor");
      patches.push({ offset: start + encoder.encode(opening.slice(0, index + 7)).length, target });
    }
    const id = node[":@"]?.["@_id"];
    if (id !== undefined) {
      if (targets.has(id))
        throw new AppError("export.azw3Link", "Duplicate document anchor", { path, id });
      targets.set(id, start);
    }
    append(opening);
    for (const child of children(node)) yield* serialize(child);
    append(closing);
    ranges.set(node, { start, end: length });
    visited++;
    if (visited % 128 === 0) yield;
  }
  for (const node of nodes) yield* serialize(node);
  const bytes = join(parts);
  validateXml(new TextDecoder().decode(bytes));
  const fragments = yield* partitionSteps(body, ranges);
  return { path, bytes, targets, patches, fragments };
}

/** Final patched physical stream: all HTML files in flow0, then ordered CSS flows. */
function* layoutTextSteps(
  documents: PreparedExport["documents"],
  styles: PreparedExport["styles"],
): Generator<void, TextLayout, void> {
  const parsed: Array<{ path: string; nodes: XmlNode[] }> = [];
  for (const [index, document] of documents.entries()) {
    parsed.push({ path: normalizePath(document.path), nodes: parseXml(document.xhtml) });
    if ((index + 1) % 128 === 0) yield;
  }
  const paths = new Set<string>();
  const usedAids = new Set<string>();
  for (const [index, document] of parsed.entries()) {
    if (paths.has(document.path))
      throw new AppError("export.azw3Link", "Duplicate document path", { path: document.path });
    paths.add(document.path);
    yield* walkElements(document.nodes, (node) => {
      const aid = node[":@"]?.["@_aid"];
      if (aid && /^[0-9A-V]+$/.test(aid) && !usedAids.has(aid)) usedAids.add(aid);
      else if (aid !== undefined) delete node[":@"]!["@_aid"];
    });
    if ((index + 1) % 128 === 0) yield;
  }
  let aidCounter = 0;
  const newAid = () => {
    while (usedAids.has(aidCounter.toString(32).toUpperCase())) aidCounter++;
    const aid = (aidCounter++).toString(32).toUpperCase();
    usedAids.add(aid);
    return aid;
  };
  const styleFlows = new Map(styles.map((style, index) => [normalizePath(style.path), index + 1]));
  const files: DocumentLayout[] = [];
  for (const [documentIndex, document] of parsed.entries()) {
    let body: XmlNode | undefined;
    yield* walkElements(document.nodes, (node, tag) => {
      if (tag === "body") body = node;
    });
    if (!body)
      throw new AppError("export.invalidXhtml", "Export XHTML requires a body", {
        path: document.path,
      });
    if (!children(body).some((node) => tagName(node))) children(body).unshift({ p: [] });
    const pendingLinks = new Map<XmlNode, string>();
    yield* walkElements(document.nodes, (node, tag) => {
      const attrs = (node[":@"] ??= {});
      attrs["@_aid"] ??= newAid();
      if (attrs["@_href"] === undefined) return;
      const target = linkTarget(document.path, attrs["@_href"]);
      if (target === null) return;
      if (tag === "link" && attrs["@_rel"]?.split(/\s+/).includes("stylesheet")) {
        const flow = styleFlows.get(target);
        if (flow === undefined)
          throw new AppError("export.azw3Link", "Stylesheet flow is missing", { target });
        attrs["@_href"] = `kindle:flow:${radix32(flow, 4)}?mime=text/css`;
      } else if (tag === "a") {
        pendingLinks.set(node, target);
        attrs["@_href"] = placeholder;
      }
    });
    files.push(yield* serializeDocumentSteps(document.path, document.nodes, body, pendingLinks));
    if ((documentIndex + 1) % 128 === 0) yield;
  }
  const positions = new Map<string, KindlePosition>();
  const skeletons: TextLayout["skeletons"] = [];
  const fragments: TextLayout["fragments"] = [];
  let fileStart = 0;
  for (const [fileIndex, file] of files.entries()) {
    const firstFid = fragments.length;
    const fragmentLength = file.fragments.reduce(
      (sum, fragment) => sum + fragment.end - fragment.start,
      0,
    );
    const skeletonByteLength = file.bytes.length - fragmentLength;
    let fragmentStart = 0;
    for (const [fragmentIndex, range] of file.fragments.entries()) {
      radix32(fragments.length, 4);
      fragments.push({
        fileIndex,
        globalFragmentIndex: fragments.length,
        selector: range.selector,
        insertionOffset: fileStart + range.start,
        fragmentStart,
        byteLength: range.end - range.start,
        bytes: file.bytes.slice(range.start, range.end),
      });
      fragmentStart += range.end - range.start;
      if ((fragmentIndex + 1) % 128 === 0) yield;
    }
    const positionAt = (offset: number): KindlePosition => {
      const index = file.fragments.findIndex((range) => range.end > offset);
      if (index < 0)
        throw new AppError("export.azw3Link", "Skeleton target has no following fragment", {
          path: file.path,
          offset,
        });
      const range = file.fragments[index]!;
      return {
        fid: firstFid + index,
        offset: offset >= range.start && offset < range.end ? offset - range.start : 0,
        reconstructedOffset: fileStart + offset,
      };
    };
    positions.set(file.path, positionAt(file.fragments[0]!.start));
    let targetIndex = 0;
    for (const [id, offset] of file.targets) {
      positions.set(`${file.path}#${id}`, positionAt(offset));
      targetIndex++;
      if (targetIndex % 128 === 0) yield;
    }
    skeletons.push({
      fileIndex,
      key: `SKEL${fileIndex.toString().padStart(10, "0")}`,
      fragmentCount: file.fragments.length,
      physicalStart: fileStart,
      skeletonByteLength,
      reconstructedStart: fileStart,
      reconstructedLength: file.bytes.length,
    });
    fileStart += file.bytes.length;
    assertU32(fileStart);
    if ((fileIndex + 1) % 128 === 0) yield;
  }
  const physical: Uint8Array[] = [];
  for (const [fileIndex, file] of files.entries()) {
    for (const [patchIndex, patch] of file.patches.entries()) {
      file.bytes.set(
        encoder.encode(positionUri(requirePosition(positions, patch.target))),
        patch.offset,
      );
      if ((patchIndex + 1) % 128 === 0) yield;
    }
    const shell: Uint8Array[] = [];
    let end = 0;
    for (const range of file.fragments) {
      shell.push(file.bytes.subarray(end, range.start));
      end = range.end;
    }
    shell.push(file.bytes.subarray(end));
    physical.push(join(shell));
    const skel = skeletons[fileIndex]!;
    const firstFid = positions.get(file.path)!.fid;
    for (const [index, range] of file.fragments.entries()) {
      const bytes = file.bytes.slice(range.start, range.end);
      fragments[firstFid + index]!.bytes = bytes;
      physical.push(bytes);
      if ((index + 1) % 128 === 0) yield;
    }
    assertU32(skel.physicalStart + skel.reconstructedLength);
  }
  const flows = [{ start: 0, end: fileStart }];
  for (const style of styles) {
    const bytes = encoder.encode(style.css);
    physical.push(bytes);
    const start = fileStart;
    fileStart += bytes.length;
    assertU32(fileStart);
    flows.push({ start, end: fileStart });
  }
  return { text: join(physical), skeletons, fragments, flows, positions };
}

function complete<T>(steps: Generator<void, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function layoutText(
  documents: PreparedExport["documents"],
  styles: PreparedExport["styles"],
): TextLayout {
  return complete(layoutTextSteps(documents, styles));
}

/** Cancellable counterpart used by the export pipeline; sync wrapper shares its algorithm. */
export async function layoutTextAsync(
  documents: PreparedExport["documents"],
  styles: PreparedExport["styles"],
  control: { signal?: AbortSignal; yieldControl?: () => Promise<void> } = {},
): Promise<TextLayout> {
  const cancelled = () => {
    if (control.signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
  };
  const steps = layoutTextSteps(documents, styles);
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
