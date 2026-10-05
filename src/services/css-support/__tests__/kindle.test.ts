import { describe, expect, it } from "vitest";
import { kindleSupport } from "../kindle";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import zh from "@/locales/zh-CN.json";

describe("Kindle support table", () => {
  it("names sources and locale keys for every row", () => {
    for (const rows of Object.values(kindleSupport))
      for (const row of rows) {
        expect(row.source.trim()).not.toBe("");
        expect(row.note).toMatch(/^cssSupport\./);
        const code = row.note.slice("cssSupport.".length);
        for (const locale of [en, ru, zh]) {
          expect(
            (locale as unknown as { cssSupport: Record<string, string> }).cssSupport[code],
          ).toBeTruthy();
        }
      }
  });
  it("keeps all unverified rows and value overrides partial", () => {
    for (const rows of Object.values(kindleSupport))
      for (const row of rows) {
        expect(row.support).toBe("partial");
        if ("values" in row)
          expect(Object.values(row.values ?? {})).toEqual(expect.arrayContaining(["partial"]));
      }
  });
  it("has unique rule identities and covers the four selector patterns", () => {
    for (const rows of Object.values(kindleSupport)) {
      const keys = rows.map((row) =>
        "property" in row ? row.property : `${"pattern" in row ? row.pattern : ""}:${row.name}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(new Set(kindleSupport.selectors.map((row) => row.pattern)).size).toBe(4);
  });
});
