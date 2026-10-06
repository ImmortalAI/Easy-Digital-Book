import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { writeEdb } from "@/services/edb/write";
import { createBook } from "@/services/book/create";

function book() {
  const value = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  return {
    ...value,
    chapters: [
      { id: "chapter1", source: "# One\r\ntext" },
      { id: "chapter2", source: "# Two" },
    ],
    resources: new Map([
      [
        "images/z.png",
        { bytes: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png" as const },
      ],
      ["images/a.txt", { bytes: new Uint8Array([1, 2]), mediaType: "image/gif" as const }],
    ]),
    customCss: "body {}",
  };
}

describe("writeEdb", () => {
  it("is deterministic, orders entries, normalizes text, and updates modified explicitly", async () => {
    const now = new Date("2026-03-04T05:06:07.000Z");
    const first = await writeEdb(book(), now);
    const second = await writeEdb(book(), now);
    expect([...first]).toEqual([...second]);
    const zip = await JSZip.loadAsync(first);
    expect(Object.keys(zip.files)).toEqual([
      "manifest.json",
      "chapters/chapter1.nov",
      "chapters/chapter2.nov",
      "images/a.txt",
      "images/z.png",
      "styles/custom.css",
    ]);
    expect(await zip.file("chapters/chapter1.nov")!.async("string")).toBe("# One\ntext");
    expect(JSON.parse(await zip.file("manifest.json")!.async("string")).book.modified).toBe(
      now.toISOString(),
    );
  });

  it("writes dictionary.txt after custom.css and format version 2", async () => {
    const bytes = await writeEdb(
      { ...book(), customCss: "p{}", dictionary: ["Минжуй", "дао"] },
      new Date("2026-03-04T05:06:07.000Z"),
    );
    const zip = await JSZip.loadAsync(bytes);
    const paths = Object.keys(zip.files);
    expect(paths.at(-1)).toBe("dictionary.txt");
    expect(paths.at(-2)).toBe("styles/custom.css");
    expect(await zip.file("dictionary.txt")!.async("string")).toBe("Минжуй\nдао\n");
    expect(JSON.parse(await zip.file("manifest.json")!.async("string")).formatVersion).toBe(2);
  });

  it("omits dictionary.txt for an empty dictionary", async () => {
    const zip = await JSZip.loadAsync(
      await writeEdb({ ...book(), dictionary: [] }, new Date("2026-03-04T05:06:07.000Z")),
    );
    expect(zip.file("dictionary.txt")).toBeNull();
  });
});
