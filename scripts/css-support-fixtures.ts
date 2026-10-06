import { kindleSupport } from "../src/services/css-support/kindle";

const propertyValues: Record<string, string> = {
  background: "#ddd",
  "background-attachment": "fixed",
  "background-color": "#ddd",
  "background-image": "url(images/css-only.png)",
  "background-position": "center",
  "background-repeat": "repeat",
  "background-size": "2em",
  border: "0.2em solid",
  "border-bottom": "0.2em solid",
  "border-color": "black",
  "border-left": "0.2em solid",
  "border-right": "0.2em solid",
  "border-style": "dotted",
  "border-top": "0.2em solid",
  "border-width": "0.2em",
  "border-radius": "1em",
  "border-collapse": "collapse",
  "border-spacing": "1em",
  bottom: "1em",
  clear: "both",
  color: "#888",
  content: '"GENERATED"',
  "counter-increment": "sample",
  "counter-reset": "sample",
  direction: "rtl",
  display: "block",
  float: "right",
  font: "italic 1.2em serif",
  "font-family": "monospace",
  "font-size": "1.2em",
  "font-style": "italic",
  "font-variant": "small-caps",
  "font-weight": "bold",
  height: "4em",
  left: "1em",
  "letter-spacing": "0.2em",
  "line-height": "2",
  "list-style": "square",
  "list-style-image": "url(images/css-only.png)",
  "list-style-position": "inside",
  "list-style-type": "square",
  margin: "2em",
  "margin-top": "2em",
  "margin-bottom": "2em",
  "margin-left": "2em",
  "margin-right": "2em",
  "max-height": "2em",
  "max-width": "10em",
  "min-height": "4em",
  "min-width": "20em",
  opacity: "0.4",
  overflow: "hidden",
  padding: "1em",
  "padding-top": "1em",
  "padding-bottom": "1em",
  "padding-left": "1em",
  "padding-right": "1em",
  position: "relative",
  right: "1em",
  "text-align": "right",
  "text-decoration": "underline",
  "text-indent": "3em",
  "text-transform": "uppercase",
  top: "1em",
  "vertical-align": "super",
  visibility: "hidden",
  "white-space": "pre",
  width: "12em",
  "word-spacing": "0.5em",
  "word-wrap": "break-word",
  "z-index": "10",
};
interface CssSupportSample {
  id: string;
  css: string;
  description: string;
  source: string;
}
function sample(id: string, css: string, description: string): CssSupportSample {
  return {
    id,
    css,
    description,
    source: `# CSS ${id}\n\n> REFERENCE: The quick brown fox jumps over the lazy dog. 0123456789.\n\nSAMPLE: The quick brown fox jumps over the lazy dog. 0123456789.\n\nSAMPLE TWO: Repeated passage for sibling selectors and spacing.\n\nSAMPLE THREE: ALongUnbrokenWordToObserveWrappingAndWidth.\n\n![CSS sample image](images/css-only.png)\n\n${description}\n\nRule: ${css}`,
  };
}
const propertySamples = kindleSupport.properties.flatMap((row) => {
  const value = propertyValues[row.property];
  if (!value) throw new Error(`Missing device sample value: ${row.property}`);
  const description = `Compare ${row.property} against a second export with custom CSS removed. Record the visible effect, context, and any page-layout change; preservation alone is not a pass. Some properties need positioning/table/list context: an inapplicable declaration cannot prove non-support.`;
  return [
    sample(`property-${row.property}`, `p { ${row.property}: ${value}; }`, description),
    ...Object.keys(row.values ?? {}).map((keyword) =>
      sample(`value-${row.property}-${keyword}`, `p { ${row.property}: ${keyword}; }`, description),
    ),
  ];
});
const selectorSamples = kindleSupport.selectors.map((row) => {
  let selector: string;
  if (row.pattern === "combinator") selector = `h1${row.name}p`;
  else if (row.pattern === "attribute") selector = 'img[alt="CSS sample image"]';
  else
    selector = `p${row.pattern === "pseudo-element" ? "::" : ":"}${row.name}${["nth-child", "nth-of-type"].includes(row.name) ? "(2)" : row.name === "has" ? "(> img)" : ["is", "not", "where"].includes(row.name) ? "(blockquote)" : ""}`;
  const description = `Selector ${selector}: compare the selected element's underline or image border with CSS removed. For generated pseudo-elements look for GENERATED. For interactive pseudo-classes record whether the required input state can be reached on the device; absent state is inconclusive.`;
  return sample(
    `selector-${row.pattern}-${row.name === " " ? "descendant" : row.name === ">" ? "child" : row.name === "+" ? "adjacent" : row.name === "~" ? "sibling" : row.name === "[]" ? "attribute" : row.name}`,
    `${selector} { text-decoration: underline; border: 0.2em solid;${row.pattern === "pseudo-element" ? ' content: "GENERATED";' : ""} }`,
    description,
  );
});
const atRuleCss: Record<string, string> = {
  media: "@media amzn-kf8 { p { text-decoration: underline; } }",
  supports: "@supports (display: block) { p { text-decoration: underline; } }",
  "font-face":
    '@font-face { font-family: SampleFont; src: url("images/missing-font.woff"); } p { font-family: SampleFont; }',
  import: '@import "missing.css";',
  charset: '@charset "UTF-8";',
  namespace: '@namespace sample "urn:sample";',
  page: "@page { margin: 2em; }",
  keyframes:
    "@keyframes sample { from { opacity: 0.2; } to { opacity: 1; } } p { animation: sample 2s infinite; }",
  layer: "@layer sample { p { text-decoration: underline; } }",
};
const atRuleSamples = kindleSupport.atRules.map((row) =>
  sample(
    `at-rule-${row.name}`,
    atRuleCss[row.name]!,
    `At-rule @${row.name}: record conditional styling/layout effect, comparing CSS removed. Font embedding and external stylesheet import are app limitations; no missing resource should be mistaken for a device verdict. Charset/namespace need a dedicated non-ASCII/namespaced fixture to promote support.`,
  ),
);
const unitSamples = kindleSupport.units.map((row) =>
  sample(
    `unit-${row.name}`,
    `p { text-indent: 2${row.name}; }`,
    `Unit ${row.name}: compare the sample paragraph indentation with CSS removed, repeat with reader font size changed. Record measurable movement and whether it scales with font or viewport.`,
  ),
);

/** One isolated .edb per check; a catalog chapter alone cannot prove rendering. */
export const cssSupportSamples: readonly CssSupportSample[] = [
  ...propertySamples,
  ...selectorSamples,
  ...atRuleSamples,
  ...unitSamples,
];
