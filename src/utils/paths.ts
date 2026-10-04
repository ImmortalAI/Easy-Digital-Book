export function normalizeResourceName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "image";
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const stem =
    (dot > 0 ? base.slice(0, dot) : base)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .toLowerCase() || "image";
  return `${stem}${extension ? `.${extension}` : ""}`;
}
export function uniqueResourcePath(
  existing: Iterable<string>,
  fileName: string,
  extension?: string,
): string {
  const used = new Set(existing);
  const safeName = normalizeResourceName(fileName);
  const nameDot = safeName.lastIndexOf(".");
  const safe = extension
    ? `${nameDot > 0 ? safeName.slice(0, nameDot) : safeName}.${extension}`
    : safeName;
  if (!used.has(`images/${safe}`)) return `images/${safe}`;
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `images/${stem}-${n}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** What the rename field accepts: the same characters file names keep. */
export function sanitizeNameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
