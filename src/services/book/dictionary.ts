import type { Book, BookMutation } from "@/types/book";

const mutation = (book: Book): BookMutation => ({
  book,
  changedChapters: new Set(),
  removedChapters: new Set(),
  changedResources: new Set(),
  removedResources: new Set(),
});
// Code-point order: the same on every OS and locale, so the file diffs cleanly.
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeDictionary(words: Iterable<string>): string[] {
  return [...new Set([...words].map((word) => word.trim()).filter(Boolean))].sort(byCodePoint);
}
export function parseDictionaryText(text: string): string[] {
  return normalizeDictionary(text.replace(/\r\n?/g, "\n").split("\n"));
}
export function serializeDictionary(words: readonly string[]): string {
  return words.map((word) => `${word}\n`).join("");
}
export function isDictionaryWord(word: string): boolean {
  const value = word.trim();
  return value.length > 0 && !/\s/u.test(value);
}
export function addToDictionary(book: Book, word: string): BookMutation {
  const value = word.trim();
  if (!isDictionaryWord(value) || book.dictionary.includes(value)) return mutation(book);
  return mutation({ ...book, dictionary: normalizeDictionary([...book.dictionary, value]) });
}
export function removeFromDictionary(book: Book, word: string): BookMutation {
  if (!book.dictionary.includes(word)) return mutation(book);
  return mutation({ ...book, dictionary: book.dictionary.filter((item) => item !== word) });
}
