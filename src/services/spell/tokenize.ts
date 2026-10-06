import type { SpellToken } from "@/types/spelling";

// NovLang markup whose letters are not prose: footnote ids and image paths.
const FOOTNOTE_DEF = /^\[\^[^\]\s]+\]:[ \t]?/gm;
const FOOTNOTE_REF = /\[\^[^\]\s]+\]/g;
const IMAGE_TARGET = /!\[[^\]\n]*\](\([^)\n]*\))/g;
// Letters with inner hyphens or apostrophes; digits and `_` are captured so the
// whole token can be dropped instead of checking its letter part.
const TOKEN = /[\p{L}\p{M}\p{N}_]+(?:[''-][\p{L}\p{M}\p{N}_]+)*/gu;
const NOT_PROSE = /[\p{N}_]/u;

function skippedRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of [FOOTNOTE_DEF, FOOTNOTE_REF])
    for (const match of source.matchAll(pattern))
      ranges.push([match.index, match.index + match[0].length]);
  for (const match of source.matchAll(IMAGE_TARGET)) {
    const end = match.index + match[0].length;
    ranges.push([end - match[1]!.length, end]);
  }
  return ranges;
}

/** Words of a NovLang chapter with UTF-16 offsets, as CodeMirror counts them. */
export function tokenize(source: string): SpellToken[] {
  const skipped = skippedRanges(source);
  const tokens: SpellToken[] = [];
  for (const match of source.matchAll(TOKEN)) {
    const from = match.index;
    const to = from + match[0].length;
    if (NOT_PROSE.test(match[0])) continue;
    if (skipped.some(([start, end]) => from < end && to > start)) continue;
    tokens.push({ word: match[0], from, to });
  }
  return tokens;
}
