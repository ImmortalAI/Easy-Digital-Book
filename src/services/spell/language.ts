import type { SpellLanguage } from "@/types/spelling";

const CYRILLIC = /^[\p{Script=Cyrillic}\p{M}'\u2019-]+$/u;
const LATIN = /^[\p{Script=Latin}\p{M}'\u2019-]+$/u;

export function languageOf(word: string): SpellLanguage | null {
  if (CYRILLIC.test(word)) return "ru";
  if (LATIN.test(word)) return "en";
  return null;
}
