import { writeEdb } from "@/services/edb/write";
import { prepareExport } from "@/services/export/prepare";
import type { BuildDependencies, ExportOptions, PreparedExport } from "@/services/export/types";
import type { Book } from "@/types/book";
import { AppError } from "@/types/errors";
import { concatBytes } from "@/utils/bytes";
import { buildIndexesAsync } from "./indexes";
import { buildRecordZero } from "./headers";
import { layoutTextAsync } from "./skeleton";
import { buildResources, rewriteResources } from "./resources";
import { compressPalmDoc, splitTextRecords } from "./palmdoc";
import { buildEndRecords, buildSrcsRecord } from "./records";
import { writePalmDbAsync } from "./palmdb";
import { jpegNeedsKindleCleanup } from "./jpeg";

function check(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError("export.cancelled", "Export cancelled");
}

async function checkpoint(deps: BuildDependencies): Promise<void> {
  check(deps.signal);
  await deps.yieldControl?.();
  check(deps.signal);
}

async function appendRecords(
  target: Uint8Array[],
  source: readonly Uint8Array[],
  deps: BuildDependencies,
): Promise<void> {
  for (let i = 0; i < source.length; i++) {
    check(deps.signal);
    target.push(source[i]!);
    if ((i + 1) % 128 === 0) await checkpoint(deps);
  }
}

/** Re-encode JPEGs Kindle may not display, mirroring Calibre's process_jpegs_for_amazon. */
async function cleanJpegs(
  prepared: PreparedExport,
  deps: BuildDependencies,
): Promise<PreparedExport> {
  const images: PreparedExport["images"] = [];
  for (const image of prepared.images) {
    check(deps.signal);
    const { output } = image;
    if (output.mediaType !== "image/jpeg" || !jpegNeedsKindleCleanup(output.bytes)) {
      images.push(image);
      continue;
    }
    // A square box keeps the size when the decoder applies EXIF rotation.
    const side = Math.max(output.width, output.height);
    const cleaned = await deps.imageProcessor.process(
      {
        bytes: output.bytes,
        plan: { width: side, height: side, format: "jpeg", quality: 0.9, grayscale: false },
      },
      deps.signal,
    );
    images.push({ ...image, output: cleaned });
  }
  return { ...prepared, images };
}

// Calibre's MAX_THUMB_DIMEN for MOBI/KF8 cover thumbnails.
const THUMBNAIL_WIDTH = 180;
const THUMBNAIL_HEIGHT = 240;

async function coverThumbnail(
  prepared: PreparedExport,
  options: ExportOptions,
  deps: BuildDependencies,
): Promise<Uint8Array | undefined> {
  const cover = prepared.images.find((image) => image.isCover);
  if (!cover) return undefined;
  const { width, height } = cover.output;
  const scale = Math.min(1, THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height);
  const thumbnail = await deps.imageProcessor.process(
    {
      bytes: cover.output.bytes,
      plan: {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        format: "jpeg",
        quality: 0.8,
        grayscale: options.grayscale,
      },
    },
    deps.signal,
  );
  return thumbnail.bytes;
}

/** Assemble a deterministic, reflowable KF8-only book from the in-memory project. */
export async function buildAzw3(
  book: Book,
  options: ExportOptions,
  deps: BuildDependencies,
): Promise<Uint8Array> {
  const exportedAt = deps.now();
  check(deps.signal);
  const prepared = await cleanJpegs(await prepareExport(book, options, deps), deps);
  check(deps.signal);

  // Resource indices are assigned before markup rewriting so every Kindle embed
  // URI and EXTH resource offset refers to the same deterministic ordering.
  const thumbnail = await coverThumbnail(prepared, options, deps);
  check(deps.signal);
  const resourcePlan = buildResources(prepared, thumbnail);
  const rewritten = rewriteResources(prepared, resourcePlan);
  await checkpoint(deps);

  const layout = await layoutTextAsync(rewritten.documents, rewritten.styles, deps);
  const textParts = splitTextRecords(layout.text);
  const payloadLengths = textParts.map((part) => part.bytes.length);
  const indexes = await buildIndexesAsync(layout, rewritten.navigation, payloadLengths, deps);
  const textRecords: Uint8Array[] = [];
  for (const [i, part] of textParts.entries()) {
    check(deps.signal);
    textRecords.push(concatBytes(compressPalmDoc(part.bytes), part.overlap, indexes.tbs[i]!));
    deps.onProgress?.({ stage: "azw3", done: i + 1, total: textParts.length });
    await checkpoint(deps);
  }

  const records: Uint8Array[] = [new Uint8Array()];
  await appendRecords(records, textRecords, deps);
  const recordIndices = new Map<string, number>();
  const appendIndex = async (key: string, parts: readonly Uint8Array[]) => {
    if (parts.length === 0) return;
    recordIndices.set(key, records.length);
    await appendRecords(records, parts, deps);
  };
  await appendIndex("frag", indexes.frag);
  await appendIndex("skel", indexes.skel);
  await appendIndex("ncx", indexes.ncx);
  if (resourcePlan.records.length) recordIndices.set("firstResource", records.length);
  await appendRecords(records, resourcePlan.records, deps);
  // Each index is captured when its record is pushed: the tail of the list is
  // not fixed once an SRCS record can sit between FCIS and EOF.
  const [flis, fcis, eof] = buildEndRecords(layout.text.length, textParts.length);
  const pushRecord = (key: string, record: Uint8Array) => {
    recordIndices.set(key, records.length);
    records.push(record);
  };
  pushRecord("fdst", indexes.fdst);
  pushRecord("flis", flis!);
  pushRecord("fcis", fcis!);
  if (options.embedProject) {
    check(deps.signal);
    pushRecord(
      "srcs",
      buildSrcsRecord(await writeEdb(book, exportedAt, { updateModified: false })),
    );
    await checkpoint(deps);
  }
  records.push(eof!);

  const recordZero = buildRecordZero({
    metadata: prepared.metadata,
    displayTitle: prepared.displayTitle,
    exportedAt,
    textLength: layout.text.length,
    textRecordCount: textParts.length,
    recordIndices,
    resourceCount: resourcePlan.records.length,
    coverIndex: resourcePlan.coverIndex,
    thumbnailIndex: resourcePlan.thumbnailIndex,
    flowCount: layout.flows.length,
  });
  records[0] = recordZero;
  const result = await writePalmDbAsync(
    records,
    prepared.metadata.title,
    { created: new Date(prepared.metadata.created) },
    deps,
  );
  check(deps.signal);
  deps.onProgress?.({ stage: "azw3", done: textParts.length, total: textParts.length });
  check(deps.signal);
  return result;
}
