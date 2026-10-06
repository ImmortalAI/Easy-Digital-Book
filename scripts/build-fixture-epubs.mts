import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { buildEpub } from "../src/services/epub/build";
import type { Book } from "../src/types/book";
import type { ImageProcessor } from "../src/types/platform";
import { canonicalUuid } from "../src/utils/uuid";

const execFileAsync = promisify(execFile);
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
const processor: ImageProcessor = {
  process: async ({ bytes, plan }) => ({
    bytes,
    mediaType: plan.format === "png" ? "image/png" : "image/jpeg",
    width: plan.width,
    height: plan.height,
  }),
  dispose: () => {},
};
const book: Book = {
  metadata: {
    // The fixture is hand-built rather than produced by createBook, so it has
    // to apply the same identifier rule itself: epubcheck rejects a value
    // marked urn:uuid that is not a real UUID (OPF-085). Fixed, so the built
    // EPUB stays byte-for-byte reproducible.
    id: canonicalUuid("f1c7d8e2-3b4a-4c5d-9e6f-0a1b2c3d4e5f"),
    title: "Task 18 Fixture",
    version: "v1",
    created: "2026-01-02T03:04:05.000Z",
    modified: "2026-01-02T03:04:05.000Z",
    language: "en",
    authors: ["Author"],
    translators: ["Translator One", "Translator Two"],
    series: { name: "Fixture Series", index: 1.5 },
    description: "Series, translators, footnotes, images, cover, and an untitled chapter.",
    cover: "images/cover.png",
  },
  chapters: [
    {
      id: "chapter1",
      source:
        "# Fixture Chapter\n\nText with a footnote[^1] and an image:\n\n![Scene](images/scene.png)\n\n[^1]: Fixture note",
    },
    { id: "chapter2", source: "This chapter intentionally has no heading." },
  ],
  resources: new Map([
    ["images/cover.png", { bytes: png, mediaType: "image/png" }],
    ["images/scene.png", { bytes: png, mediaType: "image/png" }],
  ]),
  customCss: 'body { background-image: url("images/scene.png"); }',
  dictionary: [],
};

const output = resolve("fixtures/task-18-fixture.epub");
await mkdir(resolve("fixtures"), { recursive: true });
await writeFile(
  output,
  await buildEpub(
    book,
    { imagePreset: "kindle-paperwhite", grayscale: false, titlePage: true, versionInTitle: true },
    { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") },
  ),
);

await execFileAsync(resolve("scripts/epubcheck.sh"), [output], { stdio: "inherit" });
