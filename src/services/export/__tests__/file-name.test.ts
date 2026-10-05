import { describe, expect, it } from "vitest";
import { makeExportFileName } from "@/services/export/file-name";

describe("makeExportFileName", () => {
  it("preserves Unicode while sanitizing forbidden characters and reserved names", () => {
    expect(makeExportFileName({ title: "雪📚: CON", version: "v/1" }, true, "azw3")).toBe(
      "雪📚_ CON (v_1).azw3",
    );
  });

  it("uses a safe fallback for an empty sanitized title", () => {
    expect(makeExportFileName({ title: "", version: null }, false, "azw3")).toBe("book.azw3");
  });

  it("uses the selected format extension", () => {
    expect(makeExportFileName({ title: "Novel", version: null }, false, "epub")).toBe("Novel.epub");
  });
});
