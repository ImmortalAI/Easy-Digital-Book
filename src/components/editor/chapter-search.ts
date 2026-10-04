import { SearchQuery as CmSearchQuery } from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import { compileQuery, querySource, type SearchQuery } from "@/services/search/query";

export interface ChapterSearchInput extends SearchQuery {
  replace: string;
}

/**
 * The chapter panel always hands CodeMirror a regexp built by the book
 * search's `querySource`, so Mod+F and Mod+Shift+F find the same matches.
 * Outside regex mode the replacement is literal: `$` is escaped and
 * `literal` stops CodeMirror from unquoting `\n`.
 */
export function buildChapterQuery(
  input: ChapterSearchInput,
): { query: CmSearchQuery } | { error: "search.invalidRegex" } {
  const compiled = compileQuery(input);
  if ("error" in compiled) return compiled;
  return {
    query: new CmSearchQuery({
      search: input.text ? querySource(input) : "",
      regexp: true,
      caseSensitive: input.caseSensitive,
      literal: !input.regex,
      replace: input.regex ? input.replace : input.replace.replace(/\$/g, "$$$$"),
    }),
  };
}

export const MATCH_CAP = 1000;

export interface MatchCount {
  total: number;
  capped: boolean;
  /** 1-based index of the match the main selection covers exactly. */
  current: number | null;
}

export function countMatches(
  state: EditorState,
  query: CmSearchQuery,
  cap = MATCH_CAP,
): MatchCount {
  if (!query.valid) return { total: 0, capped: false, current: null };
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current: number | null = null;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (total === cap) return { total, capped: true, current };
    total++;
    if (next.value.from === from && next.value.to === to) current = total;
  }
  return { total, capped: false, current };
}
