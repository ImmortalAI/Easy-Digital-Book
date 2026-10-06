import { describe, expect, it } from "vitest";
import { planRename, renameResources, renameTargets } from "@/services/book/rename-resources";
import type { Book } from "@/types/book";

const res = { mediaType: "image/png" as const, bytes: new Uint8Array([1]) };
function book(
  paths: string[],
  chapters: string[],
  cover: string | null = null,
  css: string | null = null,
): Book {
  return {
    metadata: {
      id: "urn:uuid:x",
      title: "T",
      version: null,
      created: "",
      modified: "",
      language: "en",
      authors: [],
      translators: [],
      series: null,
      description: null,
      cover,
    },
    chapters: chapters.map((source, i) => ({ id: `chapter${i}`, source })),
    resources: new Map(paths.map((p) => [p, res])),
    customCss: css,
    dictionary: [],
  };
}

describe("planRename", () => {
  it("numbers in selection order with zero padding by count", () => {
    const paths = Array.from({ length: 10 }, (_, i) => `images/p${i}.png`);
    const plan = planRename(
      book(paths, []),
      [paths[3]!, ...paths.filter((_, i) => i !== 3)],
      "scene",
    );
    expect("renames" in plan && plan.renames[0]).toEqual({
      from: "images/p3.png",
      to: "images/scene_01.png",
    });
    expect("renames" in plan && plan.renames[9]!.to).toBe("images/scene_10.png");
  });

  it("keeps each file's extension and pads 1–9 to one digit", () => {
    const plan = planRename(
      book(["images/a.jpg", "images/b.png"], []),
      ["images/b.png", "images/a.jpg"],
      "x",
    );
    expect(plan).toEqual({
      renames: [
        { from: "images/b.png", to: "images/x_1.png" },
        { from: "images/a.jpg", to: "images/x_2.jpg" },
      ],
    });
  });

  it("rejects an empty name and a clash with an unselected image", () => {
    expect(planRename(book(["images/a.png"], []), ["images/a.png"], "")).toEqual({
      error: "empty",
    });
    expect(planRename(book(["images/a.png", "images/x.png"], []), ["images/a.png"], "x")).toEqual({
      error: "conflict",
      path: "images/x.png",
    });
  });

  it("names a single image without a number", () => {
    expect(planRename(book(["images/a.jpg"], []), ["images/a.jpg"], "cover")).toEqual({
      renames: [{ from: "images/a.jpg", to: "images/cover.jpg" }],
    });
  });

  it("has nothing to do when a single image keeps its name", () => {
    expect(planRename(book(["images/a.jpg"], []), ["images/a.jpg"], "a")).toEqual({
      renames: [],
    });
  });

  it("numbers only when there are several images", () => {
    expect(renameTargets(["images/a.png", "images/b.jpg"], "x")).toEqual([
      "images/x_1.png",
      "images/x_2.jpg",
    ]);
    expect(renameTargets(["images/a.png"], "x")).toEqual(["images/x.png"]);
  });

  it("allows swapping names inside the selection", () => {
    const plan = planRename(
      book(["images/x_1.png", "images/x_2.png"], []),
      ["images/x_2.png", "images/x_1.png"],
      "x",
    );
    expect("renames" in plan).toBe(true);
  });
});

describe("renameResources", () => {
  it("rewrites chapter references, the cover and css urls, but not look-alike names", () => {
    const source = "![a](images/a.png) ![b](images/aa.png)\n\n![](images/a.png)";
    const result = renameResources(
      book(
        ["images/a.png", "images/aa.png"],
        [source],
        "images/a.png",
        'p { background: url("images/a.png") }',
      ),
      [{ from: "images/a.png", to: "images/z_1.png" }],
    );
    expect(result.mutation.book.chapters[0]!.source).toBe(
      "![a](images/z_1.png) ![b](images/aa.png)\n\n![](images/z_1.png)",
    );
    expect(result.mutation.book.metadata.cover).toBe("images/z_1.png");
    expect(result.mutation.book.customCss).toBe('p { background: url("images/z_1.png") }');
    expect([...result.mutation.book.resources.keys()].sort()).toEqual([
      "images/aa.png",
      "images/z_1.png",
    ]);
    expect(result.mutation.removedResources).toEqual(new Set(["images/a.png"]));
    expect(result.mutation.changedResources).toEqual(new Set(["images/z_1.png"]));
    expect(result.chapterEdits.get("chapter0")).toEqual([
      { from: 5, to: 17, insert: "images/z_1.png" },
      { from: 44, to: 56, insert: "images/z_1.png" },
    ]);
  });

  it("swaps two names in one step", () => {
    const result = renameResources(
      book(["images/a.png", "images/b.png"], ["![](images/a.png)![](images/b.png)"]),
      [
        { from: "images/a.png", to: "images/b.png" },
        { from: "images/b.png", to: "images/a.png" },
      ],
    );
    expect(result.mutation.book.chapters[0]!.source).toBe("![](images/b.png)![](images/a.png)");
    expect(result.mutation.book.resources.size).toBe(2);
  });

  it("refuses a rename that would merge two images", () => {
    expect(() =>
      renameResources(book(["images/a.png", "images/b.png"], []), [
        { from: "images/a.png", to: "images/b.png" },
      ]),
    ).toThrow(/share a path/);
  });
});
