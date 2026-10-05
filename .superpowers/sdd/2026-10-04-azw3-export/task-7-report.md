# Task 7 report — deterministic AZW3 builder

## Implementation

Added `buildAzw3(book, options, deps): Promise<Uint8Array>` in
`src/services/azw3/build.ts`. It calls `deps.now()` once, shares the existing
export preparation and image processor, orders resources before rewriting
markup, then lays out text/links, builds FRAG/SKEL/NCX indexes, attaches
PalmDOC compression, overlap and complete TBS trailers, assigns contiguous
records, builds record zero/end records, and writes PalmDB dates from
`book.created`. It returns deterministic bytes for equal inputs and does not
mutate the book. `BuildDependencies` now accepts optional `yieldControl`.

The sync `layoutText`, `buildIndexes`, and `writePalmDb` APIs remain available.
Their async counterparts reuse generator-based shared cores. They check the
abort signal after every awaited yield. Layout yields at 128 XML nodes,
documents, fragment partitions/rows, anchors and link patches; indexes yield
within 128-entry batches; the PalmDB writer checks/yields while copying each
1 MiB and between record batches. Build assembly yields between text records
and appended record batches. A single XML text node's encoding/serialization,
whole-document XML validation, final contiguous allocation, and one image
processing call remain synchronous; cancellation cannot interrupt those
individual operations.

The AZW3 resource rewrite emits CSS `kindle:embed` URLs without quotes. A
Calibre round-trip showed its parser malformed the quoted Kindle URI and
dropped the background declaration. The unquoted URL round-trips to a valid
relative resource path. Generic EPUB CSS output is unchanged.

## Tests and TDD evidence

The importable throwing-shell RED was run after the first pipeline existed,
not before initial implementation: replacing the real `buildAzw3` export with
a shell returning an empty `Uint8Array` made 7 of 8 build tests fail (including
the independent PalmDB structure assertions, expected cancellation rejection,
and final progress assertions). Restoring the pipeline made those assertions
pass. This is behavioral RED evidence, with that chronology limitation.
Separately, the quoted CSS regression failed against Calibre and the focused
resource assertion failed before the AZW3-only URI correction; it passed
afterward.

Focused verification:

```text
pnpm vitest run src/services/azw3/__tests__/build.test.ts
1 file / 8 tests passed
pnpm vitest run src/services/azw3 src/services/export
11 files / 108 tests passed
```

Build assertions cover fixed-clock byte identity, date-only EXTH changes,
non-mutation, resources and CSS name collisions, note/ref reconstruction,
title/version options, omitted absent notes/CSS, cancellation before work,
after image processing, during single-chapter layout, during full-build index
rows, direct index cancellation, and byte equality between sync/async layout
and indexes. PalmDB tests verify sync/async byte parity and cancellation during
copying a single 3 MiB record.

The required importable-shell RED was captured after initial implementation;
it should not be described as a strict test-first sequence. No build code was
added before the prerequisite Tasks 1–6 reports/contracts were read.

## Independent fixtures and Calibre

`pnpm build:fixture-azw3` runs
`node --import tsx scripts/build-fixture-azw3.mts` and creates minimal,
multilingual-notes, images-css, and synthetic 300-chapter fixtures in a unique
temporary directory. Image fixtures contain valid PNG and JPEG data. Calibre
9.15.0 independently inspected each output and converted each AZW3 back to
EPUB. The round-trip audits found no missing local links, fragments, inline
images or CSS image targets; the repeated endnote references resolved to the
same note target and the note backlink resolved to the first reference.

One measured run:

| Fixture | AZW3 bytes | Build time |
| --- | ---: | ---: |
| Minimal | 2,977 | 5 ms |
| Multilingual notes | 3,817 | 3 ms |
| Images and CSS | 6,244 | 3 ms |
| 300 chapters, 9,000 paragraphs in chapter 1 | 300,641 | 159 ms |

The 300-chapter file contains 1,039,134 uncompressed text bytes and 254
PalmDOC records. Calibre reconstructed it as 304 HTML/XHTML documents. The
text is one HTML flow `0..1,038,547`, then one CSS flow; the audit resolved all
606 local links and 300 inline-image references. Four-fixture process peak RSS
was 192,208 KiB, including Node startup and fixture construction. These are
synthetic local measurements, not editor performance promises.

Commands used for independent validation:

```sh
node --import tsx scripts/build-fixture-azw3.mts
calibre-debug --inspect-mobi <fixture>.azw3
ebook-convert <fixture>.azw3 <roundtrip>.epub
```

The fixtures exercise the supported one-HTML-flow-plus-fragments profile. No
alternate multiple-HTML-FDST-flow implementation/comparison was measured, and
the user supplied no real-book text. Thus the requested real-book comparison
remains open; no real-book evidence is claimed. One huge XML text node also
remains a synchronous serialization unit.

## Device and thumbnail gates

`thumbnailIndex` remains `null`; no thumbnail is generated. The provisional
180×240 thumbnail policy was not measured against a physical Kindle. Both
Paperwhites were unavailable, so cover-only versus thumbnail visibility,
firmware/transfer details and popup behavior remain Task 10 manual gates. The
Calibre reconstruction verifies links and resources, not Kindle popup UI.
There is no release-readiness claim.

## Changed files

- `src/services/azw3/build.ts`
- `src/services/azw3/skeleton.ts`
- `src/services/azw3/indexes.ts`
- `src/services/azw3/palmdb.ts`
- `src/services/azw3/resources.ts`
- `src/services/azw3/__tests__/build.test.ts`
- `src/services/azw3/__tests__/fixtures.ts`
- `src/services/azw3/__tests__/assets/fixture.jpg`
- `src/services/azw3/__tests__/palmdb.test.ts`
- `src/services/azw3/__tests__/resources.test.ts`
- `src/services/export/types.ts`
- `scripts/build-fixture-azw3.mts`
- `package.json`
- `docs/formats/azw3.md`
- `docs/formats/azw3-research.md`

## Final verification

`pnpm check` passed: Vue typecheck, Oxlint, Oxfmt check, and 97 Vitest files /
565 tests. `git diff --check` passed. Vitest emitted its existing happy-dom
environment performance notice; no test failed.
