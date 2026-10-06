import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { ident, string, url } from "css-tree/utils";
import parse from "css-tree/parser";
import walk from "css-tree/walker";
const require = createRequire(import.meta.url);
const langCss = require.resolve("@codemirror/lang-css", {
  paths: [process.env.EDB_REPO ?? process.cwd()],
});
const lezer = createRequire(langCss).resolve("@lezer/css");
const variants = {
  lezer: `export {parser} from ${JSON.stringify(lezer)};`,
  rootUtils: `export {ident,string,url} from 'css-tree';`,
  utils: `export {ident,string,url} from 'css-tree/utils';`,
  lezerUtils: `export {parser} from ${JSON.stringify(lezer)}; export {ident,string,url} from 'css-tree/utils';`,
  treeParser: `export {default as parse} from 'css-tree/parser'; export {default as walk} from 'css-tree/walker'; export {ident,string,url} from 'css-tree/utils';`,
  treeFull: `export {parse,walk,lexer,ident,string,url} from 'css-tree';`,
  postcssParts: `export {default as value} from 'postcss-value-parser'; export {default as selector} from 'postcss-selector-parser';`,
  postcssSuite: `export {default as postcss} from 'postcss'; export {default as safe} from 'postcss-safe-parser'; export {default as value} from 'postcss-value-parser'; export {default as selector} from 'postcss-selector-parser';`,
};
for (const [name, contents] of Object.entries(variants)) {
  try {
    const result = await build({
      stdin: { contents, resolveDir: process.cwd(), loader: "js" },
      bundle: true,
      minify: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const bytes = result.outputFiles[0].contents;
    console.log(
      JSON.stringify({ name, minBytes: bytes.length, gzipBytes: gzipSync(bytes).length }),
    );
  } catch (e) {
    console.log(JSON.stringify({ name, error: e.errors.map((x) => x.text) }));
  }
}
console.log(
  "decode",
  JSON.stringify({
    ident: ident.decode(String.raw`d\69 splay`),
    string: string.decode(String.raw`"images/\61 .png"`),
    url: url.decode(String.raw`url(images/\61 .png)`),
  }),
);
for (const css of [
  String.raw`p { d\69 splay: grid; width: calc(1em + 2vw); background: url("images/\61 .png"); }`,
  "p { color red; display: grid; }",
  "p { color: red",
  "p { color: definitely-not-a-color; }",
]) {
  const errors = [];
  const nodes = [];
  const ast = parse(css, {
    positions: true,
    onParseError: (e) => errors.push({ message: e.message, offset: e.offset }),
  });
  walk(ast, (node) => {
    if (["Declaration", "Dimension", "Url", "Raw"].includes(node.type))
      nodes.push({
        type: node.type,
        property: node.property,
        value: node.value,
        unit: node.unit,
        from: node.loc?.start.offset,
        to: node.loc?.end.offset,
      });
  });
  console.log("tree", JSON.stringify({ css, errors, nodes }));
}
