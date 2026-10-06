import { safeParse } from "valibot";
import type { BookMetadata } from "@/types/book";
import {
  CURRENT_EDB_FORMAT_VERSION,
  ManifestSchema,
  type ManifestEnvelope,
} from "@/types/manifest";
import type { AppWarning } from "@/types/diagnostics";
import { AppError } from "@/types/errors";
import { migrateManifest } from "./migrations";

export function parseManifest(value: unknown): {
  manifest: ManifestEnvelope;
  migrated: boolean;
  warnings: AppWarning[];
} {
  const envelope = safeParse(ManifestSchema, value);
  if (!envelope.success) throw new AppError("edb.badManifest", "Invalid manifest structure");
  if (!Number.isInteger(envelope.output.formatVersion) || envelope.output.formatVersion < 0)
    throw new AppError("edb.badManifest", "Invalid format version");
  if (envelope.output.chapters.some(({ id }) => !/^[a-z0-9]{8}$/.test(id)))
    throw new AppError("edb.badManifest", "Invalid chapter ID");
  const chapterIds = new Set<string>();
  for (const { id } of envelope.output.chapters) {
    if (chapterIds.has(id)) throw new AppError("edb.badManifest", "Duplicate chapter ID");
    chapterIds.add(id);
  }
  if (envelope.output.formatVersion > CURRENT_EDB_FORMAT_VERSION)
    throw new AppError("edb.tooNew", "Project format is newer than this application");
  const needsMigration = envelope.output.formatVersion < CURRENT_EDB_FORMAT_VERSION;
  // The 1 -> 2 step only adds an optional dictionary file, so a version 1 file
  // is not considered changed by it; only older (data-changing) steps count.
  const migrated = envelope.output.formatVersion < 1;
  return {
    manifest: needsMigration
      ? migrateManifest(envelope.output, envelope.output.formatVersion)
      : envelope.output,
    migrated,
    warnings: [],
  };
}

const defaults: BookMetadata = {
  id: "urn:uuid:00000000-0000-4000-8000-000000000000",
  title: "Untitled",
  version: null,
  created: "",
  modified: "",
  language: "en",
  authors: [],
  translators: [],
  series: null,
  description: null,
  cover: null,
};
export function normalizeMetadata(raw: unknown, now: string, warnings: AppWarning[]): BookMetadata {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const metadata = { ...defaults, created: now, modified: now };
  const invalid = (field: string) =>
    warnings.push({ code: "edb.invalidMetadata", message: `Invalid metadata field: ${field}` });
  if (typeof source.id === "string") metadata.id = source.id;
  else invalid("id");
  if (typeof source.title === "string") metadata.title = source.title;
  else invalid("title");
  if (source.version === null || typeof source.version === "string")
    metadata.version = source.version;
  else invalid("version");
  if (typeof source.created === "string") metadata.created = source.created;
  else invalid("created");
  if (typeof source.modified === "string") metadata.modified = source.modified;
  else invalid("modified");
  if (typeof source.language === "string") metadata.language = source.language;
  else invalid("language");
  if (Array.isArray(source.authors) && source.authors.every((x) => typeof x === "string"))
    metadata.authors = source.authors;
  else invalid("authors");
  if (Array.isArray(source.translators) && source.translators.every((x) => typeof x === "string"))
    metadata.translators = source.translators;
  else invalid("translators");
  if (source.description === null || typeof source.description === "string")
    metadata.description = source.description;
  else invalid("description");
  if (source.cover === null || typeof source.cover === "string") metadata.cover = source.cover;
  else invalid("cover");
  if (source.series === null) metadata.series = null;
  else if (
    source.series &&
    typeof source.series === "object" &&
    typeof (source.series as Record<string, unknown>).name === "string" &&
    typeof (source.series as Record<string, unknown>).index === "number"
  )
    metadata.series = source.series as BookMetadata["series"];
  else invalid("series");
  return metadata;
}
