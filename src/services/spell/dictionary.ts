/** The book-dictionary form of a word: ё as е, first letter lower-cased. */
export function dictionaryKey(word: string): string {
  const plain = word.replace(/ё/g, "е").replace(/Ё/g, "Е");
  return plain.charAt(0).toLocaleLowerCase() + plain.slice(1);
}
export function createDictionaryIndex(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map(dictionaryKey));
}
export function isAccepted(
  word: string,
  index: ReadonlySet<string>,
  ignores: ReadonlySet<string>,
): boolean {
  return ignores.has(word) || index.has(dictionaryKey(word));
}
