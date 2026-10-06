export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface Series {
  name: string;
  index: number;
}
export interface BookMetadata {
  id: string;
  title: string;
  version: string | null;
  created: string;
  modified: string;
  language: string;
  authors: string[];
  translators: string[];
  series: Series | null;
  description: string | null;
  cover: string | null;
}
export interface Chapter {
  id: string;
  source: string;
}
export interface Resource {
  bytes: Uint8Array;
  mediaType: ImageMediaType;
}
export interface Book {
  metadata: BookMetadata;
  chapters: Chapter[];
  resources: Map<string, Resource>;
  customCss: string | null;
  /** Book spelling dictionary: sorted, unique; empty means no file. */
  dictionary: string[];
}
export interface BookMutation {
  book: Book;
  metadataCoverChanged?: boolean;
  changedChapters: Set<string>;
  removedChapters: Set<string>;
  changedResources: Set<string>;
  removedResources: Set<string>;
}
