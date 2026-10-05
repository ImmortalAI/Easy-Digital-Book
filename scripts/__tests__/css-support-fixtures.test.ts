import { describe, expect, it } from "vitest";
import { cssSupportSamples } from "../css-support-fixtures";
import { kindleSupport } from "../../src/services/css-support/kindle";
import { checkKindleCss } from "../../src/services/css-support/check";
describe("CSS device samples", () => {
  it("provides identifiable samples and instructions for every table row and override", () => {
    const expectedCount =
      Object.values(kindleSupport).reduce((sum, rows) => sum + rows.length, 0) +
      kindleSupport.properties.reduce((sum, row) => sum + Object.keys(row.values ?? {}).length, 0);
    expect(cssSupportSamples).toHaveLength(expectedCount);
    expect(new Set(cssSupportSamples.map((sample) => sample.id)).size).toBe(expectedCount);
    for (const sample of cssSupportSamples) {
      expect(sample.source).toContain(sample.id);
      expect(sample.source).toContain("REFERENCE");
      expect(sample.description.length).toBeGreaterThan(10);
      expect(checkKindleCss(sample.css).filter((f) => f.code === "syntax")).toEqual([]);
    }
  });
});
