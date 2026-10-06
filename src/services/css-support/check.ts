import type { CssNode, WalkContext } from "css-tree";
import walk from "css-tree/walker";
import { ident } from "css-tree/utils";
import { tokenTypes } from "css-tree/tokenizer";
import { kindleSupport } from "./kindle";
import { parseCss, type CssRange } from "./parse";
import type { CssFinding, KindleSupportTable, Support } from "./types";

const identifier = (raw: string) => ident.decode(raw).toLowerCase();
const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);
function isBookImage(path: string): boolean {
  // URI decoding is for path traversal checks, never CSS escape decoding.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  return (
    decoded.startsWith("images/") &&
    decoded.length > 7 &&
    !Array.from(decoded).some((char) => char === "\\" || char.charCodeAt(0) < 32) &&
    !decoded.split("/").some((segment) => segment === "." || segment === "..")
  );
}

/** Advisory analysis. Grammar/recovery/decoding belong to the CSS libraries. */
export function checkKindleCss(
  css: string,
  table: KindleSupportTable = kindleSupport,
): CssFinding[] {
  const parsed = parseCss(css);
  const findings: CssFinding[] = [];
  const properties = new Map(table.properties.map((row) => [row.property, row]));
  const units = new Map(table.units.map((row) => [row.name, row]));
  const atRules = new Map(table.atRules.map((row) => [row.name, row]));
  const selectors = new Map(table.selectors.map((row) => [`${row.pattern}:${row.name}`, row]));
  const add = (
    range: CssRange,
    severity: CssFinding["severity"],
    code: string,
    params: CssFinding["params"] = {},
  ) => findings.push({ ...range, severity, code, params });
  function support(range: CssRange, value: Support, note: string, params: CssFinding["params"]) {
    if (value !== "supported")
      add(
        range,
        value === "unsupported" ? "warning" : "info",
        note.replace(/^cssSupport\./, ""),
        params,
      );
  }
  if (parsed.syntax) add(parsed.syntax, "info", "syntax");
  for (const tree of parsed.trees)
    walk(tree, {
      enter(this: WalkContext, node: CssNode) {
        if (!node.loc || node.type === "Raw") return this.skip;
        const range = { from: node.loc.start.offset, to: node.loc.end.offset };
        const token = parsed.tokens.get(range.from);
        if (node.type === "Declaration") {
          if (this.atrulePrelude) return this.skip;
          const property = ident.decode(node.property);
          const propertyRange = {
            from: range.from,
            to: token?.end ?? range.from + node.property.length,
          };
          if (property.startsWith("--")) {
            add(propertyRange, "info", "customProperty");
            return this.skip;
          }
          if (this.atrule && identifier(this.atrule.name) === "font-face") return;
          const name = property.toLowerCase(),
            row = properties.get(name);
          if (!row) add(propertyRange, "warning", "unknownProperty", { property: name });
          else {
            let override = false;
            if (node.value.type === "Value")
              node.value.children.forEach((child) => {
                if (child.type !== "Identifier" || !child.loc) return;
                const value = identifier(child.name),
                  status =
                    row.values && Object.hasOwn(row.values, value) ? row.values[value] : undefined;
                if (status !== undefined) {
                  override = true;
                  support(
                    { from: child.loc.start.offset, to: child.loc.end.offset },
                    status,
                    "cssSupport.value",
                    { property: name, value },
                  );
                }
              });
            if (!override) support(propertyRange, row.support, row.note, { property: name });
          }
        }
        if (node.type === "Dimension" || node.type === "Percentage") {
          const unit = node.type === "Dimension" ? identifier(node.unit) : "%";
          const unitRange = { from: range.from + node.value.length, to: range.to };
          const row = units.get(unit);
          if (row) support(unitRange, row.support, row.note, { unit });
          else add(unitRange, "info", "unknownUnit", { unit });
        }
        if (node.type === "Function" && identifier(node.name) === "var") {
          add(
            { from: range.from, to: (token?.end ?? range.from + node.name.length + 1) - 1 },
            "info",
            "customProperty",
          );
        }
        if (
          [
            "PseudoClassSelector",
            "PseudoElementSelector",
            "Combinator",
            "AttributeSelector",
          ].includes(node.type)
        ) {
          let pattern: string, name: string;
          if (node.type === "PseudoClassSelector" || node.type === "PseudoElementSelector") {
            name = identifier(node.name);
            pattern =
              node.type === "PseudoElementSelector" || legacyPseudoElements.has(name)
                ? "pseudo-element"
                : "pseudo-class";
          } else if (node.type === "Combinator") {
            pattern = "combinator";
            name = node.name;
          } else {
            pattern = "attribute";
            name = "[]";
          }
          const row = selectors.get(`${pattern}:${name}`),
            params = { selector: css.slice(range.from, range.to) };
          if (row) support(range, row.support, row.note, params);
          else add(range, "info", "unknownSelector", params);
        }
        if (node.type === "Atrule") {
          const name = identifier(node.name),
            atRange = { from: range.from, to: token?.end ?? range.from + node.name.length + 1 };
          const row = atRules.get(name);
          if (row) support(atRange, row.support, row.note, { atRule: name });
          else add(atRange, "info", "unknownAtRule", { atRule: name });
        }
        if (node.type === "Url") {
          let from = token?.type === tokenTypes.Function ? token.end : range.from + 4;
          let to = css[range.to - 1] === ")" ? range.to - 1 : range.to;
          while (
            parsed.tokens.get(from)?.type === tokenTypes.WhiteSpace ||
            parsed.tokens.get(from)?.type === tokenTypes.Comment
          )
            from = parsed.tokens.get(from)!.end;
          const argument = parsed.tokens.get(from);
          if (argument?.type === tokenTypes.String) to = argument.end;
          else {
            const raw = css.slice(from, to);
            const trimmed = raw.trim();
            from += raw.length - raw.trimStart().length;
            to = from + trimmed.length;
          }
          if (!isBookImage(node.value))
            add({ from, to }, "warning", "externalUrl", { url: node.value });
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
