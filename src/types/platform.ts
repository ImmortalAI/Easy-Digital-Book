import type { SpellLanguage } from "./spelling";
import type { Book } from "./book";

export type ImagePlan = {
  width: number;
  height: number;
  format: "png" | "jpeg";
  quality?: number;
  passthrough?: boolean;
  grayscale: boolean;
};

export type ImageProcessInput = { bytes: Uint8Array; plan: ImagePlan };
export type BrowserImageMediaType = "image/jpeg" | "image/png";
export type ProcessedImage = {
  bytes: Uint8Array;
  mediaType: BrowserImageMediaType;
  width: number;
  height: number;
};

export interface ImageProcessor {
  process(input: ImageProcessInput, signal?: AbortSignal): Promise<ProcessedImage>;
  dispose(): void;
}

export interface FileInfo {
  mtime: number | null;
  size: number;
}
export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  writeFileAtomic(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileInfo>;
}
export interface Dialogs {
  open(options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  save(options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  confirm(message: string, title?: string): Promise<boolean>;
  message(message: string, title?: string): Promise<void>;
}
export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}
export interface LogServices {
  openDirectory(): Promise<void>;
}
export interface Opener {
  reveal(path: string): Promise<void>;
  open(path: string): Promise<void>;
}
export interface UpdateInfo {
  version: string;
  url: string;
  notes?: string;
}
export interface Updates {
  check(): Promise<UpdateInfo | false>;
}
export interface SpellChecker {
  /** The misspelled subset of `words`, checked against the base dictionary only. */
  check(lang: SpellLanguage, words: string[]): Promise<string[]>;
  /** Up to five suggestions for one word. */
  suggest(lang: SpellLanguage, word: string): Promise<string[]>;
}
export interface RecoverySessionSummary {
  bookId: string;
  originalPath: string | null;
  title: string;
  version: string | null;
  updatedAt: number;
}
export interface RecoveredBook extends Book {
  originalPath: string | null;
}
export interface RecoveryDelta {
  changedChapters: Set<string>;
  removedChapters: Set<string>;
  changedResources: Set<string>;
  removedResources: Set<string>;
}
export interface RecoveryStore {
  list(): Promise<RecoverySessionSummary[]>;
  restore(bookId: string): Promise<RecoveredBook | null>;
  writeChanges(book: Book, delta: RecoveryDelta, originalPath?: string | null): Promise<void>;
  remove(bookId: string): Promise<void>;
}
export interface WindowCloseEvent {
  preventDefault(): void;
}
export type Unlisten = () => void | Promise<void>;
export interface WindowServices {
  listenOpenPaths(handler: () => void): Promise<Unlisten>;
  takePendingOpenPaths(): Promise<string[]>;
  onCloseRequested(handler: (event: WindowCloseEvent) => void | Promise<void>): Promise<Unlisten>;
}
export interface PlatformServices {
  files: FileSystem;
  dialogs: Dialogs;
  settings: SettingsRepository;
  recovery: RecoveryStore;
  logger: Logger;
  logs: LogServices;
  opener: Opener;
  updates: Updates;
  window: WindowServices;
  spell: SpellChecker;
}
export type InMemoryPlatformServices = PlatformServices;
