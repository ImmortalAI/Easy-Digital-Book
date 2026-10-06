# Spelling dictionaries

Hunspell dictionaries bundled with the app and loaded by `src-tauri/src/spell.rs`.
Both files are UTF-8 (`SET UTF-8`); `spellbook` accepts UTF-8 only.

| File                     | Source                                                                                                                | Licence                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `ru_RU.aff`, `ru_RU.dic` | LibreOffice/dictionaries `ru_RU/` @ `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` — © 1997–2008 Alexander I. Lebedev     | BSD-style, see `LICENSE-ru_RU.txt`     |
| `en_US.aff`, `en_US.dic` | LibreOffice/dictionaries `en/` @ `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` — SCOWL 2020.12.07, Kevin Atkinson et al. | SCOWL licence, see `LICENSE-en_US.txt` |

SHA-256:

    e746c882dd6f303c2c46e7452804b9201115a6942cfeb15f18f8edf774d2e24e  en_US.aff
    f0b1a234bd178bdd01875b2a392a9647f888b8fe879f79c52aae62c2759b3647  en_US.dic
    38ce7d4af78e211e9bafe4bf7e3d6a2c420591136cb738ec6648f8fdf6524cd7  ru_RU.aff
    f6047416a0204adbecf3a451b874ec8a97ee37e2cbc714466ef04d8dbcc0d6fc  ru_RU.dic

To update: change the revision in this table, re-download the four files and
the two licence files from the same revision, update the hashes, run
`cargo test spell` in `src-tauri`.

## Load time

Measured with `cargo test --release spell::tests::load_timing -- --ignored --nocapture`
on an Apple M5 Pro (macOS): ru 18.5 ms, en 3.8 ms (parse of aff + dic, first check).
