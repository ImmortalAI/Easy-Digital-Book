import type { BlockNode, InlineNode, NovLangDocument } from "novlang-js";

/**
 * Private-use characters that bracket a note number in rendered HTML until
 * replaceNoteMarkers swaps them for a link. novlang-js renders footnote
 * references itself and cannot be told where the note lives, so references
 * travel through the renderer as marked text instead.
 */
const OPEN = "\uE000";
const CLOSE = "\uE001";
const MARKER_CHARS = /[\uE000\uE001]/g;
const MARKER = /\uE000(\d+)\uE001/g;

export interface ExtractedNote {
  number: number;
  /** The id the author wrote: `1` in `[^1]`. */
  label: string;
  /** False when no text points at the note, so it must not get a backlink. */
  referenced: boolean;
  children: BlockNode[];
}

export interface FootnoteExtraction {
  /** The chapter without its footnote definitions, references replaced by markers. */
  document: NovLangDocument;
  notes: ExtractedNote[];
}

export function extractFootnotes(document: NovLangDocument, firstNumber = 1): FootnoteExtraction {
  const definitions = new Map<string, BlockNode[]>();
  const body: BlockNode[] = [];
  for (const node of document.children) {
    if (node.type !== "footnoteDef") body.push(node);
    else if (!definitions.has(node.id)) definitions.set(node.id, node.children);
  }
  const numbers = new Map<string, number>();
  const referenced = new Set<string>();
  let next = firstNumber;
  const numberFor = (label: string) => {
    let number = numbers.get(label);
    if (number === undefined) {
      number = next++;
      numbers.set(label, number);
    }
    return number;
  };

  const mapInline =
    (inNote: boolean) =>
    (node: InlineNode): InlineNode => {
      if (node.type === "text") return { ...node, value: node.value.replace(MARKER_CHARS, "") };
      if (node.type === "emphasis" || node.type === "strong")
        return { ...node, children: node.children.map(mapInline(inNote)) };
      if (node.type === "footnoteRef" && node.resolved && definitions.has(node.id)) {
        if (inNote) return { type: "text", value: `[${node.id}]` };
        referenced.add(node.id);
        return { type: "text", value: `${OPEN}${numberFor(node.id)}${CLOSE}` };
      }
      return node;
    };
  const mapBlock =
    (inNote: boolean) =>
    (node: BlockNode): BlockNode => {
      if (node.type === "heading" || node.type === "paragraph")
        return { ...node, children: node.children.map(mapInline(inNote)) };
      if (node.type === "blockquote" || node.type === "footnoteDef")
        return { ...node, children: node.children.map(mapBlock(inNote)) };
      return node;
    };

  const children = body.map(mapBlock(false));
  for (const label of definitions.keys()) numberFor(label);
  const notes = [...numbers].map(([label, number]) => ({
    number,
    label,
    referenced: referenced.has(label),
    children: definitions.get(label)!.map(mapBlock(true)),
  }));
  return { document: { ...document, children }, notes };
}

/** Swap each marker for a link; `first` is true once per number, for its anchor id. */
export function replaceNoteMarkers(
  html: string,
  link: (number: number, first: boolean) => string,
): string {
  const seen = new Set<number>();
  return html.replace(MARKER, (_, digits: string) => {
    const number = Number(digits);
    const first = !seen.has(number);
    seen.add(number);
    return link(number, first);
  });
}

/** Kindle opens a note as a popup when the note starts with a link back. */
export function prependToFirstParagraph(html: string, prefix: string): string {
  return html.startsWith("<p>")
    ? `<p>${prefix}${html.slice(3)}`
    : `<p>${prefix}</p>
${html}`;
}

export function countFootnotes(document: NovLangDocument): number {
  return new Set(
    document.children.flatMap((node) => (node.type === "footnoteDef" ? [node.id] : [])),
  ).size;
}
