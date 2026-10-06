import type { Book } from "@/types/book";
import { canonicalUuid } from "@/utils/uuid";

export const DEFAULT_TITLES = { ru: "Без названия", en: "Untitled", "zh-CN": "未命名" } as const;

/** A title nobody typed: empty or a new book's placeholder in any UI language. */
export function isDefaultTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed === "" || Object.values(DEFAULT_TITLES).some((value) => value === trimmed);
}

export interface CreateBookOptions {
  locale: string;
  now: Date | string;
  newUuid?: () => string;
  newChapterId?: () => string;
  /** @deprecated Use separate generators to keep UUID and chapter IDs distinct. */
  newId?: () => string;
}
export function createBook({ locale, now, newUuid, newChapterId, newId }: CreateBookOptions): Book {
  const timestamp = typeof now === "string" ? now : now.toISOString();
  const language = locale || "en";
  const title =
    language === "ru"
      ? DEFAULT_TITLES.ru
      : language === "zh-CN"
        ? DEFAULT_TITLES["zh-CN"]
        : DEFAULT_TITLES.en;
  const heading = language === "ru" ? "Глава 1" : language === "zh-CN" ? "第 1 章" : "Chapter 1";
  const uuidGenerator = newUuid ?? newId;
  const chapterGenerator = newChapterId ?? newId;
  if (!uuidGenerator || !chapterGenerator) throw new Error("ID generators are required");
  const bookId = canonicalUuid(uuidGenerator());
  const chapterId = chapterGenerator();
  if (!/^[a-z0-9]{8}$/.test(chapterId)) throw new Error("Invalid chapter ID");
  return {
    metadata: {
      id: bookId,
      title,
      version: null,
      created: timestamp,
      modified: timestamp,
      language,
      authors: [],
      translators: [],
      series: null,
      description: null,
      cover: null,
    },
    chapters: [{ id: chapterId, source: `# ${heading}` }],
    resources: new Map(),
    customCss: null,
    dictionary: [],
  };
}
