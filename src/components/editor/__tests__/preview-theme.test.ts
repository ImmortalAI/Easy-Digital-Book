import { describe, expect, it } from "vitest";
import { themeCss } from "@/assets/epub/theme.css";
import { paperBackground, previewLookCss, readAppTokens } from "@/components/editor/preview-theme";

const tokens = {
  background: "oklch(0.1 0 0)",
  foreground: "oklch(0.9 0 0)",
  mutedForeground: "oklch(0.7 0 0)",
  border: "oklch(1 0 0 / 10%)",
  ring: "oklch(0.5 0 0)",
};

describe("preview look", () => {
  it("is empty when the paper style is off", () => {
    expect(previewLookCss(null)).toBe("");
  });

  it("derives the paper colours from the app tokens", () => {
    const css = previewLookCss({ dimImages: false, tokens });
    expect(css).toContain(`--paper-bg: ${paperBackground(tokens)}`);
    expect(paperBackground(tokens)).toContain("oklch(0.1 0 0)");
    expect(css).toContain("--paper-muted: oklch(0.7 0 0)");
    expect(css).toContain("color-scheme: dark");
    expect(css).not.toContain("filter:");
  });

  it("dims images only when asked", () => {
    expect(previewLookCss({ dimImages: true, tokens })).toContain("img { filter:");
  });

  it("falls back to the dark palette when the tokens can't be read", () => {
    expect(readAppTokens(document.createElement("div")).background).toMatch(/^oklch\(/);
  });

  it("never leaks into the EPUB theme", () => {
    expect(themeCss).not.toContain("--paper");
    expect(themeCss).not.toContain("filter");
  });
});
