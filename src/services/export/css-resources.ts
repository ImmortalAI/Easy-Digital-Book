/** Rewrites the url() forms supported by export preparation. */
export function rewriteCssResourceUrls(
  css: string,
  resolve: (path: string) => string | undefined,
): string {
  return css.replace(/url\(["']?([^"')]+)["']?\)/g, (whole, rawPath: string) => {
    const path = rawPath.trim();
    const rewritten = resolve(path);
    if (rewritten !== undefined) return `url("${rewritten}")`;
    return path.startsWith("images/") ? 'url("data:,")' : whole;
  });
}
