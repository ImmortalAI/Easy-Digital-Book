# Independent KF8 writer profile

Research gate: 2026-10-04, Calibre **9.15.0**. This describes the supported,
unencrypted, reflowable KF8-only profile, not all variants of MOBI. Facts were
checked against pinned reference implementations and an independently authored
multilingual EPUB converted/inspected by Calibre. See [research log](azw3-research.md).
Production implementation must use this description, without translating Calibre.

All integers below are unsigned **big endian**. Offsets and lengths are **bytes**;
record numbers are zero based. `NULL` means `0xffffffff`, never record zero.
Offsets in the MOBI table are relative to the start of **PalmDB record 0**,
including its 16-byte PalmDOC prefix. No integers may wrap silently.

## PalmDB container and order

| Offset         | Width     | Field / chosen value                                                                                                  |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| 0              | 32        | Database name: at most 31 printable ASCII bytes, then zero padding; sanitize title deterministically                  |
| 32             | 2         | Attributes = 0                                                                                                        |
| 34             | 2         | Version = 0                                                                                                           |
| 36, 40         | 4 each    | Creation/modification timestamp, seconds since Palm epoch 1904-01-01; derive both from book.created, not export clock |
| 44, 48, 52, 56 | 4 each    | Backup time, modification number, app-info offset, sort-info offset = 0                                               |
| 60             | 4         | ASCII `BOOK`                                                                                                          |
| 64             | 4         | ASCII `MOBI`                                                                                                          |
| 68             | 4         | Unique-ID seed = `2 * recordCount - 1`                                                                                |
| 72             | 4         | Next record-list ID = 0                                                                                               |
| 76             | 2         | Total record count, 1..65535                                                                                          |
| 78             | 8 × count | Each descriptor: absolute file offset u32; flags u8 = 0; UID u24 = `2 * ordinal`                                      |
| after list     | 2         | Zero gap; first record begins at `80 + 8 * recordCount`                                                               |

Record lengths come from adjacent offsets (last ends at EOF). Reject total file
size beyond u32, text count beyond u16 and Palm epoch dates outside u32.
Traditional Palm records have a 64 KiB limit, but modern MOBI images may exceed
it: do **not** impose the INDX u16 address limit on image records. INDX records
must remain strictly below 65536 bytes; use rollover. Text chunks have at most
4096 uncompressed payload bytes; compressed records plus trailers can be larger.

Order: record 0; N text records; FRAG meta/data/CNCX records; SKEL meta/data;
optional GUIDE meta/data/CNCX; NCX meta/data/CNCX; contiguous resources;
FDST; FLIS; FCIS; EOF. No joint-format BOUNDARY, HUFF/CDIC, fonts, DRM or SRCS.
Alignment **inside** INDX records is to four bytes. An inter-record padding
record is unnecessary: record-list offsets permit unaligned records.

Example: two descriptors for records at 96 and 112 are
`00000060 00 000000` and `00000070 00 000002`; the gap is `0000`.
Task 3 supplies the complete PalmDB fixture dump. See `palmdbDescriptors` vector.

Task 3 writer fixture: name `Fixture`, created `1904-01-01T00:00:42Z`,
two records (16 zero bytes, then ASCII `abc`). Total length 115 bytes; record
offsets 96 and 112. This tests the container only: the synthetic zero record
is not a complete MOBI record 0. The test expectation is hand-calculated and
the following dump was checked against our writer and independent PalmDB reader:

```text
0000 46 69 78 74 75 72 65 00 00 00 00 00 00 00 00 00
0010 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0020 00 00 00 00 00 00 00 2a 00 00 00 2a 00 00 00 00
0030 00 00 00 00 00 00 00 00 00 00 00 00 42 4f 4f 4b
0040 4d 4f 42 49 00 00 00 03 00 00 00 00 00 02 00 00
0050 00 60 00 00 00 00 00 00 00 70 00 00 00 02 00 00
0060 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0070 61 62 63
```

Our deterministic name policy replaces each non-printable/non-ASCII UTF-16
code unit with `_`, truncates to 31 ASCII bytes, and leaves zero padding.
Timestamp fractions are rounded down to whole seconds; out-of-range dates
are rejected. Empty records are allowed and have equal adjacent offsets.

## PalmDOC and MOBI v8 record 0

PalmDOC offsets 0:u16 compression=2; 2:u16 zero; 4:u32 total uncompressed text
length including all flows; 8:u16 N text records; 10:u16 size=4096;
12:u16 encryption=0; 14:u16 zero. For 42 bytes in one record:
`00020000 0000002a 00011000 00000000` (`palmDocHeader`).

The MOBI portion is **264 bytes**, beginning at 16 and ending at 280.

| Record-0 offset    | Width    | Meaning / chosen value                                               |
| ------------------ | -------- | -------------------------------------------------------------------- |
| 16, 20             | 4 each   | `MOBI`; header length 264 (`0x108`)                                  |
| 24, 28             | 4 each   | Book type 2; encoding 65001 (`0xfde9`, UTF-8)                        |
| 32, 36             | 4 each   | Stable UID; version 8                                                |
| 40, 44, 48..76     | 4 each   | Dictionary/secondary/extra indexes: NULL (ten words total)           |
| 80                 | 4        | First nontext record = N+1                                           |
| 84, 88             | 4 each   | Full title offset from record 0; UTF-8 title byte count              |
| 92                 | 4        | MOBI language code, see metadata                                     |
| 96, 100            | 4 each   | Dictionary input/output language = 0                                 |
| 104, 108           | 4 each   | Minimum version 8; first resource record, or NULL                    |
| 112, 116, 120, 124 | 4 each   | Huffman record/count/table offset/table length = 0                   |
| 128                | 4        | EXTH flags = `0x50` (EXTH present; reference reflowable profile)     |
| 132                | 32       | Zero reserved bytes                                                  |
| 164, 168           | 4 each   | Unknown index NULL; DRM offset NULL                                  |
| 172, 176, 180      | 4 each   | DRM count/size/flags = 0                                             |
| 184                | 8        | Zero reserved bytes                                                  |
| 192, 196           | 4 each   | FDST record number; **number of flows**, not number of FDST records  |
| 200, 204           | 4 each   | FCIS record number; count 1                                          |
| 208, 212           | 4 each   | FLIS record number; count 1                                          |
| 216                | 8        | Zero reserved bytes                                                  |
| 224, 228           | 4 each   | SRCS index NULL; count 0                                             |
| 232, 236           | 4 each   | Reserved NULL                                                        |
| 240                | 4        | Extra-data flags = 3 (overlap + TBS); 1 only when no NCX/TBS         |
| 244, 248, 252      | 4 each   | NCX, FRAG, SKEL **meta record** numbers; absent NCX NULL             |
| 256, 260           | 4 each   | DATP index NULL; optional GUIDE meta index or NULL                   |
| 264, 268, 272, 276 | 4 each   | Reserved: NULL, 0, NULL, 0                                           |
| 280                | variable | EXTH, alignment padding, UTF-8 title; optional trailing zero padding |

8192 bytes of record-0 padding are used by Calibre for third-party metadata
editing, not part of the MOBI header; our writer may omit them. Do not copy a
random Calibre UID or OS-dependent producer metadata. Example prefix at offset
16: `4d4f4249 00000108 00000002 0000fde9`; complete record-0 dump is Task 6/7.

## EXTH and stable metadata

EXTH at 280: `EXTH` (4), unpadded total length u32 (including 12-byte header),
entry count u32, followed by entries `(type:u32, entryLength:u32, payload)`.
Entry length includes the 8-byte entry prefix. UTF-8 string entries have **no
NUL**. Integer payloads are u32. Pad the EXTH block to a multiple of four and
point the title field at the actual title bytes. Calibre sometimes adds four
zero bytes to an already aligned block; that is not required by our profile.

| EXTH type | Payload / policy                                                                            |
| --------- | ------------------------------------------------------------------------------------------- |
| 100       | One UTF-8 author entry per author, preserving order                                         |
| 103, 108  | Optional description; ordered translators as contributor strings                            |
| 106       | ISO UTC build timestamp from injected `now` (only clock-dependent bytes)                    |
| 112       | Original book identifier, e.g. `urn:uuid:…`                                                 |
| 113       | ASIN field: normalized lowercase UUID **without** `urn:uuid:`; same identity across exports |
| 116       | Optional starting reconstructed HTML byte offset; omit if no start target                   |
| 125       | Number of resource records                                                                  |
| 201, 202  | Zero-based cover/thumbnail offsets from first resource record; omit if absent               |
| 203       | Integer 0 with a real cover (not fake cover)                                                |
| 501       | ASCII `EBOK`                                                                                |
| 503       | Full UTF-8 exported title (respect version-in-title)                                        |
| 524       | Canonical full BCP47 language tag (do not discard region/script)                            |

The supported Book identifier is canonical UUID, optionally prefixed with
`urn:uuid:`. Validate it; do not generate random fallback identities at export.
A malformed identifier must produce an explicit export validation error.
Stable MOBI UID: the first eight normalized UUID hexadecimal digits interpreted
as u32 (`12345678-…` → `0x12345678`). Source/ASIN remain the full identity; this
32-bit value is not treated as globally unique. PalmDB dates use book.created,
so changing `now` affects only EXTH 106, provided its UTF-8 length is fixed.

MOBI locale is a Windows-language-style numeric field: base-language code in
low byte, region/dialect multiplier in next byte. Supported base mappings:
`en:09 ru:19 zh:04 ja:11 ko:12 de:07 fr:0c es:0a it:10 pt:16 uk:22
pl:15 ar:01 he:0d hi:39`. Exact tags: `en-US:0409 en-GB:0809 en-AU:0c09
en-CA:1009 zh-CN:0804 zh-SG:1004 zh-TW:0404 zh-HK:0c04 de-DE:0407
de-CH:0807 de-AT:0c07 fr-FR:040c fr-CA:0c0c es-ES:040a es-MX:080a
it-IT:0410 pt-BR:0416 pt-PT:0816 ru-RU:0419 ja-JP:0411 ko-KR:0412`.
Resolve Chinese script-only Hans→0804, Hant→0404; a recognized explicit region
wins. For unsupported regions/scripts retain the base code; unsupported base
language (including `und`) → 0. EXTH 524 still preserves the complete tag.
These explicit mapping choices should be unit tested; extend without guesses.

Example `EXTH` containing `EBOK` only:
`45585448 00000018 00000001 000001f5 0000000c 45424f4b`.
An empty EXTH is `45585448 0000000c 00000000`.
A Russian author `Я` entry: `00000064 0000000a d0af`.
Full metadata and optional-cover examples are Task 6.

## Compression, 4096-byte boundaries and trailers

PalmDOC tokens: `00` and `09..7f` are literal bytes; `01..08` copy that many
following bytes literally; `c0..ff` emit space then `(token XOR 80)`;
`80..bf` begin a two-byte backreference. For BE token word W:
`distance=(W >> 3) & 0x7ff`, `length=(W & 7)+3` (3..10), distance 1..2047.
Copy sequentially so overlapping matches work. History resets per record.
An independent deterministic compressor may choose a different legal token
sequence from Calibre: token-vector tests and independent decompression prove
correctness, not equality with Calibre's match-selection heuristic.

Examples: `abcabc` → `6162638018` (distance 3, length 3);
`aaaa` → `618008` (distance 1, length 3); space+A → `c1`;
UTF-8 `Я` (`d0af`) → `02d0af`. Empty payload → empty compressed payload.

Split the **byte stream** into exact 4096-byte payload chunks (last shorter).
If the final character is incomplete, append the 1..3 continuation bytes from
the next chunk _uncompressed_, then a byte containing their count (low two
bits). Always append a count byte, even when zero. The following payload still
begins with those bytes: overlap bytes must not be added when reconstructing
the complete raw stream. Remove trailers **before** decompression.

For `A×4095 + 😀 + Z`, first payload ends in `f0`, overlap trailer is
`9f988003`; second payload is `9f98805a`, overlap trailer `00`.
Similarly `A×4095 + Я + Z` → `af01`, and `A×4095 + 中 + Z` → `b8ad02`.
The payloads alone concatenate to valid UTF-8; individual payloads need not.

Task 3's `splitTextRecords` returns `{ bytes, overlap }`: `bytes` is only the
uncompressed payload; `overlap` already includes the mandatory count byte.
Thus a complete non-TBS text record for `abcabc` is `6162638018 00`, and
for `Я` is `02d0af 00`. For empty text the splitter returns no text records;
compressing an empty payload returns no bytes. The caller adds TBS after
overlap and sets the corresponding extra-data flags (Tasks 5/7).

Our compressor chooses the longest available match (3..10 bytes), preferring
the closest distance on ties; it falls back to a space pair, ordinary literal,
or at most eight reserved literal bytes. It uses no history from other records.
For eleven `a` bytes its output is `61 800f` (distance 1, length 10).
A maximum-distance match in `abc + _×2044 + abc` ends with `bff8`
(distance 2047, length 3); increasing the gap by one leaves final `616263`
literal bytes. Binary escape overhead can expand a 4096-byte payload beyond
4096 compressed bytes; this does not violate the uncompressed record limit.

Flags bit0 = overlap; bit1 = one TBS entry; remaining trailer bits unset.
Physical text record = `compressedPayload + overlapBytes + countByte +
TbsPayload + backwardVwi(totalTbsTrailerLength)`.
Remove TBS from the end first, then overlap. VWI length counts its own encoded
bytes; iterate size until stable (127-byte payload requires a two-byte size,
so total129 → `8101`). Empty TBS is `81`; payload `8288` gives `828883`.

Forward VWI is BE 7-bit groups with high bit on the **last** physical byte;
backward VWI sets it on the **first** physical byte. Read forward from beginning,
backward from end until marked byte. Values: 0→`80`;127→`ff`;128→`0180`
(forward),`8100` (backward);0x11111→`042291` / `842211`.
Calibre utils' prose reverses “first/last” in one comment; actual bytes and
MobileRead descriptions agree with this definition.

### Flat NCX TBS profile

Our TOC consists of chapter/title-page/endnote entries at depth0 in reading
order (no hierarchical or non-linear TOC). For text record range [R,R+L),
collect entries whose [start,start+length) intersects it. Entries must form a
contiguous ordinal range. Encode **one sequence** for that range:
forwardVwi((firstOrdinal << 3) | flags). First-sequence flags: bit1 (=2) gives
TBS type, then forwardVwi(8); bit2 (=4) when count>1, then count **u8**;
bit0 (=1) when the final overlapping entry starts before R and ends after
R+L (spans), then forwardVwi(0). Extras order: type, count, span.
A record with no entries has an empty TBS payload. Example entry0 only→`8288`;
entry0 plus entry1→`868802`; spanning entry2 only→`938880`.
If >255 entries touch a record, multiple sequences require TBS type5 in the
**first** sequence (instead of type8). Later sequences use four flag bits and
positive ordinal deltas from the previous group's last ordinal, with no bit3
and no separate type field. This overflow path requires
an independent inspection fixture; do not truncate counts. Alternatively fail
with an explicit supported-profile limit before packaging until implemented.

TBS affects chapter-to-chapter Kindle navigation, so omitting it silently is
not an acceptable substitute for implementing flat TBS. `tbsFlat*` vectors;
whole compressed-record dumps are Tasks 3/7.

## Skeleton, fragment, aid and address coordinates

Flow0 is the combined physical text layout. For each reading-order XHTML file:
`serializedSkeleton + fragment0 + fragment1 + …`. Following chapters start after
both skeleton and fragments. Preserve XHTML/epub namespaces, `id`, `epub:type`,
and target addresses. Generate stable unique `aid` on body and addressable
nodes (body/block/inline anchors), avoiding user collisions; it is an ASCII
base32 token, **not** a chapter ID. Render all attributes before byte accounting.

Useful independent approach: retain head/body shell as skeleton, partition body
content into fragments at complete-node boundaries (target about 8192 bytes).
For huge text nodes, split only at UTF-8/XML token boundaries, retain parent
shells and include appropriate selectors. Never slice an entity, attribute or
opening tag. Long chapters can have many fragments in this **one HTML flow**;
CSS is separate flow(s), not a CSS PalmDB resource record.

SKEL row: key `SKEL`+10 decimal digits; tag1 contains fragment count **twice**;
tag6 contains `(start,length,start,length)` where start is absolute offset in
physical flow0 and length is skeleton byte count. Repetition is a reference
compatibility convention, not two different geometries.

FRAG row: key is its **reconstructed** global insertion offset, 10 decimal
digits; tag2 CNCX selector offset; tag3 reading-order file ordinal; tag4 **global
fragment ordinal**; tag6 `(start,length)`, where start is relative to this
file's fragment area, immediately after its physical skeleton. Thus physical
fragment address is `skel.start + skel.length + frag.start`, **not** FRAG's key.
Selector is e.g. `P-//*[@aid='0']` for content inside the body carrying aid0;
`S-//*[@aid='…']` identifies content following a skeleton node.

Reconstruct a file by reading its skeleton, then inserting its fragments in
sequence at `frag.insertionOffset - skel.start` in the progressively rebuilt
file. Offsets include earlier inserted fragments. This coordinate frame and
the physical frame have the same file starting points because file total sizes
are unchanged by rearranging bytes.

Hand example: skeleton `<html><body aid="0"></body></html>` is 34 bytes;
fragment `<p>A</p>` is 8. SKEL start0 length34 count1; FRAG start0 length8,
file0 sequence0 insertion20. Raw fragment address34; reconstructed address20.
The next file begins at42 in both frames. Literal `simpleSkeleton` / `simpleFragment`
vectors and index entries below derive from this example.

Links are `kindle:pos:fid:XXXX:off:YYYYYYYYYY`: uppercase radix32 alphabet
`0123456789ABCDEFGHIJKLMNOPQRSTUV`; fid is global fragment ordinal (four
digits), off is UTF-8 byte offset **within that fragment** (ten digits).
Measure the beginning of the target opening tag. Target in a skeleton resolves
to its next fragment, offset0, while NCX may retain the skeleton target's
reconstructed offset. Empty chapters need a fragment with a stable target
(e.g. empty paragraph), not an unresolvable body link. Patch equal-width
placeholders only, so link replacement cannot invalidate any recorded offsets.
(fid1,off33) → `kindle:pos:fid:0001:off:0000000011`.
Full reconstruction/link round-trip example is Task 4.

### Writer text layout and position examples (Task 4)

The writer's public `layoutText(documents, styles)` result already contains final
patched links. It first parses ordered XML with `fast-xml-parser`, assigns unique
base32 `aid` values, rewrites stylesheet references to their ordered CSS flows,
and reserves 34 ASCII bytes for each internal anchor href. It serializes before
measuring, then patches only those exact attribute-value byte slots. Entity
spelling may become canonical: numeric entities decode to their characters,
`&amp;` remains correctly escaped, and empty elements use explicit closing tags.
Mixed-content whitespace, namespace prefixes, attributes and original ids survive.
The doctype is unnecessary for this standalone serialized XHTML and the parser
omits it. Neither source documents nor the shared preparation objects are mutated.

`positions[path]` addresses the first fragment at offset zero; its reconstructed
offset is the first content insertion address. `positions[path#id]` records the
opening-tag address. An id in a retained shell resolves to the next fragment at
local zero, retaining its own reconstructed opening-tag address for navigation.
An anchor with no following fragment is rejected. Paths are normalized relative
to the referring document; percent-encoded path/fragment parts decode for lookup.
External URLs remain unchanged. Missing internal targets fail with
`export.azw3Link`, never a fabricated position. `rewriteLinks(documents, positions)`
is an immutable document-level convenience; layout itself patches final bytes.
Resource URI rewriting must precede layout because it changes serialized lengths.

Fragments are emitted in file/reading order with zero-based global ordinals.
The writer retains oversized section shells, grouping complete child nodes toward
8192 bytes. An oversized complete block or text node stays intact: this is a
preparation target, not a device limit, and does not license cutting XML tokens.
Consecutive removed child runs can all use `P-//*[@aid='parent']`; the insertion
addresses establish their order. `S-//*[@aid='child']` is used only after a child
retained in the skeleton, never after an earlier removed fragment's node.
The pinned reference measurement supplied to the implementation used one body
selector for five successive fragments (lengths 7908, 7887, 7896, 7896, 6143);
all 100 paragraph ids survived its round trip. The independent writer's own
1000-paragraph multilingual measurement produced 84 fragments, 2664–7992 bytes,
and 665930 total HTML bytes; a 9000-character CJK paragraph remained one 27026-byte
fragment (27095 total HTML bytes). These measure preparation behavior, not device
compatibility; long-flow and physical-device release gates remain open.

Independently counted writer fixture:
`<html><body><p id="n">Я</p></body></html>` serializes as skeleton
`<html aid="0"><body aid="1"></body></html>` (42 bytes), followed physically by
`<p id="n" aid="2">Я</p>` (24 bytes). SKEL file0: start0, length42, count1;
FRAG file0/ordinal0: start0, length24, insertion28, selector `P-//*[@aid='1']`.
The reconstructed file is 66 bytes. Its target has `(fid=0,off=0,reconstructed=28)`;
the physical target is byte42. Full physical hex (line boundary separates parts):

```text
3c68746d6c206169643d2230223e3c626f6479206169643d2231223e3c2f626f64793e3c2f68746d6c3e
3c702069643d226e22206169643d2232223ed0af3c2f703e
```

Add `<a href="#n">Go</a>` before the paragraph. The same shell remains 42 bytes;
the fragment becomes 83 bytes, inserted at28:

```xml
<a href="kindle:pos:fid:0000:off:000000001R" aid="2">Go</a><p id="n" aid="3">Я</p>
```

`1R` in radix32 is59. The paragraph target is therefore fragment-local59,
reconstructed87 (`28+59`), and physical101 (`42+59`). The complete file has125
bytes. Replacing the reserved href with this address changes no lengths; the
independent reader inserts the final fragment into the shell and decodes every
noteref/backlink address against those final bytes in the tests.

## INDX / TAGX / IDXT / CNCX and NCX

SKEL/FRAG/NCX labels name index roles: their record signatures are all `INDX`.
Each family is meta record, one or more data records, then its CNCX string
records (none for SKEL). All offsets in an INDX record are **record-relative**.

| INDX offset | Width  | Meta record / data record                            |
| ----------- | ------ | ---------------------------------------------------- |
| 0, 4        | 4 each | `INDX`, header length192 (`c0`)                      |
| 8, 12       | 4 each | 0,0 / 0,1 (header kind)                              |
| 16          | 4      | Meta index type2 / data0                             |
| 20          | 4      | Byte offset to IDXT                                  |
| 24          | 4      | Number of data records / entries in this data record |
| 28, 32      | 4 each | UTF8 encoding65001, NULL / NULL,NULL                 |
| 36          | 4      | Total entries / 0                                    |
| 40, 44, 48  | 4 each | ORDT/LIGT offsets/count = 0                          |
| 52          | 4      | CNCX record count / 0                                |
| 56          | 124    | Zero                                                 |
| 180         | 4      | TAGX offset192 / 0                                   |
| 184         | 8      | Zero                                                 |

Meta: header + TAGX padded4 + geometry entries padded4 + IDXT padded4.
Each geometry entry: last key of a corresponding data record, encoded
`keyLength:u8 + key:utf8 + count:u16`. Meta IDXT contains one u16 pointer per
geometry entry. Data: header + entries padded4 + IDXT padded4. Data IDXT is
`IDXT` plus entry pointers u16. Count determines how many pointers to read;
zero alignment is not a pointer. A worked empty data-record literal (192-byte
header + `IDXT`, no entries) is `emptyDataIndxRecord` in vectors.json. Enforce each key≤255 UTF-8 bytes, pointers≤65535,
record<65536, split before exceeding limits including eventual IDXT/padding.
A conservative 60 KiB data budget is sufficient. Empty optional NCX/guide is
omitted and set NULL; primitive empty data record still has an IDXT header.

TAGX: signature4, table length u32 including 12-byte prefix, control-byte-count
u32 (1 in our profile), then descriptors of four u8 values:
`tag, valuesPerOccurrence, controlMask, endControlByte`.
Descriptor `00 00 00 01` terminates a control byte. Entries are
`keyLength:u8 + key + controlByte + forwardVwi values in descriptor order`.
For single-bit masks set means one occurrence; for multi-bit masks, a value
below all-ones is the occurrence count. All-ones introduces a forwardVwi byte
length of the values section rather than a direct count. Our SKEL uses masks
03 and0c with count2, so control0a, never all-ones. Flat NCX control8f.

| Family           | Descriptor bytes (before terminator)                                      |
| ---------------- | ------------------------------------------------------------------------- |
| SKEL             | `01010300 06020c00` (count, geometry)                                     |
| FRAG             | `02010100 03010200 04010400 06020800` (selector, file, ordinal, geometry) |
| NCX              | `01010100 02010200 03010400 04010800 15011000 16012000 17014000 06028000` |
| GUIDE (optional) | `01010100 06020200` (label string offset, fid/off)                        |

NCX tag1 reconstructed target offset;2 section byte length until next entry
(or end of HTML flow0);3 label CNCX offset;4 depth=0;21/22/23 parent/first/last
child absent in flat profile;6 pair(fid,off). Keys are uppercase hex ordinals,
minimum two digits (`00`, `01`…). Sections must be sorted in reading order and
have nonnegative lengths. NCX is an index, **not an XML NCX document**.
GUIDE keys are textual guide roles (e.g. `text`, `toc`), sorted by role.

CNCX is not a signature: each string is `forwardVwi(utf8Length) + utf8Bytes`,
no NUL. Deduplicate equal strings in first-use order. Pack without splitting
an entry, roll over below64KiB (60KiB budget), pad each record4. String offset
is `CNCX record ordinal * 65536 + local byte offset`, **not** sum of prior
record lengths. Example label `A` → `8141`, padded `81410000`.

Simple worked entries: SKEL `0e`+UTF8(`SKEL0000000000`)+`0a818180a280a2`;
FRAG `0a`+UTF8(`0000000020`)+`0f8080808088`; NCX `0230308f949680808080`
(start20,length22,label0,depth0,fid0,off0). TAGX SKEL is
`54414758 00000018 00000001 01010300 06020c00 00000001`.
One IDXT pointer192: `4944585400c00000` (last two bytes alignment).
See literal vectors. Complete multi-record, rollover and reconstructed dumps
are Tasks 5/7; their expectations must not be generated by the serializer tested.

### Writer index fixture and assembler contract (Task 5)

`buildIndexes(layout, navigation, textRecordPayloadLengths)` returns `skel`,
`frag`, `ncx`, `fdst`, and `tbs`. Each index array is ordered **meta, all data,
all CNCX**; SKEL has no CNCX. These arrays contain no PalmDB record-number
references: the assembler assigns the three meta record numbers after placing
text records. Missing navigation gives `ncx=[]`; empty required SKEL/FRAG still
have meta and empty data records. `fdst` is one complete record.

`tbs[i]` is a **complete appendable trailer**, including its self-inclusive
backward-VWI length, for the corresponding uncompressed text payload. Append
it after Task 3's already complete `overlap` trailer. Empty payload is `81`.
When NCX is omitted, the assembler sets extra-data flags1 and omits TBS bytes;
otherwise flags3 includes each returned trailer, including `81` on CSS-only
records. Payload lengths must sum to `layout.text.length`, each in1..4096;
UTF-8 overlap copies do not contribute to these lengths or interval addresses.
The supported writer rejects >255 intersecting entries in **one record** with
`export.azw3Limit`; it imposes no chapter-count cap and does not implement the
unverified multi-sequence overflow path. Noncontiguous overlapping ordinals
also fail explicitly. Duplicate NCX targets can have zero-length sections;
such sections do not intersect a text record.

Our fixture uses the literal34-byte shell and8-byte fragment above, plus4-byte
CSS `a{}\n`, navigation label `A` targeting reconstructed20, fid0/off0. The
following is the **complete data INDX dump**, expressed with explicit zero runs.
The first line has40 bytes; append152 zero bytes to finish each192-byte header,
then append the corresponding tail below. No omitted nonzero fields exist.

```text
SKEL header0..39:
494e4458 000000c0 00000000 00000001 00000000 000000d8 00000001 ffffffff ffffffff 00000000
40..191: 00 ×152
192..223:
0e534b454c30303030303030303030 0a818180a280a2 0000 49445854 00c0 0000

FRAG header0..39:
494e4458 000000c0 00000000 00000001 00000000 000000d4 00000001 ffffffff ffffffff 00000000
40..191: 00 ×152
192..219:
0a30303030303030303230 0f8080808088 000000 49445854 00c0 0000

NCX header0..39:
494e4458 000000c0 00000000 00000001 00000000 000000cc 00000001 ffffffff ffffffff 00000000
40..191: 00 ×152
192..211:
0230308f949680808080 0000 49445854 00c0 0000
```

Meta records use the documented192-byte header with kind0/type2, data count1,
encoding65001, NULL at32, total entries1, TAGX offset192; CNCX count is0 for
SKEL and1 for FRAG/NCX. All other unspecified header words are zero. Complete
post-header tails below contain TAGX, final-key/count geometry, alignment,
and IDXT. Header IDXT offsets / total record lengths are respectively
SKEL236/244, FRAG240/248, NCX248/256:

```text
SKEL:
54414758 00000018 00000001 01010300 06020c00 00000001
0e534b454c30303030303030303030 0001 000000
49445854 00d8 0000
FRAG:
54414758 00000020 00000001 02010100 03010200 04010400 06020800 00000001
0a30303030303030303230 0001 000000
49445854 00e0 0000
NCX:
54414758 00000030 00000001 01010100 02010200 03010400 04010800 15011000 16012000 17014000 06028000 00000001
023030 0001 000000
49445854 00f0 0000
FRAG CNCX (selector P-//*[@aid='0']):
8f502d2f2f2a5b406169643d2730275d
NCX CNCX (label A): 81410000
FDST (HTML0..42, CSS42..46):
46445354 0000000c 00000002 00000000 0000002a 0000002a 0000002e
TBS (one46-byte text payload): 8288 83
```

The tests compare the three data records with these hand-counted full bytes
and decode every entry through an independent TAGX/IDXT/CNCX reader. A4500-file
fixture forces all three families into multiple data records; each meta
geometry count and final key is checked. A300-chapter-plus-notes fixture
checks reading order, Unicode labels, all fid/off pairs, and CNCX addresses
across string-record rollover. Packing targets60KiB including data IDXT and
alignment. A single CNCX entry may use up to65532 aligned bytes; one additional
byte requiring65536 padded bytes fails. No string is split across records.
Meta-record overflow also fails explicitly rather than truncating pointers.

Half-open TBS boundary example: three4096-byte files with targets20,4116,8212,
HTML end12288, then4 CSS bytes. For payload lengths
`[4096,4096,100,3995,1,4]`, complete trailers are
`828883`, `86880284`, `8e880284`, `93888084`, `928883`, `81`.
The fourth spans entry2; the fifth ends exactly at the entry boundary and
therefore has no span flag. A record beginning exactly at target16 yields
`01828884` (ordinal16/type8/self-inclusive length4), demonstrating the
forward-VWI transition beyond one byte.255 intersecting entries encode
`8688ff84`;256 fail with the documented profile error.

## Flows, images, cover and thumbnail

FDST: signature4 `FDST`; headerLength u32=12; flowCount u32; one pair
(start:u32,endExclusive:u32) per flow. Addresses are in the combined **physical
uncompressed stream**; flow0 contains all chapter skeleton/fragment layouts;
subsequent flows contain CSS. Header FDST count equals flow count.
`kindle:flow:0001?mime=text/css` addresses CSS flow1 (four base32 digits).
For HTML42 bytes and CSS4 bytes:
`46445354 0000000c 00000002 00000000 0000002a 0000002a 0000002e`.
Do not treat each chapter as an FDST HTML flow. Long-chapter measurements are
Task7; target-device rendering remains Task10.

Resources are raw encoded JPEG/PNG/GIF bytes, without wrapper headers, in
stable order derived from **complete normalized project paths**, including
CSS-only references. `kindle:embed:XXXX?mime=image/png` has **one-based**
resource ordinal (first resource0001). Actual record is
`firstResource + decodedOrdinal - 1`. EXTH cover/thumbnail offsets are instead
**zero-based**, so first image coverOffset0, embed0001. Embedded MIME must match
actual bytes after processing; WebP is converted to supported PNG/JPEG;
animated GIF needs the shared processor's supported deterministic output.
Do not let thumbnail insertion shift an already written ordinal.

Our initial profile may generate a JPEG thumbnail (fit within180×240, no
upscale, preserve aspect) after the cover and regular resources. It must be
included in EXTH125 count; EXTH202 selects its zero-based offset. Its presence
and dimensions are a policy pending Task7 measurements and Task10 device gate,
not proof the Kindle library will show it. EXTH129 is optional and omitted:
Calibre's URI uses a different zero-based convention from markup embed links;
there is no need to expose that ambiguity to the supported profile.
Missing cover: omit EXTH201/202/203 and do not generate a fake cover/thumbnail.
PNG signature vector `89504e470d0a1a0a`; cover offset0 entry
`000000c9 0000000c 00000000`. Full image/thumbnail evidence is Task6/7.

## FLIS / FCIS / DATP / EOF

FLIS has 36 bytes, fixed reference-compatible payload:
`464c4953 00000008 00410000 00000000 ffffffff 00010003 00000003 00000001 ffffffff`.
Signature at0; size marker8 at4; constant16-bit value0041 at8; remaining
constants as shown. No dynamic field is implied by these opaque values.

FCIS has52 bytes: signature at0; markers20,16,2 at4/8/12; zero at16;
**total text length** u32 at20; zero at24;40 at28;zero at32;40 at36;8 at40;
u16 1 at44 and46;zero u32 at48.
For42 text bytes:
`46434953 00000014 00000010 00000002 00000000 0000002a 00000000 00000028 00000000 00000028 00000008 00010001 00000000`.
EOF is exactly4 bytes `e98e0d0a`.

DATP is a decompression/access table used by other compression profiles. Pinned
PalmDOC KF8 output omits it; **our profile omits it** and stores NULL at256.
Do not manufacture an empty DATP record or claim a DATP decoder. The spec's
“cover DATP” requirement is satisfied by this explicit supported omission.
FLIS/FCIS constants' semantic meanings beyond public evidence remain unknown;
exact bytes, lengths and their references are confirmed. Whole-file tail dump
is Task6/7. See `flis`, `fcis`, `eof` vectors.

## Endnotes, popups and backlinks

Reuse existing chapter/endnote markup. Each reference has a chapter-qualified
unique id and `epub:type="noteref"` pointing to its chapter-qualified note.
The note target starts with the visible anchor back to the **first** reference:
`<div id="note-…" epub:type="footnote"><p><a href="…#ref-…">1</a> …</p></div>`.
Whitespace/paragraph wrapper is permitted; an unrelated heading before that
backlink is not. Repeated references share a note, not duplicate target ids.
An unreferenced note must not fabricate a backlink. Retain original ids while
rewriting both directions to byte-based `kindle:pos` addresses.

Do not strip `xmlns:epub` or collapse `epub:type` into unnamespaced `type`.
Calibre's reference conversion did that; the independent writer will preserve
valid namespaces. Calibre round-trip can establish anchor survival and first
backlink semantics, **not** actual popup behavior. Both physical Paperwhites
are still required for the release gate. Whole popup/reference fixtures belong
to Tasks4/7/10; position/UTF8 literals above supply Task1 vectors.
