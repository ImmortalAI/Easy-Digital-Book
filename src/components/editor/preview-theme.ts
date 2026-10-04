import { previewDimImagesCss, previewPaperCss } from "@/assets/epub/preview-paper.css";

/** The app theme colours the preview borrows; the iframe can't see the parent's variables. */
export interface AppTokens {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  ring: string;
}

// The `.dark` values from src/assets/style.css, for when they can't be read.
const fallbackDark: AppTokens = {
  background: "oklch(0.148 0.004 228.8)",
  foreground: "oklch(0.987 0.002 197.1)",
  mutedForeground: "oklch(0.723 0.014 214.4)",
  border: "oklch(1 0 0 / 10%)",
  ring: "oklch(0.56 0.021 213.5)",
};

/** A faint warm tint that turns the app background into "old paper". */
const PAPER_TINT = "#8a6a3a";
const INK_TINT = "#e8d9b5";

export function readAppTokens(root: Element = document.documentElement): AppTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--background", fallbackDark.background),
    foreground: read("--foreground", fallbackDark.foreground),
    mutedForeground: read("--muted-foreground", fallbackDark.mutedForeground),
    border: read("--border", fallbackDark.border),
    ring: read("--ring", fallbackDark.ring),
  };
}

export function paperBackground(tokens: AppTokens): string {
  return `color-mix(in oklch, ${tokens.background} 90%, ${PAPER_TINT})`;
}

function paperVariables(tokens: AppTokens): string {
  return `:root { --paper-bg: ${paperBackground(tokens)}; --paper-fg: color-mix(in oklch, ${tokens.foreground} 88%, ${INK_TINT}); --paper-accent: oklch(0.8 0.06 80); --paper-link: oklch(0.72 0.08 70); --paper-muted: ${tokens.mutedForeground}; --paper-border: ${tokens.border}; --paper-selection: color-mix(in oklch, ${tokens.ring} 45%, transparent); }`;
}

/** The preview-only look layer; empty when the paper style is off. */
export function previewLookCss(look: { dimImages: boolean; tokens: AppTokens } | null): string {
  if (!look) return "";
  return [paperVariables(look.tokens), previewPaperCss, look.dimImages ? previewDimImagesCss : ""]
    .filter(Boolean)
    .join("\n");
}
