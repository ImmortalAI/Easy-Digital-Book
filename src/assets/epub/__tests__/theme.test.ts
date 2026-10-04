import { describe, expect, it } from "vitest";
import { themeCss } from "@/assets/epub/theme.css";

describe("book theme", () => {
  it("marks block quotes with a left rule in the text colour", () => {
    expect(themeCss).toContain(
      "blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 0.2em solid; }",
    );
  });

  it("sets no colours, so readers' night modes keep working", () => {
    expect(themeCss).not.toMatch(/(^|[\s;{])(color|background(-color)?)\s*:/);
    expect(themeCss).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
