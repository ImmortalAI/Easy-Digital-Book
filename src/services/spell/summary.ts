import type { Misspelling, SpellLanguage } from "@/types/spelling";

export interface WordSummary {
  word: string;
  lang: SpellLanguage;
  count: number;
  first: Misspelling;
}
export function summarizeMisspellings(items: readonly Misspelling[]): WordSummary[] {
  const byWord = new Map<string, WordSummary>();
  for (const item of items) {
    const entry = byWord.get(item.word);
    if (entry) entry.count++;
    else byWord.set(item.word, { word: item.word, lang: item.lang, count: 1, first: item });
  }
  return [...byWord.values()];
}
export function contextSnippet(
  source: string,
  from: number,
  to: number,
  radius = 30,
): { before: string; word: string; after: string } {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const lineEndIndex = source.indexOf("\n", to);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const start = Math.max(lineStart, from - radius);
  const end = Math.min(lineEnd, to + radius);
  return {
    before: (start > lineStart ? "…" : "") + source.slice(start, from),
    word: source.slice(from, to),
    after: source.slice(to, end) + (end < lineEnd ? "…" : ""),
  };
}
