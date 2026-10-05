import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildAzw3 } from "../src/services/azw3/build";
import {
  exportOptions,
  fixtureBook,
  fixtureProcessor,
  jpeg,
  png,
} from "../src/services/azw3/__tests__/fixtures";

const outputDir = await mkdtemp(join(tmpdir(), "edb-azw3-fixtures-"));
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
