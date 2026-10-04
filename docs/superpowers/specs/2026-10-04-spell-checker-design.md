# Spell checker (Russian and English) — specification

- **Date:** 2026-10-04
- **Status:** roadmap, after v1. Not scheduled. No implementation plan yet.
- **Source:** brainstorming session 2026-10-04 (roadmap item "language check
  for English and Russian", README → Roadmap, AGENTS.md → Roadmap)
- **Base spec:** `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`

## 1. Why

Spelling is checked today only by the WebView: `SourceEditor.vue` sets
`spellcheck="true"` and `lang = book.language` on the CodeMirror content.
The result depends on the OS:

- **Windows 11 (WebView2): nothing is underlined at all** (user report,
  2026-10-04). The cause wasn't investigated; it doesn't change the
  conclusion.
- Linux (WebKitGTK): best effort, already accepted as broken in v1 (base
  spec, section 4a).
- macOS: works, with the system dictionary.

Also, even where it works: character names and world terms are underlined in
every chapter, "Add to dictionary" goes to the OS dictionary rather than the
book, only the open chapter is checked, and only one language (`lang`) is
used per chapter.

Goal: **a spell checker of our own that behaves the same on Windows, macOS
and Linux**, with a per-book dictionary and a book-wide overview.

## 2. Scope

In scope:

- **Spelling only**, Russian and English.
- Chapter text (NovLang source) only.
- Underlining in the chapter editor, suggestions, "Ignore", "Add to book
  dictionary".
- **Mixed text:** each word is checked against the dictionary of its script
  (Cyrillic → ru, Latin → en), whatever the book language is.
- Per-book dictionary stored in `.edb`.
- Book-wide overview: a spelling badge in the status bar next to the ⚠
  warnings badge.
- **Warns and never blocks** export.

Out of scope (possible follow-ups, each needs its own spec):

- grammar and punctuation (LanguageTool-like);
- style and vocabulary (repeated words, filler words, long sentences);
- typography and translation consistency (ё/е, quotes, dashes, the same
  name spelled differently across chapters);
- languages other than ru / en;
- a user dictionary shared by all books;
- checking metadata fields and `custom.css`.

## 3. Engine choice

Three approaches were considered, all using Hunspell-format dictionaries
(the LibreOffice / Firefox standard):

| Approach                                         | Verdict                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Rust crate `spellbook` behind Tauri commands** | **Chosen.** Modern Hunspell-compatible implementation (Helix editor team); fast and memory-efficient on the heavy Russian morphology |
| `nspell` (JS) in a Web Worker                    | Rejected: slow load (seconds) and hundreds of MB of memory with `ru_RU`, slow suggestions                                            |
| Hunspell compiled to WASM in a Web Worker        | Rejected: npm packages are old / unmaintained; we would own a WASM build pipeline                                                    |

The base spec allows Rust "only where there is no ready Tauri plugin"; there
is no spell-checking plugin, so this is within the rule.

## 4. Architecture and data flow

### 4.1. Rust (`src-tauri`)

- Module `spell`. Loads `ru_RU` and `en_US` (`.aff` / `.dic` from the bundle
  resources) **lazily, on the first request**, on a blocking thread
  (`spawn_blocking`), so the window starts without delay. Dictionaries live
  in Tauri `State` behind a `Mutex` (or `OnceLock` per language).
- Commands:
  - `spell_check(lang: "ru" | "en", words: string[]) → string[]` — returns
    the misspelled subset;
  - `spell_suggest(lang, word) → string[]` — up to 5 suggestions.
- Errors follow the base spec: `{ code, message }` via `thiserror` + `serde`;
  `spell.dictionaryLoad` when a dictionary can't be loaded or parsed.
- **The book dictionary is not sent to Rust.** Rust checks against the base
  dictionaries only; the book dictionary and "Ignore" are a filter on the
  frontend. No per-book state in Rust.

### 4.2. Frontend

- `types/platform.ts`: interface
  `SpellChecker { check(lang, words): Promise<string[]>; suggest(lang, word): Promise<string[]> }`.
- `services/platform/spell.ts`: the only place that calls `invoke` for
  spelling; maps errors to `AppError`. Tests and the e2e in-memory platform
  use a fake with a list of known words.
- `services/spell/` — pure functions, no `vue` / `pinia` / `@tauri-apps/*`
  (import boundaries enforced by Oxlint as for other services):
  - `tokenize(source) → { word, from, to }[]`. Skips NovLang markup: block
    prefixes `# `, `> `, `[^id]: `; inline `**`, `*`; images
    `![alt](images/…)` (the path is skipped; `alt` text is checked);
    footnote references `[^id]`. A word is a run of letters (`\p{L}`) with
    an inner hyphen or apostrophe (`из-за`, `don't`, `кто-нибудь`). Tokens
    containing digits are skipped.
  - `languageOf(word) → "ru" | "en" | null`: Cyrillic → ru, Latin → en,
    anything else (mixed scripts, CJK, other alphabets) → `null`, not
    checked.
  - `isAccepted(word, bookDictionary, sessionIgnores)`: book-dictionary and
    ignore rules from 5.1.
- `stores/spelling.ts`:
  - cache `Map<"ru:слово", boolean>` shared by all chapters;
  - results `Map<chapterId, Misspelling[]>` (`{ word, lang, from, to }`);
  - `sessionIgnores: Set<string>`;
  - `status: "idle" | "checking" | "unavailable"`.
- `composables/useSpellcheck`:
  - on a chapter edit, ~300 ms after the last keystroke: tokenize → words
    not yet in the cache go to `SpellChecker.check` → the chapter's results
    are updated;
  - on opening a book: the open chapter first, then the rest in the
    background, in batches of about 2000 unique words;
  - book dictionary edits, "Ignore" and language settings changes need **no
    Rust call**: they only re-filter cached results.

### 4.3. Editor integration

- Underlines are a `Decoration.mark` with class `cm-misspelled` (wavy
  underline), built only for `visibleRanges`. A separate extension from
  `@codemirror/lint`, so spelling and NovLang warnings don't mix.
- `spellcheck="false"` on the chapter editor (instead of `true`), so macOS
  doesn't draw a second underline.
- The CSS editor, metadata fields and other inputs are not checked by this
  feature.

## 5. Book dictionary and `.edb`

### 5.1. Model and matching

- `Book.dictionary: string[]`, sorted, unique; empty = no file.
- **First-letter case is ignored:** a dictionary entry `Минжуй` accepts
  `Минжуй` and `минжуй`; `МИНЖУЙ` is not accepted (Hunspell's rule for
  proper names).
- **ё and е are equivalent** for dictionary entries: `Алёна` accepts
  `Алена` and vice versa.
- "Ignore" (`sessionIgnores`) accepts the exact word until the book is
  closed; never written to the file.

### 5.2. File format

New optional file in the `.edb` container:

```
my-novel.edb (zip)
├── manifest.json
├── chapters/<id>.nov
├── images/
├── styles/custom.css     optional
└── dictionary.txt        optional: UTF-8, LF, one word per line, sorted, unique
```

A separate file rather than a manifest field: readable in a diff and easy to
edit by hand. On read: lines are trimmed, empty lines and duplicates dropped,
CRLF normalised. Written deterministically like the rest of the container
(fixed position after `styles/custom.css`, DEFLATE).

### 5.3. Format version 1 → 2

`services/edb/read.ts` today reads only `manifest.json`, `chapters/`,
`images/` and `styles/custom.css`; other files are silently dropped and lost
on the next save. An older app would therefore **delete the dictionary**.
So:

- `CURRENT_EDB_FORMAT_VERSION` becomes 2; migration 1 → 2 is trivial
  (empty dictionary).
- Every file is written as version 2 by the new app, whether or not it has a
  dictionary — no "sometimes 1, sometimes 2" state.
- An older app opening a version 2 file shows the existing fatal error
  "update the app" (base spec, section 2).

### 5.4. Operations, autosave, recovery

- `services/book/dictionary.ts`: `addToDictionary(book, word)`,
  `removeFromDictionary(book, word)` — pure, like other book operations.
  `projectStore` actions call them, do `revision++` and mark the dictionary
  changed for autosave.
- Recovery (IndexedDB, `sessions` store): new field `dictionary: string[]`;
  sessions without it read as an empty dictionary.

### 5.5. Dictionary view

- Explorer → **Book** section gets a **Dictionary** item next to Metadata
  and Styles. `layoutStore.center` gets `{ kind: 'dictionary' }`.
- `components/spelling/DictionaryView`: list of words with a filter field,
  delete per word, an "Add word" field. No free-text editor.

## 6. User interface

### 6.1. In the editor

- Wavy underline in a new theme token `--spelling` (reddish, different from
  the yellow NovLang warnings), defined for the light and dark palettes.
- **Right-click on an underlined word**, or **Mod+.** with the cursor in it,
  opens our menu next to the word:
  - up to 5 suggestions (requested from Rust only when the menu opens);
    choosing one replaces the word in a single transaction (Mod+Z undoes
    it);
  - «Пропустить» / "Ignore";
  - «Добавить в словарь книги» / "Add to book dictionary";
  - «Нет вариантов» / "No suggestions" when the list is empty.
- Right-click elsewhere behaves as today (the editor has no context menu of
  its own).

### 6.2. Status bar badge

- In `StatusBar.vue`, on the left right after `WarningsPopover`, in the same
  style: an icon (e.g. `IconTextSpellcheck`) and a badge with the number of
  misspellings **in the whole book**. A spinner while the first pass is
  running; greyed out with a tooltip when `status = "unavailable"`.
- Click → popover (`components/spelling/SpellingPopover`), grouped by
  chapter: «Глава 3 · Название — 4». Inside a group:
  - one row per distinct word with a count («Минжуи ×7») and a snippet of
    context around the first occurrence («…сказал **Минжуи** и вышел…»);
  - click on a row opens the chapter at that occurrence;
  - quick actions on the row: "Add to dictionary", "Ignore" — they clear all
    occurrences at once.

### 6.3. Settings

In Settings → Editor (app settings, shared by all books, not in `.edb`):

- «Проверять орфографию» / "Check spelling" — on by default;
- languages: ☑ Русский ☑ English — e.g. English can be turned off for a
  Russian book whose Latin words are only names.

## 7. Errors and logging

- Dictionary load failure → `spell.dictionaryLoad`: one notification per
  session «Проверка орфографии недоступна · Подробнее», the badge is greyed
  out, editing is unaffected, the error is logged.
- A failed `spell_check` call: the words are not cached; the next edit
  retries. Logged at `warn`.
- **Book text is never logged** — only word counts and timings (debug).

## 8. Performance

- Lazy dictionary load on a blocking thread; nothing at app start.
- Open chapter first, the rest in batches of ~2000 unique words.
- The shared cache means that after the first pass a typical edit triggers
  no Rust call at all.
- Dictionary / ignore / language changes are frontend-only filters.
- Decorations only for visible ranges.

## 9. Packaging and licences

- `src-tauri/resources/dictionaries/{ru_RU,en_US}.{aff,dic}` included via
  `bundle.resources` in `tauri.conf.json`.
- Sources and pinned versions recorded in
  `src-tauri/resources/dictionaries/README.md`:
  - ru_RU — LibreOffice dictionaries (BSD-style licence);
  - en_US — SCOWL / wordlist.
- Licence texts are shipped next to the dictionaries and credited in the
  About section and the README. Both are compatible with GPL-3.0.
- Installer size grows by roughly 3–4 MB.

## 10. Testing

- **Rust** (`cargo test`, module `spell`): correct / misspelled words in ru
  and en, ё, capitalised words, suggestions, dictionary load error.
- **Unit (Vitest)** `services/spell`: `tokenize` on NovLang markup (images,
  footnotes, `**`, headings, quotes, hyphen, apostrophe, digits);
  `languageOf`; dictionary and ignore matching (first-letter case, ё/е);
  `services/book/dictionary`.
- **edb:** roundtrip with `dictionary.txt`; migration 1 → 2; a version 1
  file without a dictionary; a version 3 file is fatal.
- **Stores / composables:** fake `SpellChecker`; cache (a repeated edit does
  not call `check`); count updates on "Add to dictionary" / "Ignore"; status
  `unavailable` on a load error; recovery session with a dictionary.
- **Components:** status bar badge and popover (grouping, "×7", jump to
  word, quick actions); the suggestion menu; `DictionaryView`.
- **e2e** (Playwright, in-memory platform with the fake): misspelled word is
  underlined → "Add to dictionary" → underline disappears → save → reopen →
  still accepted.
- Locale key parity ru / en / zh-CN.

## 11. Open points for the implementation plan

- Exact `spellbook` version and its suggestion quality for `ru_RU`; if
  suggestions are weak, consider limiting them for long words rather than
  switching engines.
- Whether WebView2 on Windows can be made to spell-check at all is no longer
  relevant once this lands; the built-in `spellcheck` stays off.
