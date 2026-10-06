import { parser } from "@lezer/css";
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import { tokenize, tokenTypes } from "css-tree/tokenizer";
import { ident } from "css-tree/utils";
import type { CssNode, ParseOptions, WalkContext } from "css-tree";

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
  const validatedRanges: (CssRange & { replacement: string })[] = [];
  function index(tree: CssNode) {
    walk(tree, function (this: WalkContext, node) {
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
      // CSS Tree tolerates URLs terminated by EOF, including unclosed strings.
      // Such nodes must not hide Lezer's structural errors (or errors at their end).
      if (node.type === "Url") {
        let delimiterStart = to - 1;
        while (normalized[delimiterStart - 1] === "\\") delimiterStart--;
        const completeUrl = normalized[to - 1] === ")" && (to - 1 - delimiterStart) % 2 === 0;
        let argumentStart =
          tokens.get(from)?.type === tokenTypes.Function ? tokens.get(from)!.end : from + 4;
        while (
          [tokenTypes.WhiteSpace, tokenTypes.Comment].includes(
            tokens.get(argumentStart)?.type ?? -1,
          )
        )
          argumentStart = tokens.get(argumentStart)!.end;
        const argument = tokens.get(argumentStart);
        const completeString =
          argument?.type !== tokenTypes.BadString &&
          (argument?.type !== tokenTypes.String ||
            normalized[argument.end - 1] === normalized[argument.start]);
        if (completeUrl && completeString)
          validatedRanges.push({ from, to, replacement: "url(" + " ".repeat(to - from - 5) + ")" });
        else report(from, to);
      }
      // Lezer's generic function arguments do not accept the selector list
      // in `:nth-child(An+B of S)`, which CSS Tree validates explicitly.
      if (node.type === "Nth" && node.selector)
        validatedRanges.push({ from, to, replacement: "n" + " ".repeat(to - from - 1) });
      if (
        node.type === "Raw" &&
        this.function &&
        ident.decode(this.function.name).toLowerCase() === "var" &&
        !ident.decode(this.declaration?.property ?? "").startsWith("--")
      ) {
        try {
          const fallback = parse(normalized.slice(from, to), {
            positions: true,
            context: "value",
            offset: from,
            parseCustomProperty: true,
          });
          trees.push(fallback);
          index(fallback);
        } catch {
          // A variable fallback may contain arbitrary tokens; keep it advisory.
        }
      }
    });
  }
  index(ast);
  // Adapt only library-validated constructs before structural parsing. Merely
  // suppressing their errors leaves cascading Lezer errors outside their ranges.
  const structural = normalized.split("");
  for (const range of validatedRanges)
    for (let offset = range.from; offset < range.to; offset++)
      structural[offset] = range.replacement[offset - range.from]!;
  const lezer = parser.parse(structural.join(""));
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
      if (ref.type.isError) report(ref.from, ref.to);
    },
  });
  return { trees, tokens, syntax };
}
