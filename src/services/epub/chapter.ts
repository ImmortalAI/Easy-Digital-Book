import { XMLValidator } from "fast-xml-parser";
import { parse, renderToHTML, type BlockNode, type InlineNode } from "novlang-js";
import type { Book, Chapter } from "@/types/book";
import { AppError } from "@/types/errors";
import { extractFootnotes, replaceNoteMarkers } from "./footnotes";

export interface RenderedNote {
  number: number;
  referenced: boolean;
  xhtml: string;
}

export interface RenderedChapter {
  id: string;
  title: string;
  xhtml: string;
  referencedPaths: string[];
  notes: RenderedNote[];
}

type ResourceMap = Map<string, string> | Readonly<Record<string, string>>;

function mappedPath(map: ResourceMap, path: string): string | undefined {
  return map instanceof Map ? map.get(path) : map[path];
}

function rewriteInline(
  node: InlineNode,
  resources: ResourceMap,
  referenced: string[],
): InlineNode | null {
  if (node.type === "image") {
    const target = mappedPath(resources, node.src);
    if (!target) return null;
    if (!referenced.includes(node.src)) referenced.push(node.src);
    return { ...node, src: target };
  }
  if (node.type === "emphasis" || node.type === "strong") {
    return {
      ...node,
      children: node.children.flatMap((child) => {
        const rewritten = rewriteInline(child, resources, referenced);
        return rewritten ? [rewritten] : [];
      }),
    };
  }
  return node;
}

function rewriteBlock(node: BlockNode, resources: ResourceMap, referenced: string[]): BlockNode {
  if (node.type === "heading" || node.type === "paragraph") {
    return {
      ...node,
      children: node.children.flatMap((child) => {
        const rewritten = rewriteInline(child, resources, referenced);
        return rewritten ? [rewritten] : [];
      }),
    };
  }
  if (node.type === "blockquote" || node.type === "footnoteDef") {
    return {
      ...node,
      children: node.children.map((child) => rewriteBlock(child, resources, referenced)),
    };
  }
  return node;
}

function textOfHeading(node: BlockNode | undefined): string {
  if (!node || node.type !== "heading") return "";
  const textOfInline = (child: InlineNode): string => {
    if (child.type === "text") return child.value;
    if (child.type === "emphasis" || child.type === "strong")
      return child.children.map(textOfInline).join("");
    return "";
  };
  return node.children.map(textOfInline).join("").trim();
}

export function renderChapter(
  chapter: Chapter,
  index: number,
  book: Book,
  resourceMap: ResourceMap,
  includeCustomCss = true,
  firstNoteNumber = 1,
): RenderedChapter {
  const parsed = parse(chapter.source);
  const referencedPaths: string[] = [];
  const document = {
    ...parsed.document,
    children: parsed.document.children.map((node) =>
      rewriteBlock(node, resourceMap, referencedPaths),
    ),
  };
  const title =
    textOfHeading(document.children[0]) || fallbackTitle(book.metadata.language, index + 1);
  const extracted = extractFootnotes(document, firstNoteNumber);
  const body = replaceNoteMarkers(
    renderToHTML(extracted.document, { xhtmlMode: true }),
    (number, first) =>
      `<sup><a epub:type="noteref" class="noteref"${first ? ` id="fnref-${number}"` : ""} href="notes.xhtml#fn-${number}">${number}</a></sup>`,
  );
  const notes = extracted.notes.map((note) => ({
    number: note.number,
    referenced: note.referenced,
    xhtml: renderToHTML({ type: "document", children: note.children }, { xhtmlMode: true }),
  }));
  const language = book.metadata.language || "en";
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">\n<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="theme.css"/>${includeCustomCss ? '<link rel="stylesheet" type="text/css" href="custom.css"/>' : ""}</head>\n<body><section epub:type="chapter" role="doc-chapter">${body}</section></body>\n</html>`;
  const validation = XMLValidator.validate(xhtml);
  if (validation !== true) {
    const issue = validation.err;
    throw new AppError(
      "export.invalidXhtml",
      `Chapter ${index + 1} “${title}”: invalid XHTML`,
      {
        line: issue.line,
        column: issue.col,
        chapter: index + 1,
        position: issue.line && issue.col ? { line: issue.line, column: issue.col } : undefined,
      },
      { params: { chapter: index + 1, title } },
    );
  }
  return { id: chapter.id, title, xhtml, referencedPaths, notes };
}

function fallbackTitle(language: string, number: number): string {
  if (language === "ru") return `Глава ${number}`;
  if (language === "zh-CN") return `第 ${number} 章`;
  return `Chapter ${number}`;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char,
  );
}
