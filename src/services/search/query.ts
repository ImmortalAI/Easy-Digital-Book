export interface SearchQuery {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchError {
  error: "search.invalidRegex";
}

export interface SearchResult {
  chapterId: string;
  from: number;
  to: number;
  matched: string;
  replacementPreview?: string;
}

/** The regexp source both searches use; whole-word means no letter, digit or _ around. */
export function querySource(query: SearchQuery): string {
  const source = query.regex ? query.text : escapeRegExp(query.text);
  return query.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])` : source;
}

/** Compile a query without leaking RegExp construction errors to callers. */
export function compileQuery(query: SearchQuery): RegExp | SearchError {
  if (!query.text) return new RegExp("(?!)", "gu");
  try {
    return new RegExp(querySource(query), `${query.caseSensitive ? "" : "i"}gu`);
  } catch {
    return { error: "search.invalidRegex" };
  }
}

export function advanceStringIndex(value: string, index: number): number {
  if (index + 1 < value.length) {
    const first = value.charCodeAt(index);
    const second = value.charCodeAt(index + 1);
    if (first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff)
      return index + 2;
  }
  return index + 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
