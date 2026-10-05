import { parser } from "@lezer/css";
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import { tokenize, tokenTypes } from "css-tree/tokenizer";
import { ident } from "css-tree/utils";
import type { CssNode, ParseOptions } from "css-tree";

export interface CssToken {
  type: number;
  start: number;
  end: number;
}
export interface CssRange {
  from: number;
  to: number;
}

/** Semantic CSS Tree recovery and Lezer structural errors complement each other.
 * No user CSS is changed. The offset-preserving URL spelling normalization is
 * only a parser input adapter: CSS Tree treats escaped url as a generic function.
 */
export function parseCss(css: string): {
  trees: CssNode[];
  tokens: Map<number, CssToken>;
  syntax: CssRange | null;
} {
  const tokens = new Map<number, CssToken>();
  const parts: string[] = [];
  let copied = 0;
  tokenize(css, (type, start, end) => {
    tokens.set(start, { type, start, end });
    if (
      type === tokenTypes.Function &&
      ident.decode(css.slice(start, end - 1)).toLowerCase() === "url"
    ) {
      parts.push(css.slice(copied, start), "url(" + " ".repeat(end - start - 4));
      copied = end;
    }
  });
  parts.push(css.slice(copied));
  const normalized = parts.join("");
  const lezer = parser.parse(normalized);
  let syntax: CssRange | null = null;
  const report = (from: number, to = from + 1) => {
    if (syntax || !css.length) return;
    from = Math.min(from, css.length - 1);
    syntax = { from, to: Math.min(css.length, Math.max(from + 1, to)) };
  };
  const parseOptions: ParseOptions = {
    positions: true,
    onParseError: (error) => report(error.offset),
  };
  const ast = parse(normalized, parseOptions);
  const trees: CssNode[] = [ast];
  const declarationStarts = new Set<number>();
  const ruleStarts = new Set<number>();
  const validUrls: CssRange[] = [];
  function index(tree: CssNode) {
    walk(tree, (node) => {
      if (!node.loc) return;
      const { offset: from } = node.loc.start,
        { offset: to } = node.loc.end;
      if (node.type === "Declaration") {
        declarationStarts.add(from);
        if (
          !ident.decode(node.property).startsWith("--") &&
          node.value.type === "Value" &&
          node.value.children.isEmpty
        )
          report(from, to);
      }
      if (node.type === "Rule") ruleStarts.add(from);
      if (node.type === "Url") validUrls.push({ from, to });
    });
  }
  index(ast);
  // A malformed function can consume the remainder in CSS Tree. Analyze valid
  // declarations/rules recovered independently by Lezer through the SAME parser.
  lezer.iterate({
    enter(ref) {
      const node = ref.node;
      const context =
        node.name === "Declaration" && !declarationStarts.has(node.from)
          ? "declaration"
          : node.name === "RuleSet" && node.getChild("Block") && !ruleStarts.has(node.from)
            ? "rule"
            : null;
      if (!context) return;
      try {
        const recovered = parse(normalized.slice(node.from, node.to), {
          ...parseOptions,
          context,
          offset: node.from,
        });
        trees.push(recovered);
        index(recovered);
      } catch {
        // Fragment entry points may throw rather than produce Raw. The main
        // tolerant tree remains available and the error is still advisory.
        report(node.from, node.to);
      }
    },
  });
  lezer.iterate({
    enter(ref) {
      if (
        ref.type.isError &&
        !validUrls.some((range) => ref.from >= range.from && ref.to <= range.to)
      )
        report(ref.from, ref.to);
    },
  });
  return { trees, tokens, syntax };
}
