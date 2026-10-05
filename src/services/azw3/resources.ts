import type { PreparedExport } from "@/services/export/types";
import { rewriteCssResourceUrls } from "@/services/export/css-resources";
import { AppError } from "@/types/errors";
import { radix32 } from "./links";
import { buildXml, parseXml, validateXml, visitElements } from "./xml";
import type { Azw3ResourcePlan } from "./types";

const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function resourceError(message: string, details?: unknown): never {
  throw new AppError("export.azw3Resource", message, details);
}
function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  return (
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  );
}
function mediaType(image: PreparedExport["images"][number]): "image/jpeg" | "image/png" {
  const output = image.output;
  if (output.mediaType === "image/png" && startsWith(output.bytes, pngSignature))
    return "image/png";
  if (
    output.mediaType === "image/jpeg" &&
    output.bytes.length >= 3 &&
    output.bytes[0] === 0xff &&
    output.bytes[1] === 0xd8 &&
    output.bytes[2] === 0xff
  )
    return "image/jpeg";
  return resourceError("Processed image MIME type or encoded signature is unsupported", {
    source: image.source,
    mediaType: output.mediaType,
  });
}
function normalizedSource(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return resourceError("Image path escapes the project root", { path });
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) return resourceError("Image path is empty", { path });
  return parts.join("/");
}
function normalizedOutputPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function buildResources(prepared: PreparedExport): Azw3ResourcePlan {
  const images = prepared.images
    .map((image) => ({
      image,
      source: normalizedSource(image.source),
      path: normalizedOutputPath(image.path),
    }))
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  const sourceSet = new Set<string>();
  const pathSet = new Set<string>();
  for (const entry of images) {
    if (sourceSet.has(entry.source))
      resourceError("Duplicate normalized project image path", { path: entry.source });
    if (pathSet.has(entry.path))
      resourceError("Duplicate prepared image output path", { path: entry.path });
    sourceSet.add(entry.source);
    pathSet.add(entry.path);
    mediaType(entry.image);
  }
  const cover = images.findIndex(({ image }) => image.isCover);
  if (images.filter(({ image }) => image.isCover).length > 1)
    resourceError("More than one prepared cover image");
  if (
    prepared.metadata.cover &&
    cover < 0 &&
    prepared.images.some(({ source }) => source === prepared.metadata.cover)
  ) {
    resourceError("Prepared cover identity is inconsistent", { cover: prepared.metadata.cover });
  }
  return {
    records: images.map(({ image }) => image.output.bytes.slice()),
    imageIndices: new Map(images.map(({ source }, index) => [source, index])),
    coverIndex: cover < 0 ? null : cover,
    thumbnailIndex: null,
  };
}

function pathForImage(documentPath: string, rawPath: string): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(rawPath) || rawPath.startsWith("#")) return null;
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (cause) {
    throw new AppError("export.azw3Resource", "Invalid encoded image path", { rawPath }, { cause });
  }
  decoded = decoded.split(/[?#]/, 1)[0]!;
  const normalized = decoded.startsWith("/")
    ? decoded.slice(1)
    : decoded.startsWith("images/")
      ? decoded
      : `${documentPath.slice(0, documentPath.lastIndexOf("/") + 1)}${decoded}`;
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length)
        resourceError("Image reference escapes the export root", { rawPath, documentPath });
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

function imageUriFor(
  path: string,
  imagesByOutputPath: ReadonlyMap<string, { index: number; mediaType: "image/jpeg" | "image/png" }>,
): string | undefined {
  const item = imagesByOutputPath.get(path);
  if (!item) {
    if (path.startsWith("images/"))
      resourceError("Referenced image is missing from prepared export", { path });
    return undefined;
  }
  return `kindle:embed:${radix32(item.index + 1, 4)}?mime=${item.mediaType}`;
}

/** Rewrite prepared XHTML and CSS resource URIs to Kindle's embed scheme. */
export function rewriteResources(prepared: PreparedExport, plan: Azw3ResourcePlan): PreparedExport {
  const planIndices = new Map<string, number>();
  for (const [path, index] of plan.imageIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= plan.records.length) {
      resourceError("Image record index is outside the resource plan", { path, index });
    }
    planIndices.set(normalizedSource(path), index);
  }
  const outputImages = new Map<string, { index: number; mediaType: "image/jpeg" | "image/png" }>();
  for (const image of prepared.images) {
    const source = normalizedSource(image.source);
    const index = planIndices.get(source);
    if (index === undefined)
      resourceError("Prepared image is missing from the resource plan", { source });
    const type = mediaType(image);
    if (!bytesEqual(image.output.bytes, plan.records[index]!)) {
      resourceError("Prepared image bytes do not match resource plan", { source });
    }
    outputImages.set(normalizedOutputPath(image.path), { index, mediaType: type });
  }
  const mapUri = (path: string) => imageUriFor(path, outputImages);
  const documents = prepared.documents.map((document) => {
    const nodes = parseXml(document.xhtml);
    visitElements(nodes, (node, tag) => {
      const attrs = node[":@"];
      if (!attrs) return;
      const keys = tag === "img" ? ["@_src"] : tag === "image" ? ["@_href", "@_xlink:href"] : [];
      for (const key of keys) {
        const rawPath = attrs[key];
        if (typeof rawPath !== "string") continue;
        const path = pathForImage(document.path, rawPath);
        if (path === null) continue;
        const uri = mapUri(path);
        if (uri !== undefined) attrs[key] = uri;
      }
    });
    const xhtml = buildXml(nodes);
    validateXml(xhtml);
    return { ...document, xhtml };
  });
  const styles = prepared.styles.map((style) => ({
    ...style,
    css: rewriteCssResourceUrls(style.css, (rawPath) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(rawPath)) return undefined;
      const path = pathForImage(style.path, rawPath);
      return path === null ? undefined : mapUri(path);
    }),
  }));
  return { ...prepared, documents, styles };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
