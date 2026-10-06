# AZW3 final verification — 2026-10-05

Plan: `2026-10-04-azw3-export.md`. Implementation range: `29eac76..dc1854b`.
All ten implementation tasks were already complete when this session resumed;
work resumed at the pending whole-branch review.

## Fresh local verification

| Check                                                                   | Result                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm check`                                                            | TypeScript, lint, formatting and 585 tests passed (98 files)                              |
| `pnpm test:coverage`                                                    | Passed: statements 92.93%, branches 82.52%, functions 93.58%, lines 94.77%                |
| `pnpm build`                                                            | Passed; existing 1.45 MB chunk advisory                                                   |
| `pnpm test:verify-azw3`                                                 | 16 Python tests passed                                                                    |
| `CALIBRE_DIR=/Applications/calibre.app/Contents/MacOS pnpm verify:azw3` | Four regenerated fixtures passed semantic audits with Calibre 9.15.0; no unresolved links |
| `pnpm test:e2e`                                                         | 23 Chromium scenarios passed; local server required sandbox escalation                    |
| EPUB fixture generation + EPUBCheck 5.2.1 / Java 17                     | Passed, 0 fatals / 0 errors / 0 warnings                                                  |
| `git diff --check`                                                      | Passed                                                                                    |

EPUB fixture generation used `node --import tsx scripts/build-fixture-epubs.mts`
with `EPUBCHECK_JAR` and Java 17 on `PATH`, avoiding the tsx CLI IPC restriction.
The validator was also run directly to inspect its output. Existing Vitest
happy-dom startup advisory remains informational.

## Release gates still open

The GitHub Actions Linux interoperability job has not been run by this session.
Direct exports from packaged macOS, Windows and Linux builds, and physical
Paperwhite 3 / Paperwhite 12 checks remain required. Representative real-book
and multiple-HTML-flow comparisons remain research gates. Local synthetic
fixture success does not substitute for those checks. See
`docs/release-checklist.md` for the matrix. This report does not declare release
readiness; branch integration has not been performed.

## Implementation rulings carried from the progress ledger

These record decisions made during the original implementation, including their
stated consequences. They are preserved here so the ignored scratch workspace
is not the only record.

- Ruling: Work on the explicitly requested new branch in the provided checkout rather than create an additional worktree — branch isolation preserves the supplied workspace and its approved plan; if stronger filesystem isolation is needed later, moving work would cost setup time.
- Ruling: Task 1 must validate the actual Calibre installation before pinning CI — local Calibre 9.15.0 is available; a different supported CI version may require format revalidation.
- Ruling: Tasks 3–7 may refine planned binary signatures after researched format facts — the spec is authoritative and the plan explicitly gates on research; a wrong interface decision costs downstream refactoring.
- Ruling: Paperwhite checks are release gates, not a prerequisite for local implementation/commits — no physical devices are exposed to this environment; an unverified thumbnail policy must remain documented and release-blocking.
- Ruling: Capture expected EPUB regression bytes independently before extraction; compare raw bytes and semantic contents at fixed time — shared preparation must not manufacture its own baseline; mistakes cost EPUB regression fixes.
- Ruling: Treat SKEL/FRAG as INDX index families, not literal record signatures — confirmed pinned format research; wrong handling makes the writer unreadable.
- Ruling: Position fid denotes global fragment ordinal with fixed-width base32 fields; off counts UTF-8 fragment bytes — confirmed reference measurements; wrong coordinates break navigation/footnotes.
- Ruling: PalmDOC DATP may be absent with documented sentinel, if independently verified by research and reflected in spec — DATP is an optional compression-related structure; an incorrect sentinel can impair reading and will be independently checked.
- Ruling: Extend planned PalmDB signature to accept deterministic book.created date — researched profile derives timestamps from creation and original two-argument signature lacks input; wrong date handling costs determinism/header fixes.
- Ruling: Replace ambiguous generic FRAG offsets with researched physical/file-local/reconstructed coordinates and expose fid/off + reconstructedOffset in TextLayout — NCX and positional links use different coordinate systems; wrong coordinates invalidate all downstream navigation.
- Ruling: TBS builder consumes uncompressed payload lengths and NCX reconstructed intervals; record compression happens after boundary planning — compressed lengths cannot describe text geometry; wrong boundaries produce corrupted navigation trailers.
- Ruling: Task2 may migrate use-export.ts progress type to the shared ExportProgress immediately — union widening otherwise breaks type compatibility before Task8; incorrect migration costs compile/controller fixes.
- Ruling: Add services/export and services/azw3 to explicit Vitest coverage include in Task2 — extraction must retain measurement of covered pure code; missing include hides regressions.
- Ruling: Fix overlapping Oxlint import overrides in Task2 — functional probes show generic src/** rule overwrites pure-service restrictions and permits vue imports; combining restrictions and excluding pure directories restores intended boundaries. If mistaken it may reject previously allowed imports, caught by full lint.
- Ruling: Skip cache insertion for processed outputs larger than64MiB in shared preparation, retaining exported bytes and the helper's existing general contract — the plan explicitly requires a bounded export cache; if mistaken this only costs repeat processing of large images.
- Ruling: Add focused azw3/xml.ts adapter for shared fast-xml-parser ordered parsing/serialization — skeleton, links and resource rewriting share configuration; this avoids a new XML tokenizer. Incorrect adapter behavior would require mixed-content/offset fixes.
- Ruling: Keep oversized complete blocks intact while splitting section containers at child boundaries, with8KiB soft target — valid XML/context takes priority over an unmeasured fragment-size policy; long-book performance may later require tuning.
- Ruling: Reuse repeated P(parent) selectors for consecutive removed children; reserve S for insertion after retained children — independently measured reference fixture preserves100 paragraph IDs/order with5 repeated P selectors; an incorrect interpretation breaks document reconstruction.
- Ruling: Map bare document paths to first content fragment and its insertion offset, retaining explicit skeleton-anchor coordinates — navigation should start at content and references need consistent decoded positions; if wrong this costs NCX/link adjustment.
- Ruling: buildIndexes.tbs returns complete appendable trailers including backward VWI; >255 intersecting NCX entries per record reports export.azw3Limit until independently verified multi-sequence support — format explicitly allows supported-profile error and avoids silent truncation; if insufficient it costs dense-TOC support work, not an arbitrary book chapter cap.
- Ruling: buildEndRecords retains and validates textRecordCount but emits only documented fixed FLIS and textLength-dependent FCIS fields — no documented count field exists; if incomplete, independent container validation will require a format correction.
- Ruling: Task6 regular resource plan has thumbnailIndex=null; Task7 owns processor plumbing and measured thumbnail policy — current buildResources has only already-processed images; if wrong, it costs thumbnail integration before release, with device gates still open.
- Ruling: HeaderInput recordIndices uses absolute zero-based PalmDB roles skel/frag/ncx/fdst/flis/fcis/firstResource; add resourceCount for EXTH125 and cover validation — original signature omitted required resource count; if wrong, assembler/header interfaces require refactoring.
- Ruling: Extract unchanged inline CSS url rewrite from prepare.ts into export/css-resources.ts for Task6 reuse — brief requests existing helper but logic was inline; if extraction changes behavior it costs EPUB regression repair, covered by captured byte digests.
- Ruling: Task7 may refactor skeleton/index loops into shared batched algorithm with async variants while retaining synchronous wrappers — current sync APIs cannot cancel inside processing; if incorrect it costs layout/index regression fixes, parity tests must preserve bytes. Single-node parser calls remain bounded by their synchronous library API and must be documented.
- Ruling: AZW3 CSS emits unquoted url(kindle:embed:...) while generic EPUB helper behavior stays unchanged — Calibre9.15 reproducibly corrupts quoted Kindle URLs and drops background rule; unquoted output roundtrips to existing image target; if device parser differs this costs syntax adjustment, physical tests remain open.
- Ruling: Add shared-core writePalmDbAsync with chunked final copies and retained sync wrapper — synchronous final huge image copying otherwise defeats lengthy-packaging cancellation; if wrong costs PalmDB parity/regression repair, allocation itself remains synchronous.
- Ruling: Retain independently validated one HTML flow+fragments profile; record synthetic longbook measurements and leave realbook/multiple-HTML-flow comparison open — no user realbook supplied and multiflow variant would be speculative outside current format contract; if insufficient later device/realbook evidence costs layout-policy research, not fabricated validation.
- Ruling: Task8 retains temporary exportEpub alias to exportBook until Task9 migrates UI — replacement otherwise breaks compile between tasks; if retained accidentally costs cleanup only, Task9 owns removal.

## Independent final review

# Final AZW3 branch review

Reviewed base `29eac76f329e6e2adecb068cafb0c539c0944836` through head `dc1854b`, against the AZW3 implementation plan, AZW3 design specification, format description, and AGENTS.md. Review was read-only for application code, tests, Git index, HEAD, and branch state; only this requested report and ignored verifier output were written.

## Strengths

- Shared preparation preserves the existing EPUB rendering, note numbering/backlinks, image plan/cache, custom CSS and document ordering. Serializers remain separate, and pure-service lint boundaries cover both new modules.
- The writer uses final serialized UTF-8 bytes for fixed-width link patches and fragment positions, explicit resource indices, independently documented PalmDOC overlap/TBS layouts, and absent-resource NULL pointers. Determinism and bounds have focused tests rather than only snapshot assertions.
- Controller captures the book/options/format before the native save dialog, selects the captured builder, checks cancellation before disk commit, preserves prior output on write failure, releases its lock in finally, and disposes only an internally owned processor. Dialog choices are disabled during export and dismissal paths request abort.
- Independent verification uses real Calibre 9.15.0 inspection and conversion, validates the exact fixture/manifest set, resolves transformed chapter/navigation/note targets, checks cover fingerprints, and fails when tools or semantic content are missing. Existing EPUBCheck gates remain intact.

## Verification evidence

Commands run during this review:

- Focused Vitest run covering AZW3, shared export, EPUB, controller and dialog: 22 files, 172 tests passed.
- `pnpm test:verify-azw3`: 16 tests passed, including corrupt navigation targets and missing-tool/fixture cases.
- `pnpm verify:azw3`: freshly generated all four books and read them with local Calibre 9.15.0. All four report semantic_match/all_resolved true and no failures. Synthetic 300-chapter book: 303 HTML files, 606 resolved links; images/CSS: three inline images and one CSS image URL; multilingual notes: five HTML files and 17 links.
- `git diff --check 29eac76 dc1854b`: passed.

Coordinator additionally supplied fresh whole-repository evidence: 585 Vitest tests, build/lint/format/type checks, coverage (92.93% statements, 82.52% branches, 93.58% functions, 94.77% lines), 23 Playwright tests, and EPUBCheck with zero errors/warnings. Those are coordinator results rather than commands independently rerun by this reviewer. The existing Vite chunk-size warning is unchanged.

## Issues

### Critical

None found.

### Important

None found.

### Minor

1. **Frozen-operation regression test asserts only part of the captured operation.** `src/composables/__tests__/use-export.test.ts:181` changes chapter source, options and format while save is pending, but its builder assertion checks the original title and grayscale only. It does not assert the original chapter source, all captured options, original defaultPath/filter, or persisted captured format/options in this race. Adjacent tests exercise normal filenames/filters/persistence; they do not close the race-specific assertion gap. The implementation visibly captures these values correctly. Extend the existing test with these assertions to prevent future partial capture regressions; no production fix is indicated.

2. **Owned processor lifecycle and controller reveal are not directly protected by the controller suite.** `src/composables/use-export.ts:127` and `src/composables/use-export.ts:165` construct/dispose an owned BrowserImageProcessor, while all controller tests inject a processor (`src/composables/__tests__/use-export.test.ts:40`). The suite never asserts disposal on success/failure/cancellation or preservation of caller ownership. `src/composables/__tests__/use-export.test.ts:119` asserts only that reveal is not called automatically; the dialog test at `src/components/export/__tests__/ExportDialog.test.ts:123` asserts a mocked controller call, rather than the controller forwarding lastOutput to opener and tolerating opener failure. Add focused lifecycle/reveal regressions when strengthening coverage. No leak or wrong reveal target was observed in the implementation.

3. **Success-to-format-switch reset lacks its exact dialog scenario.** `src/components/export/__tests__/ExportDialog.test.ts:100` switches format before exporting and checks stale lastOutput removal, then checks success/reveal/reopen. It never switches formats while success is currently displayed, so `src/components/export/ExportDialog.vue:74` resetting success is not directly verified. Add that short scenario and assert the old saved message/reveal action disappears and Export returns. The missing-version disabled control already has a direct test at `src/components/export/__tests__/ExportDialog.test.ts:54`; that earlier deferred concern is resolved.

## Declined to judge / limits

- Paperwhite 3 and Paperwhite 12 popup behavior, return navigation, library-cover display and image/CSS rendering: no physical devices are available; these remain explicit mandatory release gates, not passing results or newly discovered defects.
- Direct export from packaged macOS/Windows/Linux applications: automated browser/in-memory checks do not establish packaged runtime behavior; retain the documented release matrix.
- Actual new Ubuntu Calibre CI execution and Linux archive/runtime installation: workflow is configured, but local macOS Calibre results do not prove its first GitHub Actions execution. Keep CI execution pending.
- Representative real-book performance/link integrity and comparison against multiple HTML flows: synthetic 300-chapter results validate the implemented profile, but do not settle the documented research gate.
- Embedded thumbnail choice: current cover-only/NULL-thumbnail profile is intentional and locally readable; device-library comparison remains pending.
- Cancellation after atomic disk commit has begun: the unchanged PlatformServices atomic-write interface takes no abort signal. The plan explicitly checks abort before atomic write. This review assesses cancellation before that commit boundary and does not promise reversal of an already initiated atomic write.
- Broader CSS URL grammar and malformed externally authored metadata: limitations inherited from the existing export/project preparation are outside this AZW3 branch's selected scope; no EPUB regression was found from their extraction.

## Assessment

**Ready to merge: Yes, with non-blocking test-coverage follow-ups.** No concrete Critical/Important defect was found in the reviewed code or independently regenerated Calibre fixtures. This is a code-integration assessment, not release readiness: physical devices, packaged operating-system exports, actual new CI execution, and the real-book/multiple-flow research gates remain open. Publishing or merging requires the coordinator's separately authorized workflow.

## Final gate decisions

- Device behavior, library cover and thumbnail policy remain mandatory physical release checks; locally readable fixtures justify retaining the measured profile. If wrong, device compatibility needs a format correction before release.
- Packaged OS export and actual Linux CI execution remain open; local browser/macOS checks are evidence only for their tested environments. If wrong, runtime/install failures require platform fixes.
- Real-book/multiple-flow comparisons remain research gates; the measured single-HTML-flow profile stands provisionally. If wrong, representative books require layout/performance changes.
- Cancellation is enforced before atomic disk write; the existing write interface has no abort signal. An already started atomic commit is allowed to finish. If a broader guarantee is needed, it costs platform-interface and UX work.
- Existing CSS URL grammar and project metadata validation are retained: no extraction regression was found, and no concrete new defect was reported. If broader valid inputs fail, they require export/parser coverage and fixes.
- Historical missing-version-control concern is resolved by the existing direct test; TBS wording and fixture reproduction concerns were addressed in earlier tasks. Startup/chunk advisories are informational. Remaining deferred minors are exactly the three coverage gaps in the independent review above.

The feature branch and ignored progress workspace are retained for the outstanding
release gates and the user's integration decision. No merge, push, or publication
was performed during this continuation.
