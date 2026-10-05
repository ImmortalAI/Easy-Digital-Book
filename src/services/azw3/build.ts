import { prepareExport } from "@/services/export/prepare";
import type { BuildDependencies, ExportOptions } from "@/services/export/types";
import type { Book } from "@/types/book";
import { AppError } from "@/types/errors";
import { concatBytes } from "@/utils/bytes";
import { buildIndexesAsync } from "./indexes";
import { buildRecordZero } from "./headers";
import { layoutTextAsync } from "./skeleton";
import { buildResources, rewriteResources } from "./resources";
import { compressPalmDoc, splitTextRecords } from "./palmdoc";
import { buildEndRecords } from "./records";
import { writePalmDbAsync } from "./palmdb";

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

/** Assemble a deterministic, reflowable KF8-only book from the in-memory project. */
export async function buildAzw3(
  book: Book,
  options: ExportOptions,
  deps: BuildDependencies,
): Promise<Uint8Array> {
  const exportedAt = deps.now();
  check(deps.signal);
  const prepared = await prepareExport(book, options, deps);
  check(deps.signal);

  // Resource indices are assigned before markup rewriting so every Kindle embed
  // URI and EXTH resource offset refers to the same deterministic ordering.
  const resourcePlan = buildResources(prepared);
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
  recordIndices.set("fdst", records.length);
  const [flis, fcis, eof] = buildEndRecords(layout.text.length, textParts.length);
  records.push(indexes.fdst, flis!, fcis!, eof!);
  recordIndices.set("flis", records.length - 3);
  recordIndices.set("fcis", records.length - 2);

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
