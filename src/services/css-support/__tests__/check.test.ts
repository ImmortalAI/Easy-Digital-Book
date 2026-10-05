import { describe, expect, it } from "vitest";
import { checkKindleCss } from "../check";
import type { KindleSupportTable, Support } from "../types";
import { themeCss } from "@/assets/epub/theme.css";
import { customCssTemplate } from "@/assets/epub/custom.css";
const row = (support: Support = "supported", note = "cssSupport.property") => ({
  support,
  note,
  source: "test:both-devices",
});
const table: KindleSupportTable = {
  properties: [
    { property: "display", ...row("partial"), values: { grid: "unsupported", block: "supported" } },
    ...["color", "width", "content", "background", "font-family"].map((property) => ({
      property,
      ...row(),
    })),
    { property: "position", ...row("supported"), values: { fixed: "unsupported" } },
  ],
  selectors: [
    { pattern: "pseudo-class", name: "hover", ...row("unsupported", "cssSupport.selector") },
    { pattern: "pseudo-class", name: "nth-child", ...row("partial", "cssSupport.selector") },
    { pattern: "pseudo-element", name: "before", ...row("unsupported", "cssSupport.selector") },
    { pattern: "combinator", name: ">", ...row("partial", "cssSupport.selector") },
    { pattern: "combinator", name: " ", ...row("supported", "cssSupport.selector") },
    { pattern: "attribute", name: "[]", ...row("partial", "cssSupport.selector") },
  ],
  units: [
    { name: "vw", ...row("unsupported", "cssSupport.unit") },
    { name: "em", ...row() },
  ],
  atRules: [
    { name: "media", ...row("partial", "cssSupport.atRule") },
    { name: "supports", ...row("unsupported", "cssSupport.atRule") },
  ],
};
const findings = (css: string) =>
  checkKindleCss(css, table).map((item) => ({ ...item, token: css.slice(item.from, item.to) }));

describe("checkKindleCss", () => {
  it("checks properties and overrides at exact source tokens", () => {
    const result = findings("p { mystery: x; display: grid; position: fixed; }");
    expect(result.map((x) => [x.code, x.token, x.severity])).toEqual([
      ["unknownProperty", "mystery", "warning"],
      ["value", "grid", "warning"],
      ["value", "fixed", "warning"],
    ]);
    expect(findings("p { display: block; color: red; }")).toEqual([]);
  });
  it("checks each selector pattern and nested at-rules", () => {
    const result = findings(
      "@media print { @supports (display: grid) { p:hover::before > a[title]:nth-child(2n) { width:2vw; } } }",
    );
    expect(result.map((x) => x.token)).toEqual([
      "@media",
      "@supports",
      ":hover",
      "::before",
      ">",
      "[title]",
      ":nth-child(2n)",
      "vw",
    ]);
    expect(result.filter((x) => x.token === "vw")[0]?.severity).toBe("warning");
  });
  it("ignores comments and strings and checks nested calc units", () => {
    const result = findings(
      '/* display:grid */ p { content: "10vh :hover url(https://x)"; width:calc(1em + 2vw); }',
    );
    expect(result.map((x) => x.token)).toEqual(["vw"]);
  });
  it("decodes escaped identifiers without moving UTF-16 ranges", () => {
    const css = String.raw`/* 📖 */ p { d\69 splay: gr\69 d; background: url("images/\61 .png"); }`;
    const result = findings(css);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: "value",
      token: String.raw`gr\69 d`,
      params: { property: "display", value: "grid" },
    });
  });
  it("reports syntax once and continues checking a valid neighboring rule", () => {
    const result = findings("p { color: red } q { color: ; display:grid; } r { display:grid;");
    expect(result.filter((x) => x.code === "syntax")).toHaveLength(1);
    expect(result.filter((x) => x.code === "value").map((x) => x.token)).toEqual(["grid", "grid"]);
  });
  it.each(["url(images/a.png)", 'url("images/a.png")', String.raw`url(images/\61 .png)`])(
    "accepts book resources %s",
    (url) => {
      expect(findings(`p { background:${url}; }`)).toEqual([]);
    },
  );
  it.each([
    "https://x/a.png",
    "data:image/png,x",
    "../images/a.png",
    "images/../a.png",
    "/images/a.png",
    "images/%2e%2e/a.png",
  ])("reports external resource %s", (path) => {
    expect(findings(`p { background:url("${path}"); }`)).toMatchObject([
      { code: "externalUrl", token: `"${path}"`, params: { url: path } },
    ]);
  });
  it("handles case, unknown selectors/units/at-rules and CSS variables conservatively", () => {
    expect(findings("p { DISPLAY: BLOCK; }")).toEqual([]);
    expect(findings("@unknown x {p:future {width:1furlong;}}").map((x) => x.code)).toEqual([
      "unknownAtRule",
      "unknownSelector",
      "unknownUnit",
    ]);
    expect(
      findings("p { --Brand: red; color:var(--Brand); }").filter(
        (x) => x.code === "customProperty",
      ),
    ).toHaveLength(2);
  });
  it("keeps the theme and template free of syntax or unsupported warnings", () => {
    for (const css of [themeCss, customCssTemplate])
      expect(
        checkKindleCss(css).filter((x) => x.severity === "warning" || x.code === "syntax"),
      ).toEqual([]);
  });
  it("has no findings for empty CSS", () => expect(checkKindleCss("")).toEqual([]));
});

describe("review regressions", () => {
  it.each([
    "p { color red; display: grid; } q { mystery: x }",
    "p { color:red width:2vw; } q { mystery:x }",
    "p { width:calc(2vw; } q { mystery:x }",
  ])("recovers declaration contexts without invented selectors: %s", (css) => {
    const result = findings(css);
    expect(result.filter((f) => f.code === "syntax")).toHaveLength(1);
    expect(result.some((f) => f.code === "unknownProperty" && f.token === "mystery")).toBe(true);
    expect(result.filter((f) => f.code === "unknownSelector")).toEqual([]);
  });
  it.each([String.raw`2\76 w`, String.raw`2v\77`])(
    "checks the full escaped dimension %s",
    (value) => {
      const result = findings(`p{width:${value}}`);
      expect(result).toMatchObject([{ code: "unit", severity: "warning", params: { unit: "vw" } }]);
      expect(result[0]?.token).toBe(value.slice(1));
    },
  );
  it.each([
    'URL("https://example.com/a")',
    "URL(https://example.com/a)",
    String.raw`u\72 l("https://example.com/a")`,
    String.raw`u\72 l(https://example.com/a)`,
  ])("checks equivalent URL function spellings: %s", (call) => {
    const result = findings(`p{background:${call}}`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: "externalUrl",
      params: { url: "https://example.com/a" },
    });
  });
  it("recognizes legacy pseudo-elements and permits empty custom properties", () => {
    expect(findings('p:before{content:"x"}')).toMatchObject([
      { code: "selector", severity: "warning", token: ":before" },
    ]);
    expect(findings("p{--x:;}")).toMatchObject([{ code: "customProperty", severity: "info" }]);
    expect(findings("p{color:;}").filter((f) => f.code === "syntax")).toHaveLength(1);
  });
});
