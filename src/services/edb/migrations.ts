import type { ManifestEnvelope } from "@/types/manifest";
import { CURRENT_EDB_FORMAT_VERSION } from "@/types/manifest";
import { AppError } from "@/types/errors";

export function migrateManifest(manifest: ManifestEnvelope, fromVersion: number): ManifestEnvelope {
  let current = { ...manifest };
  if (fromVersion === 0) {
    current = { ...current, formatVersion: 1 };
  }
  // 1 -> 2 adds the optional dictionary.txt; an absent file is an empty dictionary.
  if (current.formatVersion === 1) current = { ...current, formatVersion: 2 };
  if (current.formatVersion !== CURRENT_EDB_FORMAT_VERSION)
    throw new AppError("edb.unsupportedVersion", `Unsupported migration from ${fromVersion}`);
  return current;
}
