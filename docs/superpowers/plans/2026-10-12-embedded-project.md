# Project File Embedded in Exported Books Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One exported `.epub` / `.azw3` can carry the book's `.edb` project, and "Open" turns such a book back into an editable, unsaved project.

**Architecture:** The payload is exactly the bytes of `writeEdb`. `buildEpub` appends it as the last, stored zip entry `project.edb` in the container root (not in the OPF). `buildAzw3` wraps it in one `SRCS` record between FCIS and the end-of-file record and points record 0 at it. A pure module `services/export/embedded-project.ts` recognises the container by its bytes and returns the payload; `openPathAfterGuard` feeds it to the normal `readEdb` and opens the result without a path.

**Tech Stack:** TypeScript, Vue 3, Pinia, JSZip, Vitest (+ `fake-indexeddb`, happy-dom, Testing Library), tsx fixture scripts, epubcheck 5.2.1, Calibre 9.15.0.

**Spec:** `docs/superpowers/specs/2026-10-11-embedded-project-design.md` (base: `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md` sections 2, 3, 5 and `docs/superpowers/specs/2026-10-03-azw3-export-design.md`).

## Global Constraints

- The embedded payload is **exactly the bytes `writeEdb` produces**; `formatVersion` stays 2. No new container format, no `.edb` migration.
- EPUB: zip entry **`project.edb` in the container root**, written **last**, `STORE` compression, **not** listed in the OPF manifest, nothing references it. `META-INF/` is not used.
- AZW3: one **`SRCS` record between FCIS and the end-of-file record**. Record layout: bytes 0–3 `SRCS`, 4–7 `0x00000010`, 8–11 `0x0000002f`, 12–15 `0x00000001`, payload from byte 16 to the end of the record. Record 0: SRCS record index at offset 224, SRCS record count (1) at offset 228.
- `ExportOptions.embedProject?: boolean`; **absent means `false`**. With the option off, output is **byte-identical** to today's.
- The option is dialog state only: **off every time the export dialog opens**, never written to app settings or to the `.edb`.
- The payload is built from the same `Book` snapshot the export uses. `dirty`, `revision` and `metadata.modified` are not touched. The export file name does not change.
- `extractEmbeddedProject(bytes: Uint8Array): Promise<Uint8Array | null>` detects the container **by signature, not by file extension**, and **never throws**.
- A project opened from a book is an **unsaved book**: `filePath = null`, `dirty = true`, no `fileMtime`, **not added to Recent files**. Any recovery session with the same UUID is **removed before `setBook`**.
- Opening from the OS is unchanged: `src-tauri/src/lib.rs` and `drainOpenPaths` keep accepting only `.edb`. No file association for `.epub` / `.azw3`.
- Out of scope: importing books without an embedded project, encryption, remembering the option, any warning on later export without the option.
- UI copy (English): checkbox "Embed project file"; hint "For editing. Do not publish this file: it contains the book's sources."; success "EPUB saved · with project file"; error "This book does not contain a project file". Every new key exists in `ru`, `en` and `zh-CN`.
- `services/{export,epub,azw3,edb}` stay pure: no `vue`, `pinia`, `@tauri-apps/*`, no browser globals (Oxlint enforces this).
- Commits use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. GitHub text is English.

## Review Focus

1. **The author opens their own exported book while the original `.edb` is open (same UUID), clean or dirty.** Expected: the result has no path, Mod+S asks for a new file, and no recovery session still points at the original file. (Task 4)
2. **The recovery session cannot be removed (IndexedDB error).** Expected: the book is not opened and the current project stays, because opening anyway could later overwrite the original project. (Task 4)
3. **The extension lies:** an exported book renamed to `.edb`, or an `.edb` picked through the new `epub` filter. Expected: the bytes decide. The book opens as an unsaved project; the `.edb` opens as an ordinary project. (Task 4)
4. **An ordinary third-party EPUB, including one whose `mimetype` entry ends with a newline.** Expected: "This book does not contain a project file", not the generic "Could not open project". (Tasks 3, 4)
5. **Export with embedding from a dirty, never-saved book, then export again.** Expected: the project still embeds the unsaved text, `dirty` / `revision` / `modified` are unchanged, and `embedProject` never reaches stored settings. (Task 5)

## Decisions made in this plan

These go beyond the spec or correct it. Each is small; none changes the approved design.

- **`findEmbeddedProject` next to `extractEmbeddedProject`.** The open flow must tell "not a book" (read as `.edb`) from "a book without a project" (error dialog). The spec's function returns `null` for both, so the module also exports `findEmbeddedProject(bytes): Promise<{ container: "epub" | "azw3" | null; project: Uint8Array | null }>`. `extractEmbeddedProject` stays, as a wrapper.
- **The spec's note that the option "does not leak" is only half true.** `use-export.ts` copies settings _into_ the options by name, but after a successful export it spreads the options _back_ into settings (`...selectedOptions`). Task 5 changes that spread to named fields, and a test pins it.
- **Fail closed on recovery removal.** If removing the same-UUID recovery session throws, the open is aborted with the existing "Could not open project" dialog.
- **`mimetype` is compared after `trim()`**, so EPUBs from tools that add a trailing newline are still recognised as books.
- **`writeEdb(book, exportedAt, { updateModified: false })`** builds the payload, which keeps `metadata.modified` untouched and the payload deterministic.
- **Byte-identity is tested without stored reference values.** Each test builds the book twice in one run, with and without the option, and requires that the option only adds: for EPUB every byte before the central directory is identical and the only new entry is `project.edb`; for AZW3 all records except SRCS are identical and record 0 differs only at offsets 224–231. An absent option and `embedProject: false` must give equal bytes. Pinned hashes were rejected: they would break on any dependency update that changes deflate output.
- **No Java on the development machine** (checked 2026-10-12), so the epubcheck gate of Task 1 runs in the `ci` GitHub Actions job unless Java is installed locally.
- Not in this plan: e2e tests (the spec lists none) and `CHANGELOG.md` (written by the `chore(release)` commit).

## File map

| File                                                                                                                     | Change                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/services/export/types.ts`                                                                                           | `ExportOptions.embedProject?`                                                 |
| `src/services/export/embedded-project.ts`                                                                                | **new**: entry name constant, `findEmbeddedProject`, `extractEmbeddedProject` |
| `src/services/export/__tests__/embedded-project.test.ts`                                                                 | **new**                                                                       |
| `src/services/epub/zip.ts`, `build.ts`                                                                                   | stored `project.edb` entry                                                    |
| `src/services/azw3/records.ts`, `headers.ts`, `build.ts`                                                                 | `buildSrcsRecord`, SRCS fields in record 0, captured record indices           |
| `src/composables/use-project-files.ts`                                                                                   | open filter, embedded open path                                               |
| `src/composables/use-export.ts`                                                                                          | persist settings by name                                                      |
| `src/components/export/ExportDialog.vue`                                                                                 | checkbox, hint, success line                                                  |
| `src/locales/{en,ru,zh-CN}.json`                                                                                         | four new keys                                                                 |
| `scripts/build-fixture-epubs.mts`, `scripts/build-fixture-azw3.mts`, `src/services/azw3/__tests__/fixture-manifest.json` | CI fixtures with an embedded project                                          |
| `docs/release-checklist.md`, `README.md`, `AGENTS.md`, the spec                                                          | documentation                                                                 |

---

### Task 1: EPUB embedding and the epubcheck gate

This task resolves spec risk 1 first. **If epubcheck 5.2.1 reports a warning for the unmanifested `project.edb`, stop after Step 6 and report to the user.** The spec then has to switch EPUB to the manifest variant (§3.1) before any further work.

**Files:**

- Modify: `src/services/export/types.ts`
- Create: `src/services/export/embedded-project.ts`
- Modify: `src/services/epub/zip.ts`, `src/services/epub/build.ts`
- Modify: `scripts/build-fixture-epubs.mts`
- Test: `src/services/epub/__tests__/build.test.ts`

**Interfaces:**

- Consumes: `writeEdb(book: Book, now: Date, options?: { updateModified?: boolean }): Promise<Uint8Array>` from `@/services/edb/write`.
- Produces: `ExportOptions.embedProject?: boolean`; `EMBEDDED_PROJECT_ENTRY = "project.edb"` exported from `@/services/export/embedded-project`.

- [ ] **Step 1: Write the failing tests**

Append to `src/services/epub/__tests__/build.test.ts`. `JSZip`, `buildEpub`, `book` and `processor` are already defined at the top of that file; add the two imports.

```ts
import { readEdb } from "@/services/edb/read";
import { writeEdb } from "@/services/edb/write";

const embedOptions = {
  imagePreset: "original",
  grayscale: false,
  titlePage: true,
  versionInTitle: true,
} as const;
const embedDeps = () => ({
  imageProcessor: processor,
  now: () => new Date("2026-01-02T03:04:05Z"),
});

describe("buildEpub with an embedded project", () => {
  it("only appends the project entry: everything before it is byte-identical", async () => {
    const plain = await buildEpub(book, embedOptions, embedDeps());
    const embedded = await buildEpub(book, { ...embedOptions, embedProject: true }, embedDeps());
    // The zip without a comment ends with a 22-byte end record; bytes 16..19 of
    // it hold the offset of the central directory, where the entry data ends.
    const entriesEnd = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(
      plain.length - 6,
      true,
    );
    expect(entriesEnd).toBeGreaterThan(0);
    expect([...embedded.subarray(0, entriesEnd)]).toEqual([...plain.subarray(0, entriesEnd)]);

    const plainNames = Object.keys((await JSZip.loadAsync(plain)).files);
    const embeddedNames = Object.keys((await JSZip.loadAsync(embedded)).files);
    expect(embeddedNames).toEqual([...plainNames, "project.edb"]);
  });
});
```

This comparison is made between two builds of the same run, so it does not depend on the JSZip version or on any stored reference value.

Add inside the same `describe`:

```ts
it("treats an explicit false like an absent option", async () => {
  const plain = await buildEpub(book, embedOptions, embedDeps());
  const off = await buildEpub(book, { ...embedOptions, embedProject: false }, embedDeps());
  expect([...off]).toEqual([...plain]);
  expect(Object.keys((await JSZip.loadAsync(off)).files)).not.toContain("project.edb");
});

it("stores the project last, uncompressed and outside the OPF manifest", async () => {
  const before = structuredClone(book);
  const bytes = await buildEpub(book, { ...embedOptions, embedProject: true }, embedDeps());
  const zip = await JSZip.loadAsync(bytes);

  expect(Object.keys(zip.files).at(-1)).toBe("project.edb");
  expect(Object.keys(zip.files).slice(0, 2)).toEqual(["mimetype", "META-INF/container.xml"]);
  const payload = await zip.file("project.edb")!.async("uint8array");
  // writeEdb is deterministic when it does not stamp `modified`.
  expect([...payload]).toEqual([...(await writeEdb(book, new Date(0), { updateModified: false }))]);
  // STORE: the payload appears verbatim in the archive.
  expect(Buffer.from(bytes).includes(Buffer.from(payload))).toBe(true);
  expect(await zip.file("OEBPS/content.opf")!.async("string")).not.toContain("project.edb");
  expect(book).toEqual(before);
});

it("embeds a project that reads back with the same chapters and untouched modified date", async () => {
  const bytes = await buildEpub(book, { ...embedOptions, embedProject: true }, embedDeps());
  const payload = await (await JSZip.loadAsync(bytes)).file("project.edb")!.async("uint8array");
  const manifest = JSON.parse(
    await (await JSZip.loadAsync(payload)).file("manifest.json")!.async("string"),
  );
  expect(manifest.book.modified).toBe(book.metadata.modified);
  const opened = await readEdb(payload, { now: () => new Date("2030-01-01T00:00:00Z") });
  expect(opened.book.chapters).toEqual(book.chapters);
  expect([...opened.book.resources.keys()]).toEqual(["images/cover.png"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/services/epub/__tests__/build.test.ts`
Expected: the three tests that pass `embedProject: true` FAIL (`project.edb` is missing); vue-tsc would also reject `embedProject`. The other tests pass.

- [ ] **Step 3: Implement**

`src/services/export/types.ts` — add the field to `ExportOptions`:

```ts
export interface ExportOptions {
  imagePreset: "kindle-paperwhite" | "original";
  grayscale: boolean;
  titlePage: boolean;
  versionInTitle: boolean;
  /** Embed the `.edb` project into the exported book. Export dialog state only, never persisted. */
  embedProject?: boolean;
}
```

Create `src/services/export/embedded-project.ts`:

```ts
/** Zip entry that carries the project inside an exported EPUB: container root, not in the OPF. */
export const EMBEDDED_PROJECT_ENTRY = "project.edb";
```

`src/services/epub/zip.ts` — store the project entry as well:

```ts
import JSZip from "jszip";
import { EMBEDDED_PROJECT_ENTRY } from "@/services/export/embedded-project";

// OCF requires a stored `mimetype`; the project file is already a compressed zip.
const stored = new Set(["mimetype", EMBEDDED_PROJECT_ENTRY]);

export async function makeZip(entries: Array<[string, string | Uint8Array]>): Promise<Uint8Array> {
  const zip = new JSZip();
  const date = new Date("2000-01-01T00:00:00Z");
  for (const [name, data] of entries)
    zip.file(
      name,
      data,
      stored.has(name)
        ? { compression: "STORE", createFolders: false, date }
        : { compression: "DEFLATE", compressionOptions: { level: 9 }, createFolders: false, date },
    );
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
}
```

`src/services/epub/build.ts` — add the imports and push the entry after the images loop, before the `deps.onProgress?.({ stage: "zip", done: 0, ... })` line:

```ts
import { writeEdb } from "@/services/edb/write";
import { EMBEDDED_PROJECT_ENTRY } from "@/services/export/embedded-project";
```

```ts
for (const image of prepared.images) entries.push([`OEBPS/${image.path}`, image.output.bytes]);
if (options.embedProject) {
  check(deps.signal);
  // Last entry, outside OEBPS and the OPF manifest: reading systems never see it.
  entries.push([EMBEDDED_PROJECT_ENTRY, await writeEdb(book, exported, { updateModified: false })]);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/services/epub`
Expected: PASS.

- [ ] **Step 5: Add the epubcheck fixture**

In `scripts/build-fixture-epubs.mts`, replace everything from `const output = resolve(...)` to the end of the file with:

```ts
const options = {
  imagePreset: "kindle-paperwhite",
  grayscale: false,
  titlePage: true,
  versionInTitle: true,
} as const;
const deps = { imageProcessor: processor, now: () => new Date("2026-01-02T03:04:05Z") };
const outputs = [
  { path: resolve("fixtures/task-18-fixture.epub"), bytes: await buildEpub(book, options, deps) },
  {
    // The unmanifested project.edb entry must not produce an epubcheck warning.
    path: resolve("fixtures/embedded-project-fixture.epub"),
    bytes: await buildEpub(book, { ...options, embedProject: true }, deps),
  },
];
await mkdir(resolve("fixtures"), { recursive: true });
for (const { path, bytes } of outputs) await writeFile(path, bytes);

await execFileAsync(
  resolve("scripts/epubcheck.sh"),
  outputs.map(({ path }) => path),
  { stdio: "inherit" },
);
```

`fixtures/*.epub` is git-ignored; nothing new is tracked.

- [ ] **Step 6: Run the gate**

With Java 17+ and epubcheck 5.2.1 unpacked in `.tools/epubcheck` (see the "Install pinned epubcheck" step in `.github/workflows/ci.yml`):

Run: `pnpm build:fixture-epubs`
Expected: exit code 0 and "No errors or warnings detected" for both files.

Without local Java: commit (Step 7), ask the user for permission to push the branch, push, and read the `ci` job (`gh run watch`); its `pnpm build:fixture-epubs` step is the gate.

**Gate:** exit code 0 → continue with Task 2. A warning that names `project.edb` (for example `OPF-003`) → **stop and report to the user**; do not weaken `scripts/epubcheck.sh`.

- [ ] **Step 7: Commit**

```bash
pnpm exec oxfmt src/services/export src/services/epub scripts/build-fixture-epubs.mts
git add src/services/export/types.ts src/services/export/embedded-project.ts src/services/epub scripts/build-fixture-epubs.mts
git commit -m "feat(epub): embed the project file as project.edb" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: AZW3 SRCS record

**Files:**

- Modify: `src/services/azw3/records.ts`, `src/services/azw3/headers.ts`, `src/services/azw3/build.ts`
- Modify: `scripts/build-fixture-azw3.mts`, `src/services/azw3/__tests__/fixture-manifest.json`
- Test: `src/services/azw3/__tests__/records.test.ts`, `headers.test.ts`, `build.test.ts`

**Interfaces:**

- Consumes: `ExportOptions.embedProject` (Task 1); `writeEdb` from `@/services/edb/write`.
- Produces: `buildSrcsRecord(payload: Uint8Array): Uint8Array` from `@/services/azw3/records`; the `"srcs"` key in `HeaderInput.recordIndices` (optional; absent means no SRCS record).

- [ ] **Step 1: Write the failing tests**

Append to `src/services/azw3/__tests__/build.test.ts` (`buildAzw3`, `readPalmDb`, `exportOptions`, `fixtureBook`, `fixtureProcessor` and `at` already exist there). Both comparisons are made between builds of the same run, so no stored reference value is involved.

```ts
import { writeEdb } from "@/services/edb/write";

describe("buildAzw3 with an embedded project", () => {
  const deps = () => ({ imageProcessor: fixtureProcessor(), now: () => at("08") });
  const magic = (record: Uint8Array) => new TextDecoder().decode(record.subarray(0, 4));

  it("treats an explicit false like an absent option", async () => {
    const plain = await buildAzw3(fixtureBook(), exportOptions(), deps());
    const off = await buildAzw3(fixtureBook(), { ...exportOptions(), embedProject: false }, deps());
    expect(off).toEqual(plain);
  });

  it("changes nothing but the added record and its two header fields", async () => {
    const book = fixtureBook();
    const plain = readPalmDb(await buildAzw3(book, exportOptions(), deps()));
    const palm = readPalmDb(
      await buildAzw3(book, { ...exportOptions(), embedProject: true }, deps()),
    );
    const srcsIndex = new DataView(palm.records[0]!.buffer).getUint32(224);

    const others = palm.records.filter((_, index) => index !== srcsIndex);
    expect(others.slice(1)).toEqual(plain.records.slice(1));
    // Record 0 differs only in the SRCS index (224) and count (228).
    const zero = palm.records[0]!.slice();
    zero.fill(0xff, 224, 228);
    zero.fill(0, 228, 232);
    expect(zero).toEqual(plain.records[0]);
  });
});
```

Add inside the same `describe`:

```ts
it("adds one SRCS record before EOF and points record 0 at FLIS, FCIS and SRCS", async () => {
  const book = fixtureBook();
  const plain = readPalmDb(await buildAzw3(book, exportOptions(), deps()));
  const palm = readPalmDb(
    await buildAzw3(book, { ...exportOptions(), embedProject: true }, deps()),
  );
  const header = new DataView(palm.records[0]!.buffer);

  expect(palm.records).toHaveLength(plain.records.length + 1);
  expect(magic(palm.records[header.getUint32(192)]!)).toBe("FDST");
  expect(magic(palm.records[header.getUint32(200)]!)).toBe("FCIS");
  expect(magic(palm.records[header.getUint32(208)]!)).toBe("FLIS");
  const srcsIndex = header.getUint32(224);
  expect(srcsIndex).toBe(palm.records.length - 2);
  expect(srcsIndex).toBe(header.getUint32(200) + 1);
  expect(header.getUint32(228)).toBe(1);
  const srcs = palm.records[srcsIndex]!;
  expect([...srcs.subarray(0, 16)]).toEqual([
    0x53, 0x52, 0x43, 0x53, 0, 0, 0, 0x10, 0, 0, 0, 0x2f, 0, 0, 0, 1,
  ]);
  expect([...srcs.subarray(16)]).toEqual([
    ...(await writeEdb(book, new Date(0), { updateModified: false })),
  ]);
  expect([...palm.records.at(-1)!]).toEqual([0xe9, 0x8e, 0x0d, 0x0a]);

  const plainHeader = new DataView(plain.records[0]!.buffer);
  expect(plainHeader.getUint32(224)).toBe(0xffffffff);
  expect(plainHeader.getUint32(228)).toBe(0);
  expect(magic(plain.records[plainHeader.getUint32(200)]!)).toBe("FCIS");
  expect(magic(plain.records[plainHeader.getUint32(208)]!)).toBe("FLIS");
});

it("does not embed after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    buildAzw3(
      fixtureBook(),
      { ...exportOptions(), embedProject: true },
      {
        ...deps(),
        signal: controller.signal,
      },
    ),
  ).rejects.toMatchObject({ code: "export.cancelled" });
});
```

Append to `src/services/azw3/__tests__/records.test.ts` (change the import to `import { buildEndRecords, buildSrcsRecord } from "../records";`):

```ts
describe("buildSrcsRecord", () => {
  it("prefixes the payload with the 16-byte KindleGen SRCS header", () => {
    expect(hex(buildSrcsRecord(Uint8Array.from([1, 2, 3])))).toBe(
      "53524353000000100000002f00000001010203",
    );
    expect(buildSrcsRecord(new Uint8Array())).toHaveLength(16);
  });
});
```

Add inside `describe("buildRecordZero", ...)` in `headers.test.ts`:

```ts
it("points at the SRCS record only when one is supplied", () => {
  const plain = buildRecordZero(input());
  expect(u32(plain, 224)).toBe(0xffffffff);
  expect(u32(plain, 228)).toBe(0);

  const recordIndices = new Map(input().recordIndices);
  recordIndices.set("srcs", 13);
  const embedded = buildRecordZero(input({ recordIndices }));
  expect(u32(embedded, 224)).toBe(13);
  expect(u32(embedded, 228)).toBe(1);
  expect(embedded).toHaveLength(plain.length);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/services/azw3`
Expected: FAIL — `buildSrcsRecord` is not exported, offset 224 is `0xffffffff`, no extra record. "treats an explicit false like an absent option" already passes.

- [ ] **Step 3: Implement**

`src/services/azw3/records.ts` — append:

```ts
const SRCS_HEADER_LENGTH = 16;

/** Wrap the project file in the SRCS record KindleGen used for a zip of the book's sources. */
export function buildSrcsRecord(payload: Uint8Array): Uint8Array {
  const record = new Uint8Array(SRCS_HEADER_LENGTH + payload.length);
  record.set([0x53, 0x52, 0x43, 0x53]);
  writeUint32BE(record, 4, SRCS_HEADER_LENGTH);
  writeUint32BE(record, 8, 0x2f); // Fixed value in KindleGen output.
  writeUint32BE(record, 12, 1);
  record.set(payload, SRCS_HEADER_LENGTH);
  return record;
}
```

`src/services/azw3/headers.ts` — in `buildRecordZero`, replace

```ts
writeUint32BE(bytes, 224, NULL);
writeUint32BE(bytes, 228, 0);
```

with

```ts
// SRCS: the embedded project file, when the export carries one.
writeUint32BE(bytes, 224, roleIndex(input.recordIndices, "srcs"));
writeUint32BE(bytes, 228, input.recordIndices.has("srcs") ? 1 : 0);
```

(`roleIndex` returns `NULL` for an absent key, so the bytes are unchanged without the record.)

`src/services/azw3/build.ts` — extend the imports:

```ts
import { writeEdb } from "@/services/edb/write";
import { buildEndRecords, buildSrcsRecord } from "./records";
```

and replace

```ts
recordIndices.set("fdst", records.length);
const [flis, fcis, eof] = buildEndRecords(layout.text.length, textParts.length);
records.push(indexes.fdst, flis!, fcis!, eof!);
recordIndices.set("flis", records.length - 3);
recordIndices.set("fcis", records.length - 2);
```

with

```ts
// Each index is captured when its record is pushed: the tail of the list is
// not fixed once an SRCS record can sit between FCIS and EOF.
const [flis, fcis, eof] = buildEndRecords(layout.text.length, textParts.length);
const pushRecord = (key: string, record: Uint8Array) => {
  recordIndices.set(key, records.length);
  records.push(record);
};
pushRecord("fdst", indexes.fdst);
pushRecord("flis", flis!);
pushRecord("fcis", fcis!);
if (options.embedProject) {
  check(deps.signal);
  pushRecord("srcs", buildSrcsRecord(await writeEdb(book, exportedAt, { updateModified: false })));
  await checkpoint(deps);
}
records.push(eof!);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/services/azw3`
Expected: PASS.

- [ ] **Step 5: Add the Calibre interoperability fixture**

`scripts/build-fixture-azw3.mts` — add the import and let `writeBook` take options:

```ts
import type { ExportOptions } from "../src/services/export/types";
```

```ts
const writeBook = async (
  name: string,
  book: ReturnType<typeof fixtureBook>,
  options: ExportOptions = exportOptions(),
) => {
  const started = performance.now();
  const bytes = await buildAzw3(book, options, {
    imageProcessor: fixtureProcessor(),
    now,
  });
```

(the rest of `writeBook` is unchanged). Before `const paths = [`, add:

```ts
const embeddedProject = fixtureBook();
embeddedProject.metadata.title = "AZW3 Embedded Project";
embeddedProject.metadata.cover = null;
embeddedProject.chapters = [
  { id: "embedded", source: "# Embedded\n\nThis book carries its project file." },
];
embeddedProject.customCss = null;
```

and add to the `paths` array, after the `300-chapter-long` line:

```ts
  await writeBook("embedded-project", embeddedProject, { ...exportOptions(), embedProject: true }),
```

`src/services/azw3/__tests__/fixture-manifest.json` — add a top-level entry (the verifier fails when fixture files and manifest keys differ):

```json
  "embedded-project": {
    "chapters": [
      {
        "title": "Embedded",
        "markers": ["This book carries its project file."]
      }
    ],
    "nav": ["Embedded"],
    "notes": [],
    "cover": null,
    "css_markers": [],
    "image_markers": [],
    "inline_image_count": 0,
    "css_image_count": 0
  }
```

- [ ] **Step 6: Verify with Calibre**

Run: `pnpm test:verify-azw3 && pnpm verify:azw3`
(Calibre 9.15.0 at `/Applications/calibre.app`; elsewhere set `CALIBRE_DIR`.)
Expected: exit code 0; `embedded-project` is inspected as a single MOBI 8 book and converts with the expected chapter and TOC.

If Calibre rejects the file or drops the chapter, **stop and report**: that is spec risk 2 showing up in Calibre, not a test to adjust.

- [ ] **Step 7: Commit**

```bash
pnpm exec oxfmt src/services/azw3 scripts/build-fixture-azw3.mts
git add src/services/azw3 scripts/build-fixture-azw3.mts
git commit -m "feat(azw3): embed the project file in an SRCS record" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reading the embedded project back

**Files:**

- Modify: `src/services/export/embedded-project.ts`
- Test: `src/services/export/__tests__/embedded-project.test.ts` (new)

**Interfaces:**

- Consumes: `EMBEDDED_PROJECT_ENTRY`; `buildEpub`, `buildAzw3` with `embedProject` (Tasks 1, 2) in tests only.
- Produces, from `@/services/export/embedded-project`:

```ts
export type BookContainer = "epub" | "azw3";
export interface EmbeddedProjectLookup {
  container: BookContainer | null; // null: the bytes are not an exported book
  project: Uint8Array | null; // null: no embedded project
}
export function findEmbeddedProject(bytes: Uint8Array): Promise<EmbeddedProjectLookup>;
export function extractEmbeddedProject(bytes: Uint8Array): Promise<Uint8Array | null>;
```

Neither function throws or rejects, for any input.

- [ ] **Step 1: Write the failing tests**

Create `src/services/export/__tests__/embedded-project.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAzw3 } from "@/services/azw3/build";
import { writePalmDb } from "@/services/azw3/palmdb";
import {
  exportOptions,
  fixtureBook,
  fixtureProcessor,
  png,
} from "@/services/azw3/__tests__/fixtures";
import { readEdb } from "@/services/edb/read";
import { writeEdb } from "@/services/edb/write";
import { buildEpub } from "@/services/epub/build";
import { makeZip } from "@/services/epub/zip";
import { extractEmbeddedProject, findEmbeddedProject } from "../embedded-project";

const deps = () => ({
  imageProcessor: fixtureProcessor(),
  now: () => new Date("2026-01-08T03:04:05.000Z"),
});
const builders = [
  ["epub", buildEpub],
  ["azw3", buildAzw3],
] as const;

/** A book that exercises every part of the project file. */
function richBook() {
  const book = fixtureBook();
  book.metadata.cover = "images/cover.png";
  book.resources.set("images/cover.png", { mediaType: "image/png", bytes: png });
  book.customCss = "p { margin: 0; }";
  book.dictionary = ["Минжуй"];
  return book;
}
const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const setU32 = (bytes: Uint8Array, offset: number, value: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
const recordStart = (bytes: Uint8Array, index: number) => u32(bytes, 78 + index * 8);

/** A minimal BOOKMOBI file written without the exporter: record 0 plus one extra record. */
function handMadeMobi(extra: Uint8Array): Uint8Array {
  const zero = new Uint8Array(280);
  zero.set(new TextEncoder().encode("MOBI"), 16);
  setU32(zero, 20, 264);
  setU32(zero, 224, 1);
  setU32(zero, 228, 1);
  return writePalmDb([zero, extra], "Hand made", { created: new Date("2026-01-01T00:00:00Z") });
}

describe("embedded project", () => {
  it.each(builders)("round-trips the project through %s", async (container, build) => {
    const book = richBook();
    const bytes = await build(book, { ...exportOptions(), embedProject: true }, deps());

    const lookup = await findEmbeddedProject(bytes);
    expect(lookup.container).toBe(container);
    const opened = await readEdb(lookup.project!, { now: () => new Date("2030-01-01T00:00:00Z") });
    expect(opened.warnings).toEqual([]);
    expect(opened.migrated).toBe(false);
    expect(opened.book).toEqual(book);
    expect(await extractEmbeddedProject(bytes)).toEqual(lookup.project);
  });

  it.each(builders)("finds no project in a plain %s export", async (container, build) => {
    const bytes = await build(richBook(), exportOptions(), deps());
    expect(await findEmbeddedProject(bytes)).toEqual({ container, project: null });
    expect(await extractEmbeddedProject(bytes)).toBeNull();
  });

  it("does not take a project file or other input for a book", async () => {
    const edb = await writeEdb(richBook(), new Date(0), { updateModified: false });
    const inputs = [
      edb,
      new Uint8Array(),
      Uint8Array.from([1, 2, 3]),
      new TextEncoder().encode("PK is not always a zip archive, and this text is long enough."),
      new Uint8Array(4096),
    ];
    for (const input of inputs)
      expect(await findEmbeddedProject(input)).toEqual({ container: null, project: null });
  });

  it("recognises a third-party EPUB whose mimetype ends with a newline", async () => {
    const epub = await makeZip([
      ["mimetype", "application/epub+zip\n"],
      ["META-INF/container.xml", "<container/>"],
    ]);
    expect(await findEmbeddedProject(epub)).toEqual({ container: "epub", project: null });
  });

  it("returns the payload of a hand-made SRCS record", async () => {
    const record = Uint8Array.from([
      0x53, 0x52, 0x43, 0x53, 0, 0, 0, 0x10, 0, 0, 0, 0x2f, 0, 0, 0, 1, 9, 8, 7,
    ]);
    expect(await findEmbeddedProject(handMadeMobi(record))).toEqual({
      container: "azw3",
      project: Uint8Array.from([9, 8, 7]),
    });
  });

  it("returns null for an inconsistent SRCS pointer or record", async () => {
    const good = await buildAzw3(richBook(), { ...exportOptions(), embedProject: true }, deps());
    const zero = recordStart(good, 0);
    const srcsIndex = u32(good, zero + 224);
    const srcs = recordStart(good, srcsIndex);
    const mutate = (change: (copy: Uint8Array) => void) => {
      const copy = good.slice();
      change(copy);
      return copy;
    };
    const broken = [
      mutate((copy) => setU32(copy, zero + 224, 60000)), // index out of range
      mutate((copy) => setU32(copy, zero + 224, 0)), // record 0 is never SRCS
      mutate((copy) => setU32(copy, zero + 228, 0)), // count says "none"
      mutate((copy) => (copy[srcs] = 0x58)), // wrong magic
      good.subarray(0, srcs + 20), // file cut inside the SRCS record
      good.subarray(0, zero + 100), // file cut inside record 0
      handMadeMobi(new TextEncoder().encode("SRCS")), // record shorter than its header
    ];
    for (const bytes of broken)
      expect(await findEmbeddedProject(bytes)).toEqual({ container: "azw3", project: null });
  });

  it("never rejects, whatever the length of a truncated book", async () => {
    const azw3 = await buildAzw3(richBook(), { ...exportOptions(), embedProject: true }, deps());
    const epub = await buildEpub(richBook(), { ...exportOptions(), embedProject: true }, deps());
    for (const source of [azw3, epub])
      for (const length of [0, 1, 4, 59, 60, 68, 77, 78, 79, 86, 100, 300, source.length >> 1])
        await expect(extractEmbeddedProject(source.subarray(0, length))).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/services/export/__tests__/embedded-project.test.ts`
Expected: FAIL — `findEmbeddedProject` / `extractEmbeddedProject` are not exported.

- [ ] **Step 3: Implement**

Replace `src/services/export/embedded-project.ts` with:

```ts
import JSZip from "jszip";

/** Zip entry that carries the project inside an exported EPUB: container root, not in the OPF. */
export const EMBEDDED_PROJECT_ENTRY = "project.edb";

export type BookContainer = "epub" | "azw3";
export interface EmbeddedProjectLookup {
  /** The book format recognised from the bytes; `null` when they are not an exported book. */
  container: BookContainer | null;
  /** The embedded `.edb` bytes; `null` when the book carries none. */
  project: Uint8Array | null;
}

const NOT_A_BOOK: EmbeddedProjectLookup = { container: null, project: null };
const NULL_INDEX = 0xffffffff;
const SRCS_HEADER_LENGTH = 16;
// Offsets from the start of record 0.
const MOBI_MAGIC_OFFSET = 16;
const SRCS_INDEX_OFFSET = 224;
const SRCS_COUNT_OFFSET = 228;

function hasAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** Record boundaries of a PalmDB file, or `null` when the record list is inconsistent. */
function palmRecords(bytes: Uint8Array): Array<{ start: number; end: number }> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(76);
  const first = 78 + count * 8;
  if (count < 1 || first > bytes.length) return null;
  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = view.getUint32(78 + i * 8);
    if (start < first || start > bytes.length || (i > 0 && start < starts[i - 1]!)) return null;
    starts.push(start);
  }
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? bytes.length }));
}

function projectFromPalm(bytes: Uint8Array): Uint8Array | null {
  const records = palmRecords(bytes);
  if (!records) return null;
  const zero = bytes.subarray(records[0]!.start, records[0]!.end);
  if (zero.length < SRCS_COUNT_OFFSET + 4 || !hasAscii(zero, MOBI_MAGIC_OFFSET, "MOBI"))
    return null;
  const view = new DataView(zero.buffer, zero.byteOffset, zero.byteLength);
  // A shorter MOBI header ends before the SRCS fields; those bytes are then EXTH data.
  if (view.getUint32(20) < SRCS_COUNT_OFFSET + 4 - MOBI_MAGIC_OFFSET) return null;
  const index = view.getUint32(SRCS_INDEX_OFFSET);
  if (index === NULL_INDEX || index === 0 || view.getUint32(SRCS_COUNT_OFFSET) === 0) return null;
  const record = records[index];
  if (!record) return null;
  const srcs = bytes.subarray(record.start, record.end);
  if (srcs.length < SRCS_HEADER_LENGTH || !hasAscii(srcs, 0, "SRCS")) return null;
  return srcs.slice(SRCS_HEADER_LENGTH);
}

async function lookupZip(bytes: Uint8Array): Promise<EmbeddedProjectLookup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
    const mimetype = await zip.file("mimetype")?.async("string");
    // Some tools end the entry with a newline.
    if (mimetype?.trim() !== "application/epub+zip") return NOT_A_BOOK;
  } catch {
    return NOT_A_BOOK;
  }
  try {
    const entry = zip.file(EMBEDDED_PROJECT_ENTRY);
    return { container: "epub", project: entry ? await entry.async("uint8array") : null };
  } catch {
    return { container: "epub", project: null };
  }
}

/**
 * Recognise an exported book by its bytes (never by file extension) and return
 * the project embedded in it. Truncated or inconsistent input yields `null`
 * fields; this never throws.
 */
export async function findEmbeddedProject(bytes: Uint8Array): Promise<EmbeddedProjectLookup> {
  if (bytes.length >= 78 && hasAscii(bytes, 60, "BOOKMOBI")) {
    try {
      return { container: "azw3", project: projectFromPalm(bytes) };
    } catch {
      return { container: "azw3", project: null };
    }
  }
  if (hasAscii(bytes, 0, "PK")) return lookupZip(bytes);
  return NOT_A_BOOK;
}

/** The embedded `.edb` bytes of an exported EPUB or AZW3, or `null`. */
export async function extractEmbeddedProject(bytes: Uint8Array): Promise<Uint8Array | null> {
  return (await findEmbeddedProject(bytes)).project;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/services/export src/services/epub src/services/azw3`
Expected: PASS.

Note for the truncation test: the lengths stop at half the file on purpose. An AZW3 that lost only bytes of its last (end-of-file) record still has an intact SRCS record and correctly returns the project. A truncated EPUB loses its central directory, so JSZip fails and the lookup is `{ container: null, project: null }` — `extractEmbeddedProject` is `null` either way.

- [ ] **Step 5: Lint and commit**

```bash
pnpm exec oxfmt src/services/export && pnpm lint
git add src/services/export
git commit -m "feat(export): read the project embedded in EPUB and AZW3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Open `.epub` and `.azw3`

**Files:**

- Modify: `src/composables/use-project-files.ts` (`openPathAfterGuard` at lines 175–248, `open` at 250–257)
- Modify: `src/locales/en.json`, `src/locales/ru.json`, `src/locales/zh-CN.json`
- Test: `src/composables/__tests__/use-project-files.test.ts`

**Interfaces:**

- Consumes: `findEmbeddedProject(bytes): Promise<{ container: "epub" | "azw3" | null; project: Uint8Array | null }>` and `EMBEDDED_PROJECT_ENTRY` from `@/services/export/embedded-project`; `ReadEdbResult` from `@/services/edb/read`; `services.recovery.remove(bookId)`.
- Produces: locale key `files.noEmbeddedProject`. No signature of `ProjectFilesController` changes.

- [ ] **Step 1: Write the failing tests**

Append to `src/composables/__tests__/use-project-files.test.ts`. `makeBook`, `createProjectFiles`, `writeEdb` and the stores are already imported there.

```ts
import { buildAzw3 } from "@/services/azw3/build";
import { exportOptions, fixtureBook, fixtureProcessor } from "@/services/azw3/__tests__/fixtures";
import { makeZip } from "@/services/epub/zip";
import { EMBEDDED_PROJECT_ENTRY } from "@/services/export/embedded-project";
import type { Book } from "@/types/book";
import { createAutosave } from "../use-autosave";

describe("opening a project embedded in a book", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const edbOf = (book: Book) => writeEdb(book, new Date("2026-01-02"), { updateModified: false });
  const epubWith = (project: Uint8Array | null) => {
    const entries: Array<[string, string | Uint8Array]> = [["mimetype", "application/epub+zip"]];
    if (project) entries.push([EMBEDDED_PROJECT_ENTRY, project]);
    return makeZip(entries);
  };
  const everything = (book: Book) => ({
    changedChapters: new Set(book.chapters.map(({ id }) => id)),
    removedChapters: new Set<string>(),
    changedResources: new Set(book.resources.keys()),
    removedResources: new Set<string>(),
  });

  it("opens the project of an EPUB as an unsaved book that is not in Recent", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/novel.epub", await epubWith(await edbOf(makeBook())));
    const files = createProjectFiles({ services, locale: "en" });
    useLayoutStore().center = { kind: "metadata" };

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);

    const project = useProjectStore();
    expect(project.book?.chapters[0]?.source).toBe("# Chapter 1");
    expect(project.filePath).toBeNull();
    expect(project.fileMtime).toBeNull();
    expect(project.dirty).toBe(true);
    expect(await services.settings.get("recentFiles", [])).toEqual([]);
    expect(useDiagnosticsStore().readWarnings).toEqual([]);
    expect(useLayoutStore().center).toEqual({ kind: "chapter", id: "chapter1" });
  });

  it("opens the project of an AZW3", async () => {
    const services = createInMemoryPlatformServices();
    const book = fixtureBook();
    await services.files.writeFile(
      "/inbox/novel.azw3",
      await buildAzw3(
        book,
        { ...exportOptions(), embedProject: true },
        {
          imageProcessor: fixtureProcessor(),
          now: () => new Date("2026-01-08T03:04:05.000Z"),
        },
      ),
    );
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.azw3")).resolves.toBe(true);

    expect(useProjectStore().book?.metadata.id).toBe(book.metadata.id);
    expect(useProjectStore().filePath).toBeNull();
    expect(useProjectStore().dirty).toBe(true);
  });

  it("says so when the book has no project and keeps the current one", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/plain.epub", await epubWith(null));
    const project = useProjectStore();
    project.configure(services);
    const current = makeBook();
    project.setBook(current, "/books/current.edb", { dirty: false });
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/plain.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith(
      "This book does not contain a project file",
      "Open project",
    );
    expect(project.book?.metadata.id).toBe(current.metadata.id);
    expect(project.filePath).toBe("/books/current.edb");
  });

  it("reports a broken embedded project with the usual open error", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile(
      "/inbox/broken.epub",
      await epubWith(Uint8Array.from([1, 2, 3])),
    );
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/broken.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith("Could not open project", "Open project");
    expect(useProjectStore().book).toBeNull();
  });

  it("drops a recovery session of the same book so the original file cannot be overwritten", async () => {
    const services = createInMemoryPlatformServices();
    const original = makeBook();
    const edb = await edbOf(original);
    await services.files.writeFile("/books/original.edb", edb);
    await services.files.writeFile("/inbox/novel.epub", await epubWith(edb));
    await services.recovery.writeChanges(original, everything(original), "/books/original.edb");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);
    expect(await services.recovery.list()).toEqual([]);
    expect(files.recoverySessions.value).toEqual([]);

    // The next autosave must not inherit the original project's path.
    const autosave = createAutosave({ project: useProjectStore(), services });
    await autosave.persist();
    autosave.stop();
    expect(await services.recovery.list()).toEqual([
      expect.objectContaining({ bookId: original.metadata.id, originalPath: null }),
    ]);
  });

  it("detaches from the original file when the same book is open and dirty", async () => {
    const services = createInMemoryPlatformServices();
    const original = makeBook();
    const edb = await edbOf(original);
    await services.files.writeFile("/books/original.edb", edb);
    await services.files.writeFile("/inbox/novel.epub", await epubWith(edb));
    const project = useProjectStore();
    project.configure(services);
    project.setBook(original, "/books/original.edb", { dirty: true });
    await services.recovery.writeChanges(original, everything(original), "/books/original.edb");
    const files = createProjectFiles({
      services,
      locale: "en",
      requestDecision: async () => "discard",
    });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(true);

    expect(project.filePath).toBeNull();
    expect(await services.recovery.list()).toEqual([]);
    const saveDialog = vi.spyOn(services.dialogs, "save").mockResolvedValue(null);
    const write = vi.spyOn(services.files, "writeFileAtomic");
    await expect(files.save()).resolves.toBe(false);
    expect(saveDialog).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not open the book when the old recovery session cannot be removed", async () => {
    const services = createInMemoryPlatformServices();
    await services.files.writeFile("/inbox/novel.epub", await epubWith(await edbOf(makeBook())));
    const project = useProjectStore();
    project.configure(services);
    const current = fixtureBook();
    project.setBook(current, "/books/current.edb", { dirty: false });
    vi.spyOn(services.recovery, "remove").mockRejectedValue(new Error("idb"));
    const message = vi.spyOn(services.dialogs, "message");
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/novel.epub")).resolves.toBe(false);

    expect(message).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith("Could not open project", "Open project");
    expect(project.book?.metadata.id).toBe(current.metadata.id);
    expect(project.filePath).toBe("/books/current.edb");
  });

  it("decides by the bytes, not by the extension", async () => {
    const services = createInMemoryPlatformServices();
    const edb = await edbOf(makeBook());
    await services.files.writeFile("/inbox/renamed.edb", await epubWith(edb));
    await services.files.writeFile("/inbox/project.epub", edb);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.openPath("/inbox/renamed.edb")).resolves.toBe(true);
    expect(useProjectStore().filePath).toBeNull();
    expect(await services.settings.get("recentFiles", [])).toEqual([]);

    await expect(files.openPath("/inbox/project.epub")).resolves.toBe(true);
    expect(useProjectStore().filePath).toBe("/inbox/project.epub");
    expect(useProjectStore().dirty).toBe(false);
  });

  it("offers project files and books in the Open dialog", async () => {
    const services = createInMemoryPlatformServices();
    const open = vi.spyOn(services.dialogs, "open").mockResolvedValue(null);
    const files = createProjectFiles({ services, locale: "en" });

    await expect(files.open()).resolves.toBe(false);

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "Easy Digital Book", extensions: ["edb", "epub", "azw3"] }],
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run src/composables/__tests__/use-project-files.test.ts`
Expected: the new block FAILS (a book is read as a broken `.edb`: "Could not open project"; the filter is `["edb"]`). Existing tests pass.

- [ ] **Step 3: Implement the open path**

In `src/composables/use-project-files.ts`:

Change the `readEdb` import and add the lookup import:

```ts
import { readEdb, type ReadEdbResult } from "@/services/edb/read";
import { findEmbeddedProject } from "@/services/export/embedded-project";
```

Add this function inside `createProjectFiles`, directly above `openPathAfterGuard`:

```ts
/** Opens a project taken out of an exported book as an unsaved book. */
async function openEmbeddedProject(
  result: ReadEdbResult,
  previousId: string | undefined,
): Promise<boolean> {
  const bookId = result.book.metadata.id;
  // The project has the UUID of the author's original .edb, and a recovery
  // session keeps its old originalPath when the new one is null. A leftover
  // session would let a later restore and save overwrite that original file.
  try {
    await services.recovery.remove(bookId);
  } catch (error) {
    services.logger.error("Could not clear the recovery session of an embedded project", {
      error,
    });
    await services.dialogs.message(
      t("files.openFailed", "Could not open project"),
      t("files.openTitle", "Open project"),
    );
    return false;
  }
  project.setBook(result.book, null, { dirty: true });
  selectFirstChapter(result.book, layout);
  diagnostics.clear();
  diagnostics.setReadWarnings(result.warnings);
  if (previousId && previousId !== bookId) await services.recovery.remove(previousId);
  await refreshRecovery();
  return true;
}
```

In `openPathAfterGuard`, replace

```ts
    let result;
    try {
      result = await readEdb(bytes, { now });
    } catch (error) {
```

with

```ts
    // An exported book is recognised by its bytes, never by the file extension.
    const embedded = await findEmbeddedProject(bytes);
    const fromBook = embedded.container !== null;
    if (fromBook && !embedded.project) {
      await services.dialogs.message(
        t("files.noEmbeddedProject", "This book does not contain a project file"),
        t("files.openTitle", "Open project"),
      );
      return false;
    }

    let result;
    try {
      result = await readEdb(embedded.project ?? bytes, { now });
    } catch (error) {
```

and directly after that `try`/`catch` block (before `let fileMtime: number | null = null;`) add:

```ts
if (fromBook) return openEmbeddedProject(result, previousId);
```

In `open()`, change the filter:

```ts
      filters: [
        {
          name: t("files.openFilter", "Easy Digital Book"),
          extensions: ["edb", "epub", "azw3"],
        },
      ],
```

Leave `saveAs` (`extensions: ["edb"]`) and `drainOpenPaths` (`.edb` only) unchanged.

- [ ] **Step 4: Add the locale key**

Add after `"openFailed"` in the `files` block of each locale:

- `src/locales/en.json`: `"noEmbeddedProject": "This book does not contain a project file",`
- `src/locales/ru.json`: `"noEmbeddedProject": "В этой книге нет файла проекта",`
- `src/locales/zh-CN.json`: `"noEmbeddedProject": "这本书不包含项目文件",`

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run src/composables src/plugins`
Expected: PASS (the locale key-parity test in `src/plugins/__tests__/i18n.test.ts` included).

- [ ] **Step 6: Commit**

```bash
pnpm exec oxfmt src/composables src/locales
git add src/composables/use-project-files.ts src/composables/__tests__/use-project-files.test.ts src/locales
git commit -m "feat(files): open the project embedded in an EPUB or AZW3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Export dialog option

**Files:**

- Modify: `src/composables/use-export.ts` (the `nextSettings` object in `exportBook`)
- Modify: `src/components/export/ExportDialog.vue`
- Modify: `src/locales/en.json`, `src/locales/ru.json`, `src/locales/zh-CN.json`
- Test: `src/composables/__tests__/use-export.test.ts`, `src/components/export/__tests__/ExportDialog.test.ts`

**Interfaces:**

- Consumes: `ExportOptions.embedProject` (Task 1); `extractEmbeddedProject` (Task 3) in tests.
- Produces: locale keys `export.embedProject`, `export.embedProjectHint`, `export.savedWithProject`. `ExportController` is unchanged: the checkbox binds to `controller.options.value.embedProject`.

- [ ] **Step 1: Write the failing controller tests**

Add inside `describe("export controller", ...)` in `src/composables/__tests__/use-export.test.ts`, with these imports at the top:

```ts
import { readEdb } from "@/services/edb/read";
import { extractEmbeddedProject } from "@/services/export/embedded-project";
```

```ts
it("passes the embed option to the builder but never persists it", async () => {
  const { services, project, settings } = setup();
  const builder = vi.fn<ExportBuilder>(async () => new Uint8Array([1, 2, 3]));
  const controller = createExportController({
    services,
    project,
    settings,
    imageProcessor: processor,
    builders: { epub: builder },
  });
  controller.options.value.embedProject = true;

  await controller.exportBook({ path: "/exports/Novel.epub" });

  expect(builder.mock.calls[0]![1]).toMatchObject({ embedProject: true });
  expect(settings.exportSettings).not.toHaveProperty("embedProject");
  expect(await services.settings.get("export", {})).not.toHaveProperty("embedProject");
  expect(await services.settings.get("export", {})).toMatchObject({ lastDir: "/exports" });
});

it("embeds a dirty, never-saved book without touching its state", async () => {
  const { services, project, settings } = setup();
  project.setBook(makeBook(), null, { dirty: true });
  project.updateChapterSource("chapter1", "# Chapter 1\n\nUnsaved text.");
  const revision = project.revision;
  const modified = project.book!.metadata.modified;
  const controller = createExportController({
    services,
    project,
    settings,
    imageProcessor: processor,
  });
  controller.options.value.embedProject = true;

  await controller.exportBook({ path: "/exports/Novel.epub" });

  const embedded = await extractEmbeddedProject(
    await services.files.readFile("/exports/Novel.epub"),
  );
  const opened = await readEdb(embedded!, { now: () => new Date("2030-01-01T00:00:00Z") });
  expect(opened.book.chapters[0]!.source).toBe("# Chapter 1\n\nUnsaved text.");
  expect(opened.book.metadata.modified).toBe(modified);
  expect(project.revision).toBe(revision);
  expect(project.dirty).toBe(true);
  expect(project.filePath).toBeNull();
  expect(project.book!.metadata.modified).toBe(modified);
});
```

- [ ] **Step 2: Run to verify**

Run: `pnpm exec vitest run src/composables/__tests__/use-export.test.ts`
Expected: the first test FAILS (`embedProject` is spread into the settings). The second already passes — it pins behaviour from Tasks 1 and 3 at the controller level.

- [ ] **Step 3: Persist settings by name**

In `src/composables/use-export.ts`, replace the `nextSettings` object in `exportBook`:

```ts
// Named fields only: embedProject is dialog state and must not be persisted.
const nextSettings = {
  ...settings.exportSettings,
  imagePreset: selectedOptions.imagePreset,
  grayscale: selectedOptions.grayscale,
  titlePage: selectedOptions.titlePage,
  versionInTitle: selectedOptions.versionInTitle,
  format: selectedFormat,
  lastDir: directoryOf(target),
};
```

- [ ] **Step 4: Write the failing dialog test**

Add inside `describe("ExportDialog", ...)` in `src/components/export/__tests__/ExportDialog.test.ts`:

```ts
it("offers embedding the project, off on every open, and names it in the success line", async () => {
  const controller = makeController();
  // A value left over from an earlier export must not survive the next open.
  controller.options.value.embedProject = true;
  const user = userEvent.setup();
  const { rerender } = render(ExportDialog, { props: { controller, open: true } });

  const checkbox = await screen.findByRole("checkbox", { name: /embed project file/i });
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(controller.options.value.embedProject).toBe(false);
  expect(screen.getByText(/do not publish this file/i)).toBeTruthy();

  await user.click(checkbox);
  expect(controller.options.value.embedProject).toBe(true);
  await user.click(screen.getByRole("button", { name: /export/i }));
  expect((await screen.findByRole("status")).textContent).toContain(
    "EPUB saved · with project file",
  );

  await rerender({ controller, open: false });
  await rerender({ controller, open: true });
  expect(controller.options.value.embedProject).toBe(false);
  expect(
    (await screen.findByRole("checkbox", { name: /embed project file/i })).getAttribute(
      "aria-checked",
    ),
  ).toBe("false");
});

it("keeps the plain success line without the project", async () => {
  const controller = makeController();
  render(ExportDialog, { props: { controller, open: true } });

  await userEvent.click(await screen.findByRole("button", { name: /export/i }));

  const status = (await screen.findByRole("status")).textContent ?? "";
  expect(status).toContain("EPUB saved");
  expect(status).not.toContain("project file");
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm exec vitest run src/components/export`
Expected: the first new test FAILS — there is no "Embed project file" checkbox.

- [ ] **Step 6: Implement the dialog**

In `src/components/export/ExportDialog.vue`, script section. Add the state next to `success`:

```ts
const savedWithProject = ref(false);
```

Replace `savedMessage`:

```ts
const savedMessage = computed(() =>
  savedWithProject.value
    ? t("export.savedWithProject", `${formatLabel.value} saved · with project file`, {
        format: formatLabel.value,
      })
    : t("export.saved", `${formatLabel.value} saved`, { format: formatLabel.value }),
);
```

Add a second watcher after the existing `watch(open, ...)`. It is separate because it must also run on mount, while the existing one must not emit `close` on mount:

```ts
// Embedding the project is a per-export decision: it starts off on every open
// and is never restored from settings.
watch(
  open,
  (value) => {
    if (value) props.controller.options.value.embedProject = false;
  },
  { immediate: true },
);
```

In `exportBook()`, capture the choice before the await and record it on success:

```ts
async function exportBook() {
  if (props.controller.exporting.value) return;
  success.value = false;
  const withProject = props.controller.options.value.embedProject === true;
  const controller = new AbortController();
  abortController.value = controller;
  try {
    const target = await props.controller.exportBook({
      signal: controller.signal,
      dialogTitle: title.value,
      dialogFilterName: filterName.value,
    });
    savedWithProject.value = withProject;
    success.value = Boolean(target);
  } catch {
    // The controller stores a localized-safe AppError for the template.
  } finally {
    abortController.value = null;
  }
}
```

Template: add this block directly after the `export-version` checkbox `<div>` and before the progress block:

```vue
      <div class="grid gap-1">
        <div class="flex items-center gap-2">
          <Checkbox
            id="export-embed-project"
            v-model="controller.options.value.embedProject"
            aria-describedby="export-embed-project-hint"
            :disabled="controller.exporting.value"
          />
          <Label for="export-embed-project">
            {{ t("export.embedProject", "Embed project file") }}
          </Label>
        </div>
        <p id="export-embed-project-hint" class="text-muted-foreground pl-6 text-sm">
          {{
            t(
              "export.embedProjectHint",
              "For editing. Do not publish this file: it contains the book's sources.",
            )
          }}
        </p>
      </div>
```

- [ ] **Step 7: Add the locale keys**

In the `export` block of each locale, after `"saved"`:

`src/locales/en.json`:

```json
    "savedWithProject": "{format} saved · with project file",
    "embedProject": "Embed project file",
    "embedProjectHint": "For editing. Do not publish this file: it contains the book's sources.",
```

`src/locales/ru.json`:

```json
    "savedWithProject": "{format} сохранён · с файлом проекта",
    "embedProject": "Вложить файл проекта",
    "embedProjectHint": "Для редактуры. Не публикуйте этот файл: в нём исходники книги.",
```

`src/locales/zh-CN.json`:

```json
    "savedWithProject": "{format} 已保存 · 含项目文件",
    "embedProject": "嵌入项目文件",
    "embedProjectHint": "用于编辑。请勿发布此文件：其中包含本书的源文件。",
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run src/components/export src/composables src/plugins src/views`
Expected: PASS. If the existing test "disables all export choices while an export is running" counts checkboxes, extend its expectation to the new one — it must be disabled while exporting.

- [ ] **Step 9: Commit**

```bash
pnpm exec oxfmt src/components/export src/composables src/locales
git add src/components/export src/composables/use-export.ts src/composables/__tests__/use-export.test.ts src/locales
git commit -m "feat(export): add the Embed project file option" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation and full verification

**Files:**

- Modify: `docs/release-checklist.md`, `README.md`, `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-10-11-embedded-project-design.md`

**Interfaces:** none.

- [ ] **Step 1: Release checklist**

In `docs/release-checklist.md`, add two rows to the packaged-app table, after the row "Packaged app exports AZW3/KF8 with `.azw3` extension; cancel, retry, and Show in folder work" (pad the cells to the table's column widths; `pnpm format` does it):

```markdown
| Export EPUB and AZW3 with "Embed project file"; Open accepts both and shows an unsaved book; Save asks for a new `.edb`; a book without a project shows "This book does not contain a project file" | [ ] | [ ] | [ ] |
| The "Embed project file" box is off again when the export dialog is reopened and after an app restart | [ ] | [ ] | [ ] |
```

Add one row to the "AZW3 device matrix" table:

```markdown
| AZW3 with an embedded project (SRCS record) opens, navigates and shows its cover like the same book without it | [ ] | [ ] |
```

- [ ] **Step 2: README**

In `README.md`, add this section between "🚀 How it works" (after its `> [!TIP]` block) and the `<a id="markup"></a>` anchor:

```markdown
### 📨 One file for your editor

Tick **Embed project file** in the export dialog and the exported `.epub` or
`.azw3` also carries the book's `.edb` project. Your editor reads the book on
a Kindle and opens the very same file in Easy Digital Book (**Open**) to get
the editable project.

> [!WARNING]
> Such a file is for the editing loop, not for publishing.
>
> - It contains the full sources, unencrypted: anyone who unpacks the file gets them.
> - The project survives only while the file itself is passed on. Send to
>   Kindle, KDP and Calibre conversion rebuild the book and drop the project.
> - The file is larger: images are stored twice, optimised in the book and
>   original in the project.
```

- [ ] **Step 3: Spec and AGENTS.md**

In `docs/superpowers/specs/2026-10-11-embedded-project-design.md`:

- change `- **Status:** approved design, not implemented` to `- **Status:** implemented (plan: docs/superpowers/plans/2026-10-12-embedded-project.md)`;
- in §4, replace the sentence in parentheses "(`use-export.ts` copies settings fields by name, so it does not leak.)" with "(`use-export.ts` copies fields by name in both directions, so it does not leak.)";
- in §5, after the `extractEmbeddedProject` bullet, add: "The module also exports `findEmbeddedProject`, which returns the recognised container together with the project, so the open flow can tell a book without a project from a file that is not a book.";
- in §8 item 1, append the epubcheck result observed in Task 1 (version, exit code, date).

In `AGENTS.md`, add a status entry at the top of the status list, in Russian like the rest of the file:

```markdown
**Статус (2026-10-12):** реализовано вложение проекта в экспортируемую книгу
(`docs/superpowers/specs/2026-10-11-embedded-project-design.md`, план
`docs/superpowers/plans/2026-10-12-embedded-project.md`): галочка «Вложить
файл проекта» в диалоге экспорта (только состояние диалога, не настройка),
EPUB — запись `project.edb` в корне контейнера вне OPF, AZW3 — запись `SRCS`
между FCIS и EOF. «Открыть» принимает `.epub`/`.azw3` и открывает вложенный
проект как несохранённую книгу; контейнер определяется по байтам
(`services/export/embedded-project.ts`). Открытие из ОС по-прежнему только
`.edb`. Проверка AZW3 с `SRCS` на Kindle — открытый пункт
`docs/release-checklist.md`.
```

In the "Экспорт" row of the decisions table in `AGENTS.md`, nothing changes.

- [ ] **Step 4: Full verification**

Run each and read the output:

```bash
pnpm check
pnpm build
pnpm test:verify-azw3 && pnpm verify:azw3
pnpm test:e2e
```

Expected: all exit 0. `pnpm build:fixture-epubs` additionally needs Java (see Task 1 Step 6); if it was verified in CI, say so in the report instead of claiming a local run.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add docs/release-checklist.md README.md AGENTS.md docs/superpowers/specs/2026-10-11-embedded-project-design.md
git commit -m "docs: document the embedded project file" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section                                    | Task                                         |
| ----------------------------------------------- | -------------------------------------------- |
| §3.1 EPUB entry                                 | 1                                            |
| §3.2 SRCS record, captured FLIS/FCIS indices    | 2                                            |
| §3.3 consequences for users                     | 6 (README)                                   |
| §4 option, payload, byte identity, success line | 1, 2 (builders), 5 (dialog, persistence)     |
| §5 `extractEmbeddedProject`, signatures         | 3                                            |
| §5 open flow, filter, recovery, errors, locales | 4                                            |
| §5 opening from the OS unchanged                | 4 (no change to `drainOpenPaths` / `lib.rs`) |
| §6 backward compatibility                       | 1, 2 ("only adds" tests)                     |
| §7 unit tests                                   | 1–5                                          |
| §7 CI fixtures                                  | 1 (epubcheck), 2 (`azw3-interoperability`)   |
| §8 risk 1 (epubcheck)                           | 1, gate in Step 8                            |
| §8 risk 2 (Kindle device)                       | 6 (release checklist); Calibre in 2          |
