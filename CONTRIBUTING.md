# Contributing to Easy Digital Book

## Development

Requirements: Node.js 22+, pnpm 10+, and Rust stable for Tauri builds.

```sh
pnpm install
pnpm tauri dev   # the desktop app with hot reload
pnpm dev         # the web UI only, in a browser
pnpm check       # type check, lint, format check and unit tests
pnpm build
```

Chapter text is written in NovLang; the [markup guide](docs/en/markup.md)
lists every supported construct. A sample project to try things on lives in
[`docs/sample/`](docs/sample/the-keeper-of-north-light.edb).

## Validation

```sh
pnpm test:coverage
pnpm build:fixture-epubs
pnpm test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`pnpm build:fixture-epubs` requires Java 17+ and the pinned epubcheck 5.2.1
release unpacked whole into `.tools/epubcheck` — the released jar is thin and
loads its dependencies from the `lib` directory beside it, so copying the jar
on its own is not enough. Rename `epubcheck.jar` to `epubcheck-5.2.1.jar`, or
point `EPUBCHECK_JAR` at it. The build fails when either requirement is
unavailable; required EPUB validation is never silently skipped. See
[the release checklist](docs/release-checklist.md) for manual checks on all
supported desktop targets.

## Releases

Release bundles are built by the `v*` GitHub Actions workflow for universal
macOS DMG, Windows NSIS, and Ubuntu 22.04 AppImage/deb/rpm. Release tags must
exactly match the `package.json` version: for example, version `1.0.1` is
released as tag `v1.0.1`. The workflow checks this before building and
includes the matching `CHANGELOG.md` section in the draft notes.

The Tauri application identifier is `com.immortalai.edb`; changing it breaks
recovery data tied to the WebView origin.

## App icon

The icon sources are in `src-tauri/icons/source/`: `modern_icon.png` is the
original artwork, `app-icon.png` is the transparent full-bleed version for
Windows and Linux, and `app-icon-macos.png` is padded to the macOS icon grid.
To regenerate, run `pnpm tauri icon` on each into a temporary directory, copy
`icon.icns` from the macOS run and the remaining files from the other.
