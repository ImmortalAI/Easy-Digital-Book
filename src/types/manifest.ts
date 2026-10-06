import type { BookMetadata, Chapter } from "./book";
import { array, literal, number, object, string, unknown, type InferOutput } from "valibot";

export const CURRENT_EDB_FORMAT_VERSION = 2;
export const ManifestSchema = object({
  format: literal("easy-digital-book"),
  formatVersion: number(),
  book: unknown(),
  chapters: array(object({ id: string() })),
});
export type ManifestEnvelope = InferOutput<typeof ManifestSchema>;

export interface Manifest {
  format: "easy-digital-book";
  formatVersion: number;
  book: BookMetadata;
  chapters: Array<Pick<Chapter, "id">>;
}
