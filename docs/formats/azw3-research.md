# KF8 research log — 2026-10-04

Decision: implement the supported profile in [azw3.md](azw3.md) independently.
Keep Calibre test-only; no new production dependency is justified by the
examined APIs. Preserve project GPL-3.0-or-later (`LICENSE`, package.json,
Cargo.toml inspected). No upstream source was copied into production modules.

## Sources and versions

Calibre's public source is pinned to
[v9.15.0](https://github.com/kovidgoyal/calibre/tree/v9.15.0), annotated tag
`4392641ed105d0913f8d63db83bd4fae42e0105d`, target commit
`6a97bf55cbbab094d5f0e28ff812c6d4b158535d`. Exact downloaded files, all under `src/calibre/ebooks/`:

| Files                                    | Format facts checked                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `conversion/plugins/mobi_output.py`      | AZW3 output and test CLI conversion options                      |
| `mobi/writer8/main.py`                   | Physical flow concatenation, text trailers, FDST, records        |
| `mobi/writer8/skeleton.py`               | SKEL/FRAG coordinate systems and fixed-width base32 links        |
| `mobi/writer8/index.py`                  | 192-byte INDX, TAGX, rollover, IDXT, NCX tags                    |
| `mobi/writer8/{header,mobi,exth}.py`     | MOBI offsets/264-byte length, EXTH, end records                  |
| `mobi/writer8/{tbs,toc,cleanup}.py`      | Flat/hierarchical TBS facts, inline TOC, markup preparation      |
| `mobi/writer2/{indexer,resources}.py`    | Shared resource ordinals, cover/thumbnail metadata               |
| `mobi/{utils,langcodes}.py`              | VWI, overlap removal, CNCX addressing and locale                 |
| `mobi/debug/{headers,index,__init__}.py` | Independent inspection artifact semantics                        |
| `compression/palmdoc.py`                 | PalmDOC token/decode contracts; native compressor is not adopted |

Downloaded with
`curl -L --fail -s https://raw.githubusercontent.com/kovidgoyal/calibre/v9.15.0/src/calibre/ebooks/<file> -o /tmp/edb-kf8-research/<file>`.
Installed modules are frozen `.pyc`; `inspect.getsource` failed, so source facts
came from that pinned public tag. The writer implementer should use our own
format document, closing these source files before implementation.

Public descriptions cross-checked:
[MobileRead MOBI](https://wiki.mobileread.com/wiki/MOBI),
[PalmDOC](https://wiki.mobileread.com/wiki/PalmDOC),
[PDB](https://wiki.mobileread.com/wiki/PDB),
[KindleUnpack reconstruction](https://github.com/kevinhendricks/KindleUnpack/blob/master/lib/mobi_k8proc.py),
[Microsoft language identifiers](https://learn.microsoft.com/en-us/windows/win32/intl/language-identifier-constants-and-strings).
These pages are supporting descriptions; the pinned source plus actual
inspection settles ambiguities. Unknown FLIS/FCIS constants are labelled
opaque, not given invented semantics.

## Capability and reuse decisions

Registry search used `https://registry.npmjs.org/-/v1/search?text=azw3&size=30`,
`text=palmdoc`, and `text=mobi%20writer`. Search results are candidates, not proof
of export capability. Package tarballs for `azw3` and `palm-pdb` were extracted
under /tmp and their actual published APIs examined. No packages were installed
into this project during research.

| Candidate / version                                                                                        | Runtime, license, capabilities                                                                                             | Decision and concrete gaps                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm `azw3` 0.0.1-alpha (2023-11-06)                                                                        | ISC; tarball contains **only package.json**, main `index.js` missing                                                       | Reject: no callable reader or writer, despite package name                                                                                                                                                                                                                                                                                                                                                          |
| [foliate-js](https://github.com/johnfactotum/foliate-js) commit `78914aef4466eb960965702401634c2cb348e9b1` | Browser JS, MIT; exported MOBI reader handles PalmDOC/HUFF/KF8 reconstruction; PalmDOC decompressor internal               | Reject as writer/codec dependency: no compression/serialization API; reader needs browser DOM for XHTML handling; optional independent reader later                                                                                                                                                                                                                                                                 |
| [behringer24/azw3](https://github.com/behringer24/azw3) commit `0d9f5363c6e93c98a344e2d9fce20c7dcd2222b2`  | MIT, Go1.23, actual `Book.Write/Serialize` KF8 writer, CSS/images/cover, patched footnotes; depends on Go mobi and x/text  | Reject for this architecture: requires Go/WASM/native integration, not pure JS service; no existing packaging/cancellation adapter; constructor uses random identity unless overridden                                                                                                                                                                                                                              |
| [leotaku/mobi](https://github.com/leotaku/mobi) commit `bf3c8d0354fe863c34742db0b8a2e498ad33aeb3`          | MIT, Go; KF8 record/index writer                                                                                           | Reject: same runtime mismatch; not a TS dependency                                                                                                                                                                                                                                                                                                                                                                  |
| [766b/mobi](https://github.com/766b/mobi)                                                                  | BSD-2-Clause, Go legacy writer/reader; README explicitly ignores img tags                                                  | Reject: runtime and required image/CSS/KF8 coverage missing                                                                                                                                                                                                                                                                                                                                                         |
| [palm-pdb](https://github.com/jichu4n/palm-pdb) npm1.0.2 (2025-03-01)                                      | Apache-2.0, TypeScript published as CommonJS; real `PalmDoc.compress(Buffer): Buffer`, decompression and generic PDB write | Reject as runtime dependency: imports SmartBuffer, serio, root barrel and Node Buffer; root exports Node CLI/file dependencies. Requires Buffer/polyfills/new browser adaptation and brings six dependencies. No MOBI/KF8 indexes/links/metadata. Whole-document serializer also counts JS string length, unsuitable for UTF8 contract. Relevant codec exists, but does not fit current browser-native architecture |
| npm `mobi`0.0.1 (2012)                                                                                     | Undeclared license; depends on `pypacker`                                                                                  | Reject: no demonstrated browser KF8 write API, missing license, external Python integration                                                                                                                                                                                                                                                                                                                         |
| [@mdgate/mobi](https://www.npmjs.com/package/@mdgate/mobi)0.6.25 (2026-08-27)                              | MIT, JS/TS reader → Markdown; PalmDOC/HUFF read; explicitly lacks skeleton/FRAG reconstruction and image/NCX extraction    | Reject: no writer/compressor; required fixture structure absent                                                                                                                                                                                                                                                                                                                                                     |
| [lz77](https://github.com/whoughton/lz77) npm2.1.0                                                         | BSD, TS/ESM browser; string compressor uses configurable reference prefix/radix96 format                                   | Reject: LZ77 family name does not imply **PalmDOC byte tokens**; incompatible serialized output                                                                                                                                                                                                                                                                                                                     |
| [binary-parser](https://github.com/keichi/binary-parser)2.3.0                                              | MIT, JS binary **parser**, no writer                                                                                       | Reject for writer: DataView already supplies BE integer serialization; no KF8 format capability                                                                                                                                                                                                                                                                                                                     |
| Calibre9.15.0                                                                                              | GPLv3, Python/native CLI; full KF8 reader/writer                                                                           | Adopt **test-only**, never invoke at export/runtime                                                                                                                                                                                                                                                                                                                                                                 |
| Installed fast-xml-parser5.11.1                                                                            | MIT; XMLParser, XMLBuilder, XMLValidator available in pure service runtime                                                 | Adopt ordered parsing/building with `preserveOrder:true, ignoreAttributes:false, trimValues:false`; namespaces and element order survived executable probe; measure bytes after serialization                                                                                                                                                                                                                       |
| Existing NovLang + chapter/notes/footnotes                                                                 | Already integrated; NovLang parse/render plus globally numbered endnotes                                                   | Reuse shared preparation; prerequisite verified16 tests                                                                                                                                                                                                                                                                                                                                                             |
| Existing ImageProcessor/planImage/dimensions + createByteLru                                               | Injected processor, presets/grayscale, bytes cache                                                                         | Reuse processing/caching; inspect actual output MIME for resource mapping; no image codec dependency                                                                                                                                                                                                                                                                                                                |
| Installed JSZip + epub/zip.ts                                                                              | EPUB ZIP write/read                                                                                                        | Retain for EPUB only; not PalmDOC/MOBI packaging                                                                                                                                                                                                                                                                                                                                                                    |
| Uint8Array/DataView/TextEncoder/TextDecoder                                                                | Native deterministic byte/UTF8 APIs                                                                                        | Adopt; custom code only for format-specific PalmDOC/index/container work                                                                                                                                                                                                                                                                                                                                            |
| SettingsRepository/PlatformServices                                                                        | Existing settings/dialog/atomic-write/reveal interfaces                                                                    | Reuse; no new OS runtime tools/capabilities                                                                                                                                                                                                                                                                                                                                                                         |
| Installed shadcn-vue Dialog/Select/Field/Label/Checkbox/Progress/Alert/Spinner/Button                      | Already available application UI primitives                                                                                | Reuse existing imports; no modal/select implementation                                                                                                                                                                                                                                                                                                                                                              |
| Python stdlib zipfile/ElementTree/subprocess                                                               | Test runtime, structural assertions                                                                                        | Reuse independent EPUB/XML extraction; no second ZIP/XML parser                                                                                                                                                                                                                                                                                                                                                     |

No evaluated library satisfies pure-browser KF8 writing plus deterministic
UUID/clock, existing image processing, cancellable packaging, full CSS/NCX/
footnote reconstruction fixtures. Therefore no plan/interface replacement is
needed. Codec/container work remains small independent format-specific code;
shared preparation, XML and image logic must not be duplicated. This is a
bounded candidate search, not a claim that no library can ever exist.

## Executable evidence

Prerequisite command (2026-10-04):

```sh
pnpm vitest run src/services/epub/__tests__/footnotes.test.ts src/services/epub/__tests__/notes.test.ts src/services/epub/__tests__/chapter.test.ts
```

Result: **3 files /16 tests PASS**, Vitest5.0.2. Endnotes are already landed.

Both binaries are `/Applications/calibre.app/Contents/MacOS/<name>`.
`ebook-convert --version` reports9.15.0; `calibre-debug --help` explicitly lists
`-m, --inspect-mobi`. A small hand-authored two-document EPUB was built with
Python zipfile at `/tmp/edb-kf8-research/reference.epub`: Russian title/author,
CJK and emoji text, reciprocal noteref/endnote links, CSS and two NCX entries.
The exact scratch fixture generator is included in the Task1 report.

Working commands:

```sh
/Applications/calibre.app/Contents/MacOS/ebook-convert /tmp/edb-kf8-research/reference.epub /tmp/edb-kf8-research/reference.azw3 --no-inline-toc --share-not-sync
# Run with cwd /tmp/edb-kf8-research to keep inspection artifacts there:
/Applications/calibre.app/Contents/MacOS/calibre-debug --inspect-mobi /tmp/edb-kf8-research/reference.azw3
/Applications/calibre.app/Contents/MacOS/ebook-convert /tmp/edb-kf8-research/reference.azw3 /tmp/edb-kf8-research/roundtrip.epub
```

All exited0. Inspection says `Debug data saved to: decompiled_reference`.
That path is **relative to cwd**, not source-file parent. Initial probe used
repo cwd, so artifacts were immediately moved to /tmp; no reference binary or
decompiled artifact is committed. For KF8-only output its root directly
contains `header.txt`, `chunks.record`, `skel.record`, `ncx.record`, `fdst.record`,
`tbs.txt`, `text_records/`, `flows/`, `files/`, `binary/` (no required `mobi8/`
subdirectory). Binary filenames use debug ordinals; parse header's record map
rather than assuming filenames exactly equal PalmDB record numbers.

Measured:14 PalmDB records; MOBI8/header264; one PalmDOC text record;
raw text1753 bytes; FRAG meta2, SKEL meta5, NCX meta7; FDST record10/count3;
FLIS11/36 bytes; FCIS12/52 bytes; EOF13/4 bytes; DATP NULL; extra flags3.
Two FRAG rows and SKEL rows reconstructed two valid documents. FDST boundaries
`0..1213`, `1213..1270`, `1270..1753`; TBS `868802` represents two entries.
First SKEL start0/length411 with FRAG insertion395/physical-start411/length190;
second SKEL start601/length416 with FRAG insertion1001/physical-start1017/length196.
These measurements distinguish physical from reconstructed coordinates.

ElementTree on the round-trip EPUB confirmed Russian title/author/language,
two TOC labels, two XHTML documents and reciprocal note/ref anchors. It also
showed that Calibre strips the `epub:` prefix to `type`; our XML probe preserves
it, and our writer must preserve it. The conversion's `--share-not-sync` option
suppresses EBOK/ASIN; **our writer always writes EBOK and the existing UUID**.
Calibre assigned random IDs/timestamps during conversion, so these reference
files are evidence for layout only, never deterministic golden outputs.

Important discrepancy: Calibre writes Unix timestamp seconds into PalmDB date
fields, but its inspector interprets them against Palm epoch (reported1960 for
this2026 file). Our documented profile uses true Palm epoch derived from
book.created. Do not copy reference's random identity/date behavior.

## Gate corrections and remaining evidence

The actionable contract is the format description, not upstream code.

- Header264 bytes, real INDX-family SKEL/FRAG/NCX, FRAG-relative geometry,
  byte-based/fixed-width links and CNCX65536 logical stride are established.
- PalmDOC4096 payload plus uncompressed overlap plus TBS; flat depth0 TOC is
  supported. Extremely dense >255 entries per text record needs multiple TBS
  sequences or explicit validation failure; no u8 count truncation.
- DATP is absent with NULL pointer. No HUFF/CDIC or joint KF8 writer is needed.
- Images/cover/thumbnail use distinct one-/zero-based conventions. EXTH129 is
  optional and omitted. Physical thumbnail display remains unknown.
- Full binary dumps from the independent writer and large-book/thumbnail
  measurements are Tasks3–7. The reference conversion is not the future writer.
- Popup, library cover and rendering on **both** Paperwhites remain Task10
  manual release gates. Device unavailability does not block implementation.
