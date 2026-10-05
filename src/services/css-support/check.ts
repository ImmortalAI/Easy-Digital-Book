import { parser } from "@lezer/css";
import { ident, string, url } from "css-tree/utils";
import { kindleSupport } from "./kindle";
import type { CssFinding, KindleSupportTable, Support } from "./types";

type CssNode = ReturnType<typeof parser.parse>["topNode"];
const identifier = (raw: string) => ident.decode(raw).toLowerCase();

function hasError(node: CssNode): boolean {
  if (node.type.isError) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (hasError(child)) return true;
  }
  return false;
}
function ancestor(node: CssNode, name: string): CssNode | null {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === name) return parent;
  }
  return null;
}
function isBookImage(path: string): boolean {
  // URI decoding is only for path traversal checks, never CSS escape decoding.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return (
    decoded.startsWith("images/") &&
    decoded.length > 7 &&
    !/[\\\u0000-\u001f]/.test(decoded) &&
    !decoded.split("/").some((segment) => segment === "." || segment === "..")
  );
}

/** Advisory checks only. No DOM, CSS rewriting, cascade evaluation or export gating. */
export function checkKindleCss(
  css: string,
  table: KindleSupportTable = kindleSupport,
): CssFinding[] {
  const tree = parser.parse(css);
  const findings: CssFinding[] = [];
  const properties = new Map(table.properties.map((row) => [row.property, row]));
  const units = new Map(table.units.map((row) => [row.name, row]));
  const atRules = new Map(table.atRules.map((row) => [row.name, row]));
  const selectors = new Map(table.selectors.map((row) => [`${row.pattern}:${row.name}`, row]));
  const text = (node: CssNode) => css.slice(node.from, node.to);
  let syntaxReported = false;

  function add(
    from: number,
    to: number,
    severity: CssFinding["severity"],
    code: string,
    params: CssFinding["params"] = {},
  ) {
    findings.push({ from, to, severity, code, params });
  }
  function syntax(node: CssNode) {
    if (syntaxReported) return;
    syntaxReported = true;
    const from = Math.min(node.from, Math.max(0, css.length - 1));
    add(from, Math.max(from + 1, node.to), "info", "syntax");
  }
  function support(node: CssNode, value: Support, note: string, params: CssFinding["params"]) {
    if (value === "supported") return;
    add(
      node.from,
      node.to,
      value === "unsupported" ? "warning" : "info",
      note.replace(/^cssSupport\./, ""),
      params,
    );
  }
  function selector(node: CssNode, pattern: string, name: string) {
    const row = selectors.get(`${pattern}:${name}`);
    const params = { selector: text(node) };
    if (row) support(node, row.support, row.note, params);
    else add(node.from, node.to, "info", "unknownSelector", params);
  }

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      if (node.type.isError) syntax(node);
      if (node.name === "Declaration" && !node.getChild(":")?.nextSibling) syntax(node);
    },
  });
  tree.iterate({
    enter(ref) {
      const node = ref.node;
      if (node.type.isError || node.name === "Comment" || node.name === "StringLiteral")
        return false;
      if (node.name === "Declaration") {
        if (hasError(node)) return false;
        const property = node.getChild("PropertyName") ?? node.getChild("VariableName");
        if (!property) return;
        const raw = ident.decode(text(property));
        if (raw.startsWith("--")) {
          add(property.from, property.to, "info", "customProperty");
          return false;
        }
        // @font-face contains descriptors, not ordinary CSS properties.
        const at = ancestor(node, "AtRule");
        const inFontFace = at?.firstChild && identifier(text(at.firstChild)) === "@font-face";
        if (!inFontFace) {
          const name = raw.toLowerCase();
          const row = properties.get(name);
          if (!row)
            add(property.from, property.to, "warning", "unknownProperty", { property: name });
          else {
            let override = false;
            for (let child = property.nextSibling; child; child = child.nextSibling) {
              if (child.name !== "ValueName") continue;
              const value = identifier(text(child));
              const status = row.values?.[value];
              if (status !== undefined) {
                override = true;
                support(child, status, "cssSupport.value", { property: name, value });
              }
            }
            if (!override) support(property, row.support, row.note, { property: name });
          }
        }
      }
      if (node.name === "Unit" && ancestor(node, "Declaration")) {
        const name = identifier(text(node));
        const row = units.get(name);
        if (row) support(node, row.support, row.note, { unit: name });
        else add(node.from, node.to, "info", "unknownUnit", { unit: name });
      }
      if (node.name === "Callee" && identifier(text(node)) === "var") {
        add(node.from, node.to, "info", "customProperty");
      }
      if (node.name === "PseudoClassName" && node.parent && !hasError(node.parent)) {
        const colon = node.prevSibling;
        if (colon?.name === ":" || colon?.name === "::") {
          const args = node.nextSibling?.name === "ArgList" ? node.nextSibling : null;
          const from = colon.from,
            to = args?.to ?? node.to;
          const name = identifier(text(node));
          // The selector range excludes its preceding tag/class selector.
          const row = selectors.get(
            `${colon.name === "::" ? "pseudo-element" : "pseudo-class"}:${name}`,
          );
          const params = { selector: css.slice(from, to) };
          if (row) {
            if (row.support !== "supported")
              add(
                from,
                to,
                row.support === "unsupported" ? "warning" : "info",
                row.note.replace(/^cssSupport\./, ""),
                params,
              );
          } else add(from, to, "info", "unknownSelector", params);
        }
      }
      if (node.name === "ChildOp" || node.name === "SiblingOp")
        selector(node, "combinator", text(node));
      if (node.name === "DescendantSelector") {
        const left = node.firstChild,
          right = left?.nextSibling;
        if (left && right && !hasError(node)) {
          const gap = css.slice(left.to, right.from);
          if (/^\s+$/.test(gap)) {
            const row = selectors.get("combinator: ");
            if (row && row.support !== "supported")
              add(
                left.to,
                right.from,
                row.support === "unsupported" ? "warning" : "info",
                row.note.replace(/^cssSupport\./, ""),
                { selector: gap },
              );
          }
        }
      }
      if (node.name === "AttributeSelector" && !hasError(node)) {
        const start = node.getChild("[");
        const end = node.getChild("]");
        if (start && end) {
          const row = selectors.get("attribute:[]");
          const params = { selector: css.slice(start.from, end.to) };
          if (row) {
            if (row.support !== "supported")
              add(
                start.from,
                end.to,
                row.support === "unsupported" ? "warning" : "info",
                row.note.replace(/^cssSupport\./, ""),
                params,
              );
          } else add(start.from, end.to, "info", "unknownSelector", params);
        }
      }
      // Each statement's first token owns the @-name, including specialized
      // Lezer statement nodes (MediaStatement, SupportsStatement, etc.).
      if (
        node.parent?.firstChild?.from === node.from &&
        /^@[\w\\-]/.test(text(node)) &&
        !node.firstChild
      ) {
        const name = identifier(text(node).slice(1));
        const row = atRules.get(name);
        if (row) support(node, row.support, row.note, { atRule: name });
        else add(node.from, node.to, "info", "unknownAtRule", { atRule: name });
      }
      if (node.name === "CallLiteral" && !hasError(node)) {
        const tag = node.getChild("CallTag");
        if (!tag || identifier(text(tag)) !== "url") return;
        const value = node.getChild("StringLiteral") ?? node.getChild("ParenthesizedContent");
        if (!value) return;
        const path =
          value.name === "StringLiteral"
            ? string.decode(text(value))
            : url.decode(`url(${text(value)})`);
        if (!isBookImage(path)) add(value.from, value.to, "warning", "externalUrl", { url: path });
      }
    },
  });
  const unique = new Map(
    findings.map((item) => [`${item.from}:${item.to}:${item.code}:${item.severity}`, item]),
  );
  return [...unique.values()].sort(
    (a, b) => a.from - b.from || a.to - b.to || a.code.localeCompare(b.code),
  );
}
