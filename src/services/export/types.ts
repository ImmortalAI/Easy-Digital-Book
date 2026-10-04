import type { Book, BookMetadata, Resource } from "@/types/book";
import type { ImageProcessor, ProcessedImage } from "@/types/platform";
import type { ImageMetadata } from "@/services/book/image-dimensions";
import type { RenderedChapter } from "@/services/epub/chapter";

export type ExportFormat = "epub" | "azw3";
export interface ExportOptions {
  imagePreset: "kindle-paperwhite" | "original";
  grayscale: boolean;
  titlePage: boolean;
  versionInTitle: boolean;
}
export interface ExportProgress {
  stage: "chapters" | "images" | "zip" | "azw3";
  done: number;
  total: number;
}
export interface BuildDependencies {
  imageProcessor: ImageProcessor;
  now: () => Date;
  imageDimensions?: (resource: Resource) => ImageMetadata | null | Promise<ImageMetadata | null>;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
  hash?: (bytes: Uint8Array) => Promise<string>;
}
export interface PreparedExport {
  metadata: BookMetadata;
  displayTitle: string;
  chapters: RenderedChapter[];
  documents: Array<{ path: string; kind: "title" | "chapter" | "notes"; xhtml: string }>;
  navigation: Array<{ title: string; href: string }>;
  styles: Array<{ path: string; css: string }>;
  images: Array<{ source: string; path: string; output: ProcessedImage; isCover: boolean }>;
}
export type ExportBuilder = (
  book: Book,
  options: ExportOptions,
  deps: BuildDependencies,
) => Promise<Uint8Array>;
