import type { PreparedExport } from "@/services/export/types";
import { AppError } from "@/types/errors";
import type { KindlePosition } from "./types";
import { buildXml, parseXml, validateXml, visitElements } from "./xml";

export function radix32(value: number, width: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 32 ** width) {
    throw new AppError("export.azw3Limit", "Kindle address is outside its fixed-width field", {
      value,
      width,
    });
  }
  return value.toString(32).toUpperCase().padStart(width, "0");
}
export function positionUri(position: KindlePosition): string {
  return `kindle:pos:fid:${radix32(position.fid, 4)}:off:${radix32(position.offset, 10)}`;
}
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length)
        throw new AppError("export.azw3Link", "Link escapes the export root", { path });
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
/** null means an external URI (including already serialized Kindle links). */
export function linkTarget(path: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const hash = href.indexOf("#");
  const rawPath = hash < 0 ? href : href.slice(0, hash);
  try {
    const decodedPath = decodeURIComponent(rawPath);
    const base = normalizePath(path);
    const target = decodedPath
      ? normalizePath(
          decodedPath.startsWith("/")
            ? decodedPath
            : `${base.slice(0, base.lastIndexOf("/") + 1)}${decodedPath}`,
        )
      : base;
    const id = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
    return `${target}${id ? `#${id}` : ""}`;
  } catch (cause) {
    throw new AppError("export.azw3Link", "Invalid internal link", { path, href }, { cause });
  }
}
export function requirePosition(
  positions: ReadonlyMap<string, KindlePosition>,
  target: string,
): KindlePosition {
  const position = positions.get(target);
  if (!position)
    throw new AppError("export.azw3Link", "Internal link target does not exist", { target });
  return position;
}
/** Immutable XHTML rewrite; layoutText reserves these URI widths before measuring. */
export function rewriteLinks(
  documents: PreparedExport["documents"],
  positions: ReadonlyMap<string, KindlePosition>,
): PreparedExport["documents"] {
  return documents.map((document) => {
    const nodes = parseXml(document.xhtml);
    visitElements(nodes, (node, tag) => {
      const attrs = node[":@"];
      if (!attrs || attrs["@_href"] === undefined || tag !== "a") return;
      const target = linkTarget(document.path, attrs["@_href"]);
      if (target !== null) attrs["@_href"] = positionUri(requirePosition(positions, target));
    });
    const xhtml = buildXml(nodes);
    validateXml(xhtml);
    return { ...document, xhtml };
  });
}
