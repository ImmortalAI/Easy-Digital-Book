# v1 release checklist

Complete every release-blocking item with a real packaged Tauri build. Record
the OS version, app version, date, operator, artifact name, and a short result
next to each item. A skipped or unavailable check is not a pass.

Release tags must be exactly `v<package.json version>` (for example, version
`0.1.0` uses `v0.1.0`). The release workflow checks this convention and uses
the matching `CHANGELOG.md` section for the draft release notes.

## Automated gates

- [ ] `pnpm check`
- [ ] `pnpm build`
- [ ] `pnpm test:coverage` meets the configured pure-service/store thresholds
- [ ] `pnpm build:fixture-epubs` runs epubcheck 5.2.1 with Java 17 and reports no errors or warnings
- [ ] `pnpm test:verify-azw3` passes the semantic and failure-path verifier tests
- [ ] `pnpm verify:azw3` passes with Calibre 9.15.0 and verifies all four generated fixtures
- [ ] `pnpm test:e2e` passes with the Chromium browser installed
- [ ] Rust fmt, clippy with `-D warnings`, and tests pass on Ubuntu, macOS, and Windows
- [ ] `com.immortalai.edb` and `dragDropEnabled: false` are unchanged

## Manual matrix

Run the following on macOS 12+, Windows 10/WebView2, and Ubuntu 22.04/WebKitGTK.

| Scenario                                                                                                                                                                                                                         | macOS | Windows | Ubuntu |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- | ------ |
| First launch creates a new book and selects the OS locale                                                                                                                                                                        | [ ]   | [ ]     | [ ]    |
| Open `.edb` from the OS file association at first launch                                                                                                                                                                         | [ ]   | [ ]     | [ ]    |
| Open another `.edb` while the app is already running                                                                                                                                                                             | [ ]   | [ ]     | [ ]    |
| HTML5 chapter reorder and editor image drag/drop work                                                                                                                                                                            | [ ]   | [ ]     | [ ]    |
| Clipboard image paste imports an image into the project                                                                                                                                                                          | [ ]   | [ ]     | [ ]    |
| Save, Save As, overwrite confirmation, and scoped atomic write work                                                                                                                                                              | [ ]   | [ ]     | [ ]    |
| Recovery appears after an interrupted dirty session and restores edits                                                                                                                                                           | [ ]   | [ ]     | [ ]    |
| EPUB export writes the selected preset, cover, title page, and custom CSS                                                                                                                                                        | [ ]   | [ ]     | [ ]    |
| Packaged app exports AZW3/KF8 with `.azw3` extension; cancel, retry, and Show in folder work                                                                                                                                     | [ ]   | [ ]     | [ ]    |
| `scripts/epubcheck.sh` validates the exported representative EPUB                                                                                                                                                                | [ ]   | [ ]     | [ ]    |
| Send to Kindle accepts the EPUB and it renders on a Paperwhite                                                                                                                                                                   | [ ]   | [ ]     | [ ]    |
| Footnotes: a book with notes in two chapters; in Calibre's viewer a note link opens the note; after "Send to device" (MOBI and AZW3) on a Paperwhite the note opens as a popup and the number in the note leads back to the text | [ ]   | [ ]     | [ ]    |
| Preview: clicking a note number scrolls to the note and back                                                                                                                                                                     | [ ]   | [ ]     | [ ]    |
| Gallery: long press selects, dragging extends the range, rename numbers follow the selection order, one Undo restores a batch delete                                                                                             | [ ]   | [ ]     | [ ]    |
| Dark theme: preview paper look, both corner toggles, Mod+Alt+P, status-bar notice; Mod+F counter; Tab in custom.css; cover from book images; single-image rename; Show in folder                                                 | [ ]   | [ ]     | [ ]    |

## AZW3 device matrix

Run these checks on a **Paperwhite 3 (7th gen, 2015)** and a **Paperwhite 12th gen (2024)** using AZW3 exported directly by the packaged app. Record firmware, app version, date, operator, USB transfer method, fixture, and result beside each device run. An unavailable device or failed check remains open.

| Scenario                                                             | Paperwhite 3 | Paperwhite 12 |
| -------------------------------------------------------------------- | ------------ | ------------- |
| Table of contents jumps to the expected chapters                     | [ ]          | [ ]           |
| Popup footnote opens and its return link goes to the first reference | [ ]          | [ ]           |
| Library cover is displayed                                           | [ ]          | [ ]           |
| Inline images are sharp and fit the screen                           | [ ]          | [ ]           |
| `custom.css` styling is visible                                      | [ ]          | [ ]           |
| Long chapter and 300-chapter fixture open and navigate               | [ ]          | [ ]           |
| Title page and version-in-title options render as selected           | [ ]          | [ ]           |
| Cancel/retry and Show in folder work in the packaged app             | [ ]          | [ ]           |

## Environment evidence

Capture the exact output of these commands in the task report or release log:

```sh
command -v epubcheck
/usr/bin/java -version
test -d "$HOME/Library/Caches/ms-playwright" && echo present || echo missing
```

Record the actual command output from the release environment. CI installs the
pinned Java/epubcheck and Calibre versions and runs Chromium; local developer
tool paths and cached browsers can differ.

## Kindle CSS checker

PW3 empirical analysis is complete for the two standalone AZW3 test books:
[conclusions and per-case evidence](superpowers/notes/2026-10-06-paperwhite-3-css-conclusions.md),
firmware 5.16.2.1.1, 142 initial cases and 57 clarifying cases. Retest results
at font size 3 in portrait are 26 yes, 24 no and 7 inconclusive; the sole
font-size-6 observation is inconclusive background-size. These records
do not complete PW12, other settings or packaged-app export checks.
Do not infer that all media queries fail: all/screen/min-width worked;
amzn-kf8 did not. Fixed had pagination defects despite positioning effects.
The existing common support statuses remain partial pending both devices.

- [ ] RU / EN / zh-CN: messages in the CSS editor, Styles section and export summary translate without editing the book.
- [ ] Syntax errors produce one info finding; valid neighboring rules continue to be checked. Fixing/deleting CSS removes stale findings.
- [ ] Styles expands into individual findings; selecting one opens and focuses the correct CSS range, including from Preview mode.
- [ ] CSS warnings/info never prevent EPUB or AZW3 export; the original custom CSS remains in the export.
- [ ] Book replacement (including the same UUID), absent CSS and closing the editor do not transfer diagnostics between books.

`pnpm build:fixture-azw3` adds the **CSS Support Samples** catalog chapter to
`images-css.azw3` and produces isolated editable projects under
`css-support-samples/`. Its `manifest.json` names every property, keyword
value, selector, at-rule and unit in the initial support table. Each project
has a reference passage, a sample and instructions. Open each `.edb` in the
packaged app, export AZW3, then compare with a second export with custom CSS
removed. Capture a photograph and note font size and orientation.

For every sample ID record **device, firmware, OS, app version, date,
operator, export artifact, CSS, result, comparison photograph and any
context limitations**. Complete both Paperwhite 3 and Paperwhite 12 columns.
Neither Calibre preservation nor parser results prove device support.
Interactive states, list/table/positioning context and charset/namespace
need additional applicable content before a conclusive device verdict;
an inapplicable rule or missing external font/stylesheet is inconclusive.

| Sample family              | Paperwhite 3 | Paperwhite 12 |
| -------------------------- | ------------ | ------------- |
| `property-*` and `value-*` | [ ]          | [ ]           |
| `selector-*`               | [ ]          | [ ]           |
| `at-rule-*`                | [ ]          | [ ]           |
| `unit-*`                   | [ ]          | [ ]           |

The initial table deliberately keeps all unverified rows **partial**.
Promote to supported/unsupported only with recorded results for both target
devices; add the sample ID and evidence path to that row's `source`.
