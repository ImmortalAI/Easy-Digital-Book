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
