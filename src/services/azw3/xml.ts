import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { AppError } from "@/types/errors";

/** fast-xml-parser's preserveOrder representation; attributes remain strings. */
export interface XmlNode {
  [key: string]: XmlNode[] | string | Record<string, string> | undefined;
  ":@"?: Record<string, string>;
}
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: false,
  // Also decodes numeric XML entities; without this they are double-escaped on build.
  htmlEntities: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  format: false,
  suppressEmptyNode: false,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
});
export function validateXml(xhtml: string): void {
  const result = XMLValidator.validate(xhtml);
  if (result !== true)
    throw new AppError("export.invalidXhtml", "Invalid export XHTML", result.err);
}
export function parseXml(xhtml: string): XmlNode[] {
  validateXml(xhtml);
  return parser.parse(xhtml) as XmlNode[];
}
export function buildXml(nodes: XmlNode[]): string {
  return builder.build(nodes) as string;
}
export function tagName(node: XmlNode): string | undefined {
  return Object.keys(node).find(
    (key) => key !== ":@" && !key.startsWith("#") && !key.startsWith("?"),
  );
}
export function children(node: XmlNode): XmlNode[] {
  const tag = tagName(node);
  return tag ? (node[tag] as XmlNode[]) : [];
}
export function visitElements(nodes: XmlNode[], visit: (node: XmlNode, tag: string) => void): void {
  for (const node of nodes) {
    const tag = tagName(node);
    if (!tag) continue;
    visit(node, tag);
    visitElements(children(node), visit);
  }
}
