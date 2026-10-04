import { AppError } from "@/types/errors";
import { createByteLru } from "@/utils/byte-lru";
import type { Book, Resource } from "@/types/book";
import type { ImageProcessor } from "@/types/platform";
import { imageMetadata } from "@/services/book/image-dimensions";
import type { ImageMetadata } from "@/services/book/image-dimensions";
import { renderChapter, type RenderedChapter } from "./chapter";
import { planImage } from "./resources";
import { containerXml } from "./container";
import { navXhtml } from "./nav";
import { ncx } from "./ncx";
import { notesXhtml } from "./notes";
import { getLabels } from "./labels";
import { opf } from "./opf";
import { titlePage } from "./title-page";
import { makeZip } from "./zip";
import { themeCss } from "@/assets/epub/theme.css";
import type { ProcessedImage } from "@/types/platform";

export interface ExportOptions {
  imagePreset: "kindle-paperwhite" | "original";
  grayscale: boolean;
  titlePage: boolean;
  versionInTitle: boolean;
}
export interface BuildEpubDependencies {
  imageProcessor: ImageProcessor;
  now: () => Date;
  imageDimensions?: (resource: Resource) => ImageMetadata | null | Promise<ImageMetadata | null>;
  onProgress?: (progress: {
    stage: "chapters" | "images" | "zip";
    done: number;
    total: number;
  }) => void;
  signal?: AbortSignal;
  hash?: (bytes: Uint8Array) => Promise<string>;
}
// Bounded: this map outlives every export, and each entry is a full encoded
// image. 64 MB keeps repeat exports fast without growing without limit.
const cache = createByteLru<ProcessedImage>(64 * 1024 * 1024);
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
};
async function sha(bytes: Uint8Array): Promise<string> {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bitLength = bytes.length * 8,
    length = ((bytes.length + 9 + 63) >> 6) << 6,
    data = new Uint8Array(length);
  data.set(bytes);
  data[bytes.length] = 0x80;
  new DataView(data.buffer).setUint32(length - 4, bitLength, false);
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  for (let offset = 0; offset < length; offset += 64) {
    const w = new Uint32Array(64),
      view = new DataView(data.buffer, offset, 64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + k[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}
async function dimensions(resource: Resource, deps: BuildEpubDependencies): Promise<ImageMetadata> {
  return (
    (await deps.imageDimensions?.(resource)) ??
    imageMetadata(resource.bytes, resource.mediaType) ?? { width: 1, height: 1 }
  );
}
export async function buildEpub(
  book: Book,
  options: ExportOptions,
  deps: BuildEpubDependencies,
): Promise<Uint8Array> {
  check(deps.signal);
  const allMap = new Map<string, string>();
  const usedOutputNames = new Set<string>();
  const resourceMetadata = new Map<string, ImageMetadata>();
  for (const [path, resource] of book.resources) {
    const base = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
    const metadata = await dimensions(resource, deps);
    resourceMetadata.set(path, metadata);
    const planned = planImage(
      { mediaType: resource.mediaType, ...metadata },
      options,
      path === book.metadata.cover,
    );
    const extension = planned.format === "jpeg" ? "jpg" : "png";
    let candidate = `${base}.${extension}`;
    let suffix = 2;
    while (usedOutputNames.has(candidate)) candidate = `${base}-${suffix++}.${extension}`;
    usedOutputNames.add(candidate);
    allMap.set(path, `images/${candidate}`);
  }
  const chapters: RenderedChapter[] = [];
  let nextNote = 1;
  for (let i = 0; i < book.chapters.length; i++) {
    check(deps.signal);
    const rendered = renderChapter(
      book.chapters[i],
      i,
      book,
      allMap,
      Boolean(book.customCss),
      nextNote,
    );
    nextNote += rendered.notes.length;
    chapters.push(rendered);
    deps.onProgress?.({ stage: "chapters", done: i + 1, total: book.chapters.length });
  }
  const notes = notesXhtml(chapters, book.metadata.language, Boolean(book.customCss));
  const notesTitle = notes ? getLabels(book.metadata.language).notes : null;
  const used = new Set<string>();
  chapters.forEach((chapter) => chapter.referencedPaths.forEach((p) => used.add(p)));
  if (book.metadata.cover && book.resources.has(book.metadata.cover)) used.add(book.metadata.cover);
  const customCss = book.customCss;
  if (customCss)
    for (const match of customCss.matchAll(/url\(["']?([^"')]+)["']?\)/g))
      if (book.resources.has(match[1].trim())) used.add(match[1].trim());
  const imagePaths = [...used].filter((p) => book.resources.has(p)).sort();
  const processed: Array<{ source: string; output: ProcessedImage }> = [];
  for (let i = 0; i < imagePaths.length; i++) {
    check(deps.signal);
    const source = imagePaths[i];
    const resource = book.resources.get(source) as Resource;
    const meta = resourceMetadata.get(source) ?? (await dimensions(resource, deps));
    const plan = planImage(
      { mediaType: resource.mediaType, ...meta },
      options,
      source === book.metadata.cover,
    );
    const key = `${await (deps.hash ?? sha)(resource.bytes)}:${JSON.stringify(plan)}`;
    let output = cache.get(key);
    if (!output) {
      output = await deps.imageProcessor.process({ bytes: resource.bytes, plan }, deps.signal);
      cache.set(key, output);
    }
    processed.push({ source, output });
    deps.onProgress?.({ stage: "images", done: i + 1, total: imagePaths.length });
  }
  check(deps.signal);
  const exported = deps.now();
  const entries: Array<[string, string | Uint8Array]> = [
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", containerXml],
  ];
  const resourceEntries = processed.map(({ source, output }) => ({
    path: allMap.get(source) ?? "",
    archivePath: `OEBPS/${allMap.get(source)}`,
    mediaType: output.mediaType,
    id: source === book.metadata.cover ? "cover-image" : `image-${imagePaths.indexOf(source) + 1}`,
    output,
  }));
  entries.push([
    "OEBPS/content.opf",
    opf(
      book,
      chapters,
      resourceEntries.map((r) => ({ path: r.path, mediaType: r.mediaType, id: r.id })),
      options.titlePage,
      exported,
      options.versionInTitle,
      notes !== null,
    ),
  ]);
  entries.push(
    ["OEBPS/nav.xhtml", navXhtml(chapters, options.titlePage, book.metadata.title, notesTitle)],
    ["OEBPS/toc.ncx", ncx(chapters, book.metadata.id, book.metadata.title, notesTitle)],
  );
  if (options.titlePage)
    entries.push([
      "OEBPS/title.xhtml",
      titlePage(book, Boolean(book.customCss), options.versionInTitle),
    ]);
  chapters.forEach((chapter) => entries.push([`OEBPS/c-${chapter.id}.xhtml`, chapter.xhtml]));
  if (notes) entries.push(["OEBPS/notes.xhtml", notes]);
  entries.push(["OEBPS/theme.css", themeCss]);
  if (customCss)
    entries.push([
      "OEBPS/custom.css",
      customCss.replace(/url\(["']?([^"')]+)["']?\)/g, (whole, path: string) => {
        const normalized = path.trim();
        return allMap.has(normalized)
          ? `url("${allMap.get(normalized)}")`
          : normalized.startsWith("images/")
            ? 'url("data:,")'
            : whole;
      }),
    ]);
  for (const r of resourceEntries) entries.push([r.archivePath, r.output.bytes]);
  deps.onProgress?.({ stage: "zip", done: 0, total: entries.length });
  check(deps.signal);
  const result = await makeZip(entries);
  check(deps.signal);
  deps.onProgress?.({ stage: "zip", done: entries.length, total: entries.length });
  return result;
}
