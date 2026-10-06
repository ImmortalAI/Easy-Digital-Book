import { describe, expect, it } from "vitest";
import { readEdb } from "@/services/edb/read";
import { writeEdb } from "@/services/edb/write";
import { archive, manifest } from "./fixtures";

const deps = { now: () => new Date("2026-02-01T00:00:00.000Z") };

describe("readEdb", () => {
  it("rejects non-zips, missing manifests, bad JSON, foreign and future formats", async () => {
    await expect(readEdb(new Uint8Array([1, 2]), deps)).rejects.toMatchObject({
      code: "edb.notZip",
    });
    await expect(readEdb(await archive({}), deps)).rejects.toMatchObject({
      code: "edb.noManifest",
    });
    await expect(readEdb(await archive({ "manifest.json": "{" }), deps)).rejects.toMatchObject({
      code: "edb.badJson",
    });
    await expect(
      readEdb(await archive({ "manifest.json": manifest({ format: "other" }) }), deps),
    ).rejects.toMatchObject({ code: "edb.foreignFormat" });
    await expect(
      readEdb(await archive({ "manifest.json": manifest({ formatVersion: 3 }) }), deps),
    ).rejects.toMatchObject({ code: "edb.tooNew" });
  });

  it("rejects malformed JSON envelopes as bad manifests while preserving foreign detection", async () => {
    for (const value of [{}, [], { format: 42 }, { format: null }]) {
      await expect(
        readEdb(await archive({ "manifest.json": JSON.stringify(value) }), deps),
      ).rejects.toMatchObject({ code: "edb.badManifest" });
    }
    await expect(
      readEdb(await archive({ "manifest.json": manifest({ format: "other" }) }), deps),
    ).rejects.toMatchObject({ code: "edb.foreignFormat" });
  });

  it("rejects invalid and unsupported format versions with AppError", async () => {
    for (const version of [-1, 1.5, -0.5]) {
      const error = await readEdb(
        await archive({ "manifest.json": manifest({ formatVersion: version }) }),
        deps,
      ).catch((value) => value);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: "edb.badManifest" });
    }
    const error = await readEdb(
      await archive({ "manifest.json": manifest({ formatVersion: -2 }) }),
      deps,
    ).catch((value) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "edb.badManifest" });
  });

  it("rejects chapter IDs that could escape the chapter directory", async () => {
    await expect(
      readEdb(
        await archive({ "manifest.json": manifest({ chapters: [{ id: "../evil" }] }) }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "edb.badManifest" });
  });

  it("rejects duplicate valid chapter IDs before constructing a book", async () => {
    await expect(
      readEdb(
        await archive({
          "manifest.json": manifest({ chapters: [{ id: "chapter1" }, { id: "chapter1" }] }),
          "chapters/chapter1.nov": "# One",
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "edb.badManifest", message: /duplicate chapter id/i });
  });

  it("skips invalid orphan chapter filenames and recovers valid orphans", async () => {
    const result = await readEdb(
      await archive({
        "manifest.json": manifest({ chapters: [] }),
        "chapters/orphan01.nov": "# Valid",
        "chapters/invalid!.nov": "# Unsafe",
      }),
      deps,
    );
    expect(result.book.chapters).toEqual([{ id: "orphan01", source: "# Valid" }]);
    expect(result.warnings.map((warning) => warning.code)).toContain("edb.invalidChapterFile");
  });

  it("recovers missing and orphan chapters, normalizes CRLF, and missing cover", async () => {
    const result = await readEdb(
      await archive({
        "manifest.json": manifest({
          book: { ...JSON.parse(manifest()).book, cover: "images/no.png" },
          chapters: [{ id: "missing1" }],
        }),
        "chapters/orphan01.nov": "# Orphan\r\ntext\r\n",
      }),
      deps,
    );
    expect(result.book.chapters).toEqual([
      { id: "missing1", source: "" },
      { id: "orphan01", source: "# Orphan\ntext\n" },
    ]);
    expect(result.book.metadata.cover).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["edb.missingChapter", "edb.orphanChapter", "edb.missingCover"]),
    );
  });

  it("defaults invalid metadata fields and reports warnings", async () => {
    const badBook = { ...JSON.parse(manifest()).book, title: 42, authors: "bad", language: 3 };
    const result = await readEdb(
      await archive({ "manifest.json": manifest({ book: badBook }) }),
      deps,
    );
    expect(result.book.metadata.title).toBe("Untitled");
    expect(result.book.metadata.authors).toEqual([]);
    expect(result.book.metadata.language).toBe("en");
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["edb.invalidMetadata"]),
    );
  });

  it("migrates an older manifest in memory", async () => {
    const old = { ...JSON.parse(manifest()), formatVersion: 0 };
    const result = await readEdb(await archive({ "manifest.json": JSON.stringify(old) }), deps);
    expect(result.migrated).toBe(true);
    expect(result.book.metadata.version).toBeNull();
  });

  it("reads and normalizes dictionary.txt", async () => {
    const result = await readEdb(
      await archive({
        "manifest.json": manifest({ formatVersion: 2 }),
        "dictionary.txt": "дао\r\n\r\nМинжуй\nдао",
      }),
      deps,
    );
    expect(result.book.dictionary).toEqual(["Минжуй", "дао"]);
  });

  it("migrates a version 1 file to an empty dictionary", async () => {
    const result = await readEdb(
      await archive({ "manifest.json": manifest({ formatVersion: 1 }) }),
      deps,
    );
    expect(result.migrated).toBe(false);
    expect(result.book.dictionary).toEqual([]);
  });

  it("roundtrips the dictionary", async () => {
    const written = await writeEdb(
      {
        ...(await readEdb(await archive({ "manifest.json": manifest() }), deps)).book,
        dictionary: ["Минжуй"],
      },
      new Date(),
    );
    expect((await readEdb(written, deps)).book.dictionary).toEqual(["Минжуй"]);
  });
});
