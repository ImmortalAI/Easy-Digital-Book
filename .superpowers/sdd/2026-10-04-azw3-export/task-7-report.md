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
individual operations. Index encoding yields while emitting family rows and
iterating navigation entries, but it synchronously projects all SKEL/FRAG
rows, collects NCX section rows, and assembles all TBS trailers. These
whole-collection preparation loops are additional cancellation-latency
boundaries for unusually large indexes.

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

| Fixture                                     | AZW3 bytes | Build time |
| ------------------------------------------- | ---------: | ---------: |
| Minimal                                     |      2,977 |       5 ms |
| Multilingual notes                          |      3,817 |       4 ms |
| Images and CSS                              |      6,321 |       2 ms |
| 300 chapters, 9,000 paragraphs in chapter 1 |    300,641 |     169 ms |

The current 300-chapter file contains 1,039,134 uncompressed text bytes and
254 PalmDOC records. Calibre reconstructed it as 303 HTML/XHTML documents.
The text is one HTML flow `0..1,038,547`, then one CSS flow. The current audit
reports 606 links and zero images in this image-free long fixture. Across all
four fixtures it found 628 resolved links, three resolved inline images and
one resolved CSS image URL. Four-fixture process peak RSS was 223,104 KiB,
including Node startup and fixture construction. These are synthetic local
measurements, not editor performance promises.

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
- `scripts/verify-azw3.py`
- `package.json`
- `docs/formats/azw3.md`
- `docs/formats/azw3-research.md`

## Final verification

`pnpm check` passed: Vue typecheck, Oxlint, Oxfmt check, and 97 Vitest files /
565 tests. `git diff --check` passed. Vitest emitted its existing happy-dom
environment performance notice; no test failed.

## Task 7 review fixes — 2026-10-05

Review found that the final caller-controlled progress callback could abort
after the last signal check, yet still receive resolved bytes. Added the
post-callback signal check. The regression uses the two final-total `azw3`
progress events: it aborts from the second (after PalmDB assembly) and asserts
the promise rejects with `export.cancelled`. Before the fix, the test failed
because the promise resolved a `Uint8Array`; after the fix it passes.

The image fixture now has a distinct `images/css-only.png` resource referenced
only by custom CSS. Its fourth resource record is ordinal 0003; the converted
EPUB stylesheet points to `images/00003.png`, which exists. This separates
CSS-only evidence from the three inline image references. The earlier report
incorrectly associated 300 image references with the image-free long fixture;
the actual audited count is zero for that fixture.

Added `scripts/verify-azw3.py`, a repeatable Calibre inspection, conversion,
and EPUB resource/link audit. It saves Calibre logs and decompilation output
under `calibre-audit/` and writes `audit.json`. Exact raw evidence from this
run:

```text
Fixture directory: /private/var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU
Audit JSON:        /private/var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU/calibre-audit/audit.json
Image inspection: /private/var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU/calibre-audit/images-css/inspect/decompiled_images-css/header.txt
Image EPUB:       /private/var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU/calibre-audit/images-css/images-css.epub
Image CSS target: images/00003.png (present in that EPUB)
minimal:          1 HTML file, 2 local links, 0 inline images, 0 CSS image URLs, 0 unresolved
multilingual:     5 HTML files, 17 local links, 0 inline images, 0 CSS image URLs, 0 unresolved
images-css:       2 HTML files, 3 local links, 3 inline images, 1 CSS image URL, 0 unresolved
long:             303 HTML files, 606 local links, 0 inline images, 0 CSS image URLs, 0 unresolved
totals:           628 local links, 3 inline image references, 1 CSS image URL; all resolve
```

The current rerun measured 2,977/5ms minimal, 3,817/4ms multilingual,
6,321/2ms images/CSS and 300,641/169ms long; process peak RSS was 223,104
KiB. Those are one synthetic run, including Node startup and fixture
construction in the process RSS. Calibre's long-file header reports 267
records, 1,039,134 text bytes, 254 PalmDOC records and 2 FDST flows. Its
decompiled FDST is saved at
`/private/var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU/calibre-audit/300-chapter-long/inspect/decompiled_300-chapter-long/fdst.record`.

Fix verification:

```text
pnpm vitest run src/services/azw3/__tests__/build.test.ts src/services/azw3/__tests__/resources.test.ts
2 files / 13 tests passed
python3 scripts/verify-azw3.py /var/folders/c3/d8gygt8s1f11_h7vnw6y0ns80000gn/T/edb-azw3-fixtures-uXrVAU
4 fixtures inspected/converted; all 628 local links, 3 inline images, and 1 CSS image URL resolved
pnpm exec vue-tsc --noEmit
pnpm lint
pnpm format:check
All passed.
```
