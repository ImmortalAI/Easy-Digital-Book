import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cssSupportSamples } from "./css-support-fixtures";
import { writeEdb } from "../src/services/edb/write";
import { buildAzw3 } from "../src/services/azw3/build";
import {
  exportOptions,
  fixtureBook,
  fixtureProcessor,
  jpeg,
  png,
} from "../src/services/azw3/__tests__/fixtures";

const configuredOutputDir = process.env.EDB_AZW3_FIXTURE_DIR;
const outputDir = configuredOutputDir
  ? resolve(configuredOutputDir)
  : await mkdtemp(join(tmpdir(), "edb-azw3-fixtures-"));
if (configuredOutputDir) await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const now = () => new Date("2026-01-02T03:04:05.000Z");
const writeBook = async (name: string, book: ReturnType<typeof fixtureBook>) => {
  const started = performance.now();
  const bytes = await buildAzw3(book, exportOptions(), {
    imageProcessor: fixtureProcessor(),
    now,
  });
  const path = join(outputDir, `${name}.azw3`);
  await writeFile(path, bytes);
  console.log(`${name}: ${bytes.length} bytes, ${Math.round(performance.now() - started)} ms`);
  return path;
};

const minimal = fixtureBook();
minimal.metadata.title = "AZW3 Minimal";
minimal.metadata.cover = null;
minimal.chapters = [{ id: "minimal", source: "# Minimal\n\nNo notes, cover, or custom CSS." }];
minimal.customCss = null;

const multilingualNotes = fixtureBook();
multilingualNotes.metadata.title = "AZW3 Multilingual Notes";
multilingualNotes.metadata.language = "zh-Hans-CN";
multilingualNotes.chapters = [
  {
    id: "one",
    source: "# 第一章\n\nРусский текст[^same], 再次 [^same].\n\n[^same]: 注释 中文 😀",
  },
  {
    id: "two",
    source: "# Chapter Two\n\nRepeated IDs stay chapter local: [^same].\n\n[^same]: Second note",
  },
];

const imagesCss = fixtureBook();
imagesCss.metadata.title = "AZW3 Images and CSS";
imagesCss.metadata.cover = "images/cover.png";
imagesCss.chapters = [
  {
    id: "images",
    source:
      "# Images\n\n![cover](images/cover.png)\n\n![art](images/art/cover.png)\n\n![photo](images/photo.jpg)",
  },
];
imagesCss.resources = new Map([
  ["images/cover.png", { mediaType: "image/png", bytes: png }],
  ["images/art/cover.png", { mediaType: "image/png", bytes: png }],
  ["images/css-only.png", { mediaType: "image/png", bytes: png }],
  ["images/photo.jpg", { mediaType: "image/jpeg", bytes: jpeg }],
]);
imagesCss.customCss = 'body { background-image: url("images/css-only.png"); }';

// The AZW3 retains a readable catalog. Isolated editable samples avoid one
// property's layout effects masking another; export each from the packaged app.
imagesCss.chapters.push({
  id: "csscheck",
  source:
    "# CSS Support Samples\n\n" +
    cssSupportSamples
      .map((sample) => `${sample.id}\n\n${sample.css}\n\n${sample.description}`)
      .join("\n\n"),
});
const sampleDir = join(outputDir, "css-support-samples");
await mkdir(sampleDir, { recursive: true });
for (const [index, sample] of cssSupportSamples.entries()) {
  const book = fixtureBook();
  book.metadata.title = `CSS ${sample.id}`;
  book.metadata.id = `urn:uuid:550e8400-e29b-41d4-a716-${String(index + 1).padStart(12, "0")}`;
  book.chapters = [{ id: "csscheck", source: sample.source }];
  book.resources = new Map([["images/css-only.png", { mediaType: "image/png", bytes: png }]]);
  book.customCss = sample.css;
  await writeFile(join(sampleDir, `${sample.id}.edb`), await writeEdb(book, now()));
}
await writeFile(
  join(sampleDir, "manifest.json"),
  JSON.stringify(
    cssSupportSamples.map(({ id, css, description }) => ({ id, css, description })),
    null,
    2,
  ),
);

const longBook = fixtureBook();
longBook.metadata.title = "AZW3 Synthetic 300 Chapter Book";
longBook.metadata.cover = null;
longBook.resources.clear();
longBook.customCss = null;
longBook.chapters = Array.from({ length: 300 }, (_, index) => ({
  id: `chapter-${String(index + 1).padStart(3, "0")}`,
  source:
    index === 0
      ? `# Chapter 1\n\n${Array.from({ length: 9000 }, (_paragraph, p) => `Paragraph ${p + 1}: a repeated synthetic passage for layout and memory measurement.`).join("\n\n")}`
      : `# Chapter ${index + 1}\n\nA short synthetic chapter used to measure book assembly.`,
}));

const paths = [
  await writeBook("minimal", minimal),
  await writeBook("multilingual-notes", multilingualNotes),
  await writeBook("images-css", imagesCss),
  await writeBook("300-chapter-long", longBook),
];
console.log(`Process peak RSS: ${process.resourceUsage().maxRSS} KiB`);
console.log(`Generated ${paths.length} deterministic AZW3 fixtures in ${resolve(outputDir)}`);
for (const path of paths) console.log(path);
