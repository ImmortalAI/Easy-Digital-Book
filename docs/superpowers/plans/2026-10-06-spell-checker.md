# Spell Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собственная проверка орфографии ru/en для текста глав — одинаковая на Windows, macOS и Linux, со словарём книги в `.edb`, подчёркиванием, подсказками и обзором по всей книге в строке статуса.

**Architecture:** Rust-модуль `spell` на крейте `spellbook` лениво грузит словари Hunspell `ru_RU`/`en_US` из ресурсов бандла и отвечает на две команды (`spell_check`, `spell_suggest`). Фронтенд разбивает исходник NovLang на слова чистыми функциями (`services/spell`), спрашивает у Rust только ещё не известные слова (общий кэш в `stores/spelling`), а словарь книги, «Пропустить» и выбор языков применяет как фильтр без вызова Rust. Редактор получает подчёркивания отдельным расширением CodeMirror (не `@codemirror/lint`), строка статуса — плашку со списком по главам; `.edb` переходит на `formatVersion: 2` с необязательным `dictionary.txt`.

**Tech Stack:** Rust (`spellbook` 0.4.2, Tauri 2 commands, `thiserror`), TypeScript, Vue 3, Pinia, CodeMirror 6 (`StateField`, `ViewPlugin`, `Decoration.mark`), reka-ui/shadcn-vue `DropdownMenu`/`Popover`, JSZip, idb, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-spell-checker-design.md` (база — `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`).

## Global Constraints

- **Spelling only**, Russian and English, chapter text (NovLang source) only. CSS-редактор, метаданные и прочие поля не проверяются.
- Каждое слово проверяется словарём своей письменности: кириллица → `ru`, латиница → `en`, остальное (смешанные письменности, CJK, другие алфавиты) → не проверяется.
- **Warns and never blocks** export. Экспорт не меняется.
- «The book dictionary is not sent to Rust.» Словарь книги, «Пропустить» и настройки языков — только фильтр на фронтенде; в Rust нет состояния книги.
- Словари грузятся лениво, при первом запросе, в `spawn_blocking`; при старте приложения ничего не грузится.
- Изменение текста → проверка ~300 ms после последнего нажатия; при открытии книги — сначала открытая глава, затем остальные пачками ~2000 уникальных слов.
- `Book.dictionary: string[]` — отсортирован, уникален; пустой = файла нет. Первая буква регистронезависима (`Минжуй` принимает `минжуй`, не `МИНЖУЙ`), `ё` ≡ `е` для записей словаря. «Пропустить» — точное слово до закрытия книги, в файл не пишется.
- `dictionary.txt`: UTF-8, LF, одно слово в строке, отсортировано, уникально; позиция фиксирована после `styles/custom.css`, DEFLATE. `CURRENT_EDB_FORMAT_VERSION = 2`, новый app всегда пишет версию 2.
- Подчёркивание — волнистое, токен темы `--spelling` (красноватый, отличен от жёлтых предупреждений NovLang), в светлой и тёмной палитре; декорации только для `visibleRanges`; `spellcheck="false"` на редакторе главы.
- До 5 подсказок; подсказки запрашиваются только при открытии меню; замена — одна транзакция (Mod+Z отменяет).
- Настройки «Проверять орфографию» (вкл. по умолчанию) и языки ☑ Русский ☑ English — в настройках приложения, не в `.edb`.
- Ошибка загрузки словаря → код `spell.dictionaryLoad`, одно уведомление за сессию, плашка серая, редактирование не страдает, ошибка в логе. Неудачный `spell_check` → слова не кэшируются, следующая правка повторяет, лог `warn`.
- **Book text is never logged** — только количества слов и тайминги.
- `@tauri-apps/*` импортируется только в `services/platform/`; `services/spell` не импортирует `vue`/`pinia`/`@tauri-apps/*` (Oxlint). Компоненты не вызывают `services/platform` напрямую — через composables/stores.
- Строки UI — ключи в `ru`, `en`, `zh-CN` с совпадающим набором ключей.
- Сообщения PR/комментариев на GitHub — только на английском.

## Review Focus

1. **Правка во время проверки.** Пользователь печатает, пока `spell_check` в полёте: результат для старого текста не должен лечь со сдвинутыми смещениями. Ожидание: в редактор попадают только результаты, чей `source` совпадает с документом; старые подчёркивания сдвигаются вместе с текстом, а правленое слово теряет подчёркивание до новой проверки (Tasks 7, 8).
2. **Смена книги во время проверки** (в том числе та же UUID после «Восстановить»): результаты прошлой книги не попадают в новую, «Пропустить» сбрасывается (Task 7).
3. **ё, дефис, апостроф `’`, Заглавная/ВСЕ ЗАГЛАВНЫЕ** — Rust и фильтр словаря книги ведут себя предсказуемо: `ёлка`/`из-за`/`don’t`/`Привет` не подчёркиваются; запись `Алёна` принимает `Алена` (Tasks 1, 3).
4. **Файл версии 1 и восстановление.** Старый `.edb` открывается, сохраняется как v2; словарь переживает сохранение, повторное открытие и сессию восстановления IndexedDB; сессия без поля читается как пустой словарь (Tasks 4, 5).
5. **Нет словаря в бандле / битый словарь** — редактор работает, одно уведомление на сессию, плашка серая с подсказкой, при следующей книге повторного уведомления нет (Tasks 1, 7, 10).

## Решения и карта файлов

Рабочая ветка: `feat/spell-checker`, создана от `feat/kindle-css-check` (PR #11, база PR — `feat/azw3-export`). Upstream снят, чтобы push не ушёл в ветку PR #11; при первой публикации — `git push -u origin feat/spell-checker`. Если PR #11 будет влит раньше, ветку обновлять merge основной ветки (без force-push).

Уточнения к спецификации, принятые в плане:

- **Языки в настройках только фильтруют.** Токены проверяются для обоих языков всегда, выключенный язык скрывается в выдаче — так переключение не требует вызова Rust (§4.2 спеки). Выключенная проверка целиком (`enabled = false`) не вызывает Rust вообще.
- **«Подробнее»** у ошибки словаря: в приложении нет диалога для фоновых ошибок, кроме «непредвиденной ошибки». Поэтому уведомление — текст, а «подробнее» — это tooltip серой плашки и кнопка «Папка логов» в её popover.
- **Раздела «О программе» в приложении нет.** Благодарности словарям — подпись под настройками орфографии, README и `src-tauri/resources/dictionaries/README.md`.
- **Автосейв:** строка сессии восстановления перезаписывается при каждом автосейве целиком (как `customCss`), поэтому словарь кладётся в неё без отдельного множества changed/removed.
- **Rust-нормализация:** `’` → `'` перед проверкой; слово с `ё` при неудаче проверяется ещё раз с `е`; слово с дефисом при неудаче принимается, если принята каждая часть. Подсказки для слов длиннее 40 символов не ищутся (открытый пункт §11 спеки).
- **Словари** — LibreOffice dictionaries, коммит `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` (master на 2026-10-06): `ru_RU/ru_RU.{aff,dic}` (≈3,4 МБ, `SET UTF-8`), `en/en_US.{aff,dic}` (≈0,55 МБ, SCOWL 2020.12.07). Оба уже UTF-8 — `spellbook` принимает только `&str`, перекодирование не нужно, но проверяется тестом.
- `spellbook` — MPL-2.0, совместима с GPL-3.0; помечена автором как alpha, поэтому ru-поведение закрепляется Rust-тестами.

Файлы:

- Create `src-tauri/resources/dictionaries/{ru_RU.aff,ru_RU.dic,en_US.aff,en_US.dic,README.md,LICENSE-ru_RU.txt,LICENSE-en_US.txt}`.
- Create `src-tauri/src/spell.rs`, `src-tauri/src/__tests__/spell.rs`; Modify `src-tauri/src/error.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`.
- Create `src/types/spelling.ts`; Modify `src/types/platform.ts`.
- Create `src/services/platform/spell.ts`, `src/services/platform/memory-spell.ts`, `src/services/platform/__tests__/spell.test.ts`; Modify `src/services/platform/index.ts`.
- Create `src/services/spell/{tokenize,language,dictionary,summary}.ts` и `src/services/spell/__tests__/spell.test.ts`; Modify `oxlint.config.ts`, `vitest.config.ts`.
- Modify `src/types/book.ts`, `src/types/manifest.ts`, `src/services/edb/{read,write,migrations}.ts` и их тесты, `src/services/book/create.ts`; Create `src/services/book/dictionary.ts`, `src/services/book/__tests__/dictionary.test.ts`; Modify `src/stores/project.ts` (`snapshotBook`) и все места, где собирается `Book` (список выдаёт `vue-tsc`).
- Modify `src/services/platform/recovery.ts`, `src/services/platform/index.ts` (MemoryRecovery), `src/services/platform/__tests__/recovery.test.ts`.
- Modify `src/stores/settings.ts`, `src/components/settings/SettingsView.vue`, их тесты.
- Create `src/stores/spelling.ts`, `src/composables/use-spellcheck.ts`, `src/composables/__tests__/use-spellcheck.test.ts`; Modify `src/stores/__tests__/stores.test.ts`, `src/views/EditorView.vue`.
- Create `src/components/editor/spelling-decorations.ts` и тест; Modify `src/components/editor/SourceEditor.vue`, `src/assets/style.css`.
- Create `src/components/spelling/SpellingMenu.vue` и тест; Create `src/composables/use-spelling-actions.ts`.
- Create `src/components/spelling/SpellingPopover.vue` и тест; Modify `src/components/layout/StatusBar.vue`, `src/views/EditorView.vue`.
- Create `src/components/spelling/DictionaryView.vue` и тест; Modify `src/stores/layout.ts`, `src/components/sidebar/ExplorerView.vue`, `src/components/layout/Breadcrumbs.vue`, `src/views/EditorView.vue`.
- Modify `src/locales/{ru,en,zh-CN}.json`.
- Create `e2e/spelling.spec.ts`; Modify `README.md`, `docs/release-checklist.md`, `AGENTS.md`.

## Переиспользование (DRY)

- Debounce — `useDebounceFn` из `@vueuse/core` с `.cancel()`, как в `use-css-support.ts`; свой таймер не писать.
- Переход к слову из списка — существующий `selectSearchResult(chapterId, from, to)` в `EditorView.vue`; отдельный механизм фокуса не нужен.
- Изменения книги — `project.applyMutation(mutation)` с проверкой `mutation.book !== book` (как `moveChapter` в `ExplorerView`).
- Уведомление — `useNotificationsStore().add({ kind: "warning", message })`.
- Название главы в группах — `extractTitle()` + ключ `chapters.fallback`, как в `ExplorerView.chapterDisplayName`.
- Ошибки платформы — `appErrorFromUnknown(error, fallbackCode)`, как в `services/platform/fs.ts`.
- Rust-ошибки — расширить существующий `CommandError` (тот же формат `{ code, message }`), не заводить второй тип.
- Меню подсказок — shadcn `DropdownMenu` (клавиатура, фокус, `role="menuitem"` бесплатно), а не своё HTML-меню.

---

### Task 1: Rust-модуль `spell`, словари и команды

**Files:**

- Create: `src-tauri/resources/dictionaries/ru_RU.aff`, `ru_RU.dic`, `en_US.aff`, `en_US.dic`, `README.md`, `LICENSE-ru_RU.txt`, `LICENSE-en_US.txt`
- Create: `src-tauri/src/spell.rs`, `src-tauri/src/__tests__/spell.rs`
- Modify: `src-tauri/src/error.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

**Interfaces:**

- Produces (Rust): `spell::Lang` (`"ru" | "en"` в serde), `spell::SpellService::new(loader)`, `.check(lang, &[String]) -> Result<Vec<String>, CommandError>`, `.suggest(lang, &str) -> Result<Vec<String>, CommandError>`, `spell::read_pair(dir, lang)`.
- Produces (IPC): команда `spell_check { lang: "ru" | "en", words: string[] } → string[]` (подмножество с ошибками, в исходном порядке) и `spell_suggest { lang, word } → string[]` (≤ 5). Ошибки — `{ code: "spell.dictionaryLoad" | "spell.task", message }`.

- [ ] **Step 1: Скачать словари и записать источники**

```bash
mkdir -p src-tauri/resources/dictionaries
cd src-tauri/resources/dictionaries
REV=32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4
BASE=https://raw.githubusercontent.com/LibreOffice/dictionaries/$REV
curl -fsSLo ru_RU.aff $BASE/ru_RU/ru_RU.aff
curl -fsSLo ru_RU.dic $BASE/ru_RU/ru_RU.dic
curl -fsSLo LICENSE-ru_RU.txt $BASE/ru_RU/README_ru_RU.txt
curl -fsSLo en_US.aff $BASE/en/en_US.aff
curl -fsSLo en_US.dic $BASE/en/en_US.dic
curl -fsSLo LICENSE-en_US.txt $BASE/en/README_en_US.txt
head -1 ru_RU.aff en_US.aff   # ожидается: SET UTF-8 у обоих
shasum -a 256 *.aff *.dic
cd -
```

Записать в `src-tauri/resources/dictionaries/README.md` (подставить фактические SHA-256 из вывода):

```markdown
# Spelling dictionaries

Hunspell dictionaries bundled with the app and loaded by `src-tauri/src/spell.rs`.
Both files are UTF-8 (`SET UTF-8`); `spellbook` accepts UTF-8 only.

| File                     | Source                                                                                                                | Licence                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `ru_RU.aff`, `ru_RU.dic` | LibreOffice/dictionaries `ru_RU/` @ `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` — © 1997–2008 Alexander I. Lebedev     | BSD-style, see `LICENSE-ru_RU.txt`     |
| `en_US.aff`, `en_US.dic` | LibreOffice/dictionaries `en/` @ `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` — SCOWL 2020.12.07, Kevin Atkinson et al. | SCOWL licence, see `LICENSE-en_US.txt` |

SHA-256:

    <sha256>  en_US.aff
    <sha256>  en_US.dic
    <sha256>  ru_RU.aff
    <sha256>  ru_RU.dic

To update: change the revision in this table, re-download the four files and
the two licence files from the same revision, update the hashes, run
`cargo test spell` in `src-tauri`.
```

- [ ] **Step 2: Подключить крейт и ресурсы бандла**

`src-tauri/Cargo.toml`, в `[dependencies]`:

```toml
spellbook = "0.4.2"
```

`src-tauri/tauri.conf.json`, в `bundle` (после `"licenseFile"`):

```json
"resources": ["resources/dictionaries/*"],
```

Run: `cd src-tauri && cargo fetch && cd -`
Expected: в `Cargo.lock` появился `spellbook 0.4.2`.

- [ ] **Step 3: Написать падающие Rust-тесты**

`src-tauri/src/__tests__/spell.rs`:

```rust
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::spell::{read_pair, Lang, SpellService, MAX_SUGGESTIONS};

fn bundled() -> SpellService {
    SpellService::new(|lang| {
        read_pair(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/dictionaries"),
            lang,
        )
    })
}

fn words(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

#[test]
fn english_returns_only_misspelled_words_in_order() {
    let spell = bundled();
    let result = spell
        .check(Lang::En, &words(&["hello", "helo", "World", "wrold", "HELLO"]))
        .unwrap();
    assert_eq!(result, words(&["helo", "wrold"]));
}

#[test]
fn english_accepts_both_apostrophes_and_hyphenated_parts() {
    let spell = bundled();
    let result = spell
        .check(Lang::En, &words(&["don't", "don\u{2019}t", "well-known", "half-wrold"]))
        .unwrap();
    assert_eq!(result, words(&["half-wrold"]));
}

#[test]
fn russian_accepts_capitalised_yo_and_hyphenated_words() {
    let spell = bundled();
    let result = spell
        .check(
            Lang::Ru,
            &words(&["привет", "Привет", "превет", "ёлка", "Ёлка", "из-за", "кто-нибудь", "из-зо"]),
        )
        .unwrap();
    assert_eq!(result, words(&["превет", "из-зо"]));
}

#[test]
fn suggestions_are_limited_and_relevant() {
    let spell = bundled();
    let ru = spell.suggest(Lang::Ru, "превет").unwrap();
    assert!(ru.len() <= MAX_SUGGESTIONS);
    assert!(ru.iter().any(|item| item == "привет"), "{ru:?}");
    let en = spell.suggest(Lang::En, "helo").unwrap();
    assert!(en.len() <= MAX_SUGGESTIONS);
    assert!(en.iter().any(|item| item == "hello"), "{en:?}");
}

#[test]
fn long_words_get_no_suggestions() {
    let spell = bundled();
    let word = "а".repeat(41);
    assert!(spell.suggest(Lang::Ru, &word).unwrap().is_empty());
}

#[test]
fn load_failure_is_reported_with_its_code_and_not_retried() {
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = calls.clone();
    let spell = SpellService::new(move |_| {
        counter.fetch_add(1, Ordering::SeqCst);
        Err("missing".to_string())
    });
    let first = spell.check(Lang::Ru, &words(&["слово"])).unwrap_err();
    assert_eq!(first.code(), "spell.dictionaryLoad");
    let second = spell.suggest(Lang::Ru, "слово").unwrap_err();
    assert_eq!(second.code(), "spell.dictionaryLoad");
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn languages_load_independently() {
    let spell = SpellService::new(|lang| match lang {
        Lang::En => read_pair(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/dictionaries"),
            lang,
        ),
        Lang::Ru => Err("missing".to_string()),
    });
    assert!(spell.check(Lang::En, &words(&["hello"])).unwrap().is_empty());
    assert!(spell.check(Lang::Ru, &words(&["слово"])).is_err());
}

#[test]
#[ignore = "timing report: cargo test --release spell::tests::load_timing -- --ignored --nocapture"]
fn load_timing() {
    let spell = bundled();
    for lang in [Lang::Ru, Lang::En] {
        let start = Instant::now();
        spell.check(lang, &words(&["x"])).unwrap();
        println!("{lang:?} load: {:?}", start.elapsed());
    }
}
```

Run: `cd src-tauri && cargo test spell && cd -`
Expected: FAIL — `crate::spell` не существует.

- [ ] **Step 4: Расширить `CommandError`**

`src-tauri/src/error.rs` — новые варианты и коды:

```rust
    #[error("spelling dictionary {lang} could not be loaded: {message}")]
    DictionaryLoad { lang: String, message: String },
    #[error("spelling task failed: {message}")]
    SpellTask { message: String },
```

и в `code()`:

```rust
            Self::DictionaryLoad { .. } => "spell.dictionaryLoad",
            Self::SpellTask { .. } => "spell.task",
```

- [ ] **Step 5: Реализовать `spell.rs`**

```rust
#[cfg(test)]
#[path = "__tests__/spell.rs"]
mod tests;

use std::path::Path;
use std::sync::{Arc, OnceLock};

use serde::Deserialize;
use spellbook::Dictionary;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::CommandError;

pub const MAX_SUGGESTIONS: usize = 5;
/// Suggestions for very long words are slow with the Russian morphology and
/// rarely useful, so they are skipped.
pub const MAX_SUGGEST_CHARS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Ru,
    En,
}

impl Lang {
    fn file_stem(self) -> &'static str {
        match self {
            Lang::Ru => "ru_RU",
            Lang::En => "en_US",
        }
    }
}

type Loader = dyn Fn(Lang) -> Result<(String, String), String> + Send + Sync;

/// Base dictionaries only: the book dictionary and "Ignore" are a frontend filter.
pub struct SpellService {
    loader: Box<Loader>,
    ru: OnceLock<Result<Dictionary, String>>,
    en: OnceLock<Result<Dictionary, String>>,
}

impl SpellService {
    pub fn new(
        loader: impl Fn(Lang) -> Result<(String, String), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            loader: Box::new(loader),
            ru: OnceLock::new(),
            en: OnceLock::new(),
        }
    }

    fn dictionary(&self, lang: Lang) -> Result<&Dictionary, CommandError> {
        let cell = match lang {
            Lang::Ru => &self.ru,
            Lang::En => &self.en,
        };
        cell.get_or_init(|| {
            let (aff, dic) = (self.loader)(lang)?;
            Dictionary::new(&aff, &dic).map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|message| CommandError::DictionaryLoad {
            lang: lang.file_stem().to_string(),
            message: message.clone(),
        })
    }

    pub fn check(&self, lang: Lang, words: &[String]) -> Result<Vec<String>, CommandError> {
        let dictionary = self.dictionary(lang)?;
        Ok(words
            .iter()
            .filter(|word| !accepts(dictionary, word))
            .cloned()
            .collect())
    }

    pub fn suggest(&self, lang: Lang, word: &str) -> Result<Vec<String>, CommandError> {
        let dictionary = self.dictionary(lang)?;
        let word = normalize(word);
        if word.chars().count() > MAX_SUGGEST_CHARS {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        dictionary.suggest(&word, &mut out);
        out.truncate(MAX_SUGGESTIONS);
        Ok(out)
    }
}

fn normalize(word: &str) -> String {
    word.replace('\u{2019}', "'")
}

fn accepts(dictionary: &Dictionary, word: &str) -> bool {
    let word = normalize(word);
    accepts_whole(dictionary, &word)
        || (word.contains('-')
            && word
                .split('-')
                .all(|part| !part.is_empty() && accepts_whole(dictionary, part)))
}

fn accepts_whole(dictionary: &Dictionary, word: &str) -> bool {
    dictionary.check(word)
        || (word.contains(['ё', 'Ё'])
            && dictionary.check(&word.replace('ё', "е").replace('Ё', "Е")))
}

pub fn read_pair(dir: &Path, lang: Lang) -> Result<(String, String), String> {
    let read = |extension: &str| {
        let path = dir.join(format!("{}.{extension}", lang.file_stem()));
        std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))
    };
    Ok((read("aff")?, read("dic")?))
}

pub fn bundled_service<R: Runtime>(app: &AppHandle<R>) -> SpellService {
    let app = app.clone();
    SpellService::new(move |lang| {
        let dir = app
            .path()
            .resolve("resources/dictionaries", tauri::path::BaseDirectory::Resource)
            .map_err(|error| error.to_string())?;
        let start = std::time::Instant::now();
        let pair = read_pair(&dir, lang);
        log::debug!("spelling dictionary {lang:?} read in {:?}", start.elapsed());
        pair
    })
}

async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| CommandError::SpellTask {
            message: error.to_string(),
        })?
}

#[tauri::command(rename = "spell_check")]
pub async fn spell_check_command(
    state: State<'_, Arc<SpellService>>,
    lang: Lang,
    words: Vec<String>,
) -> Result<Vec<String>, CommandError> {
    let service = state.inner().clone();
    let count = words.len();
    let start = std::time::Instant::now();
    let result = run_blocking(move || service.check(lang, &words)).await;
    log::debug!("spell_check {lang:?}: {count} words in {:?}", start.elapsed());
    if let Err(error) = &result {
        log::error!("spell_check failed: {}", error.code());
    }
    result
}

#[tauri::command(rename = "spell_suggest")]
pub async fn spell_suggest_command(
    state: State<'_, Arc<SpellService>>,
    lang: Lang,
    word: String,
) -> Result<Vec<String>, CommandError> {
    let service = state.inner().clone();
    run_blocking(move || service.suggest(lang, &word)).await
}
```

`lib.rs`: добавить `mod spell;`, в `setup` до `handle_open_paths` — `app.manage(std::sync::Arc::new(spell::bundled_service(app.handle())));`, в `generate_handler!` — `spell::spell_check_command, spell::spell_suggest_command`. Логи не содержат слов — только количество и код.

- [ ] **Step 6: Прогнать Rust-тесты, clippy, fmt**

Run: `cd src-tauri && cargo test spell && cargo clippy --all-targets -- -D warnings && cargo fmt --check && cd -`
Expected: PASS. Если ru-слово из теста не принимается `spellbook` (alpha), **не менять ожидание молча**: проверить слово в Hunspell/LibreOffice с тем же словарём; если и там не принимается — заменить слово на принимаемое и записать причину в комментарии теста; если принимается — записать дефект `spellbook` в README словарей и обойти в `accepts`.

- [ ] **Step 7: Замерить загрузку**

Run: `cd src-tauri && cargo test --release spell::tests::load_timing -- --ignored --nocapture && cd -`
Expected: печатает время загрузки ru и en. Записать числа (и машину) в `src-tauri/resources/dictionaries/README.md`, раздел «Load time». Если ru > 3 s в release — сообщить пользователю до продолжения (спек предполагает «быстро»).

- [ ] **Step 8: Commit**

```bash
git add src-tauri
git commit -m "feat(spell): add Hunspell spell checking commands with bundled dictionaries"
```

---

### Task 2: Платформа фронтенда: `SpellChecker`, Tauri-адаптер и фейк

**Files:**

- Create: `src/types/spelling.ts`, `src/services/platform/spell.ts`, `src/services/platform/memory-spell.ts`, `src/services/platform/__tests__/spell.test.ts`
- Modify: `src/types/platform.ts`, `src/services/platform/index.ts`

**Interfaces:**

- Produces: `SpellLanguage = "ru" | "en"`, `SpellToken { word: string; from: number; to: number }`, `Misspelling extends SpellToken { lang: SpellLanguage }` в `src/types/spelling.ts`.
- Produces: `interface SpellChecker { check(lang: SpellLanguage, words: string[]): Promise<string[]>; suggest(lang: SpellLanguage, word: string): Promise<string[]> }` и поле `PlatformServices.spell: SpellChecker`.
- Produces: `tauriSpellChecker: SpellChecker`; `createMemorySpellChecker(options?: { known?: Iterable<string>; failLoad?: boolean }): SpellChecker & { calls: Array<{ lang: SpellLanguage; words: string[] }> }`; `DEFAULT_MEMORY_WORDS: readonly string[]`; `InMemoryPlatformOptions.spellWords?: string[]`, `InMemoryPlatformOptions.spellUnavailable?: boolean`.

- [ ] **Step 1: Написать падающие тесты**

`src/services/platform/__tests__/spell.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemorySpellChecker } from "../memory-spell";
import { createInMemoryPlatformServices } from "..";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("memory spell checker", () => {
  it("accepts known words regardless of first-letter case and records calls", async () => {
    const checker = createMemorySpellChecker({ known: ["мир", "world"] });
    expect(await checker.check("ru", ["мир", "Мир", "мирр"])).toEqual(["мирр"]);
    expect(checker.calls).toEqual([{ lang: "ru", words: ["мир", "Мир", "мирр"] }]);
  });
  it("suggests close known words, at most five", async () => {
    const checker = createMemorySpellChecker({ known: ["мир", "мира", "мирт"] });
    expect(await checker.suggest("ru", "мирр")).toEqual(["мир", "мира", "мирт"]);
  });
  it("fails with spell.dictionaryLoad when the dictionary is unavailable", async () => {
    const checker = createMemorySpellChecker({ failLoad: true });
    await expect(checker.check("en", ["x"])).rejects.toMatchObject({
      code: "spell.dictionaryLoad",
    });
  });
  it("is part of the in-memory platform", async () => {
    const services = createInMemoryPlatformServices({ spellWords: ["hello"] });
    expect(await services.spell.check("en", ["hello", "helo"])).toEqual(["helo"]);
  });
});

describe("tauri spell checker", () => {
  beforeEach(() => invoke.mockReset());
  it("calls the commands with lang and words", async () => {
    const { tauriSpellChecker } = await import("../spell");
    invoke.mockResolvedValueOnce(["helo"]);
    expect(await tauriSpellChecker.check("en", ["hello", "helo"])).toEqual(["helo"]);
    expect(invoke).toHaveBeenCalledWith("spell_check", { lang: "en", words: ["hello", "helo"] });
    invoke.mockResolvedValueOnce(["hello"]);
    await tauriSpellChecker.suggest("en", "helo");
    expect(invoke).toHaveBeenLastCalledWith("spell_suggest", { lang: "en", word: "helo" });
  });
  it("maps command errors to AppError", async () => {
    const { tauriSpellChecker } = await import("../spell");
    invoke.mockRejectedValueOnce({ code: "spell.dictionaryLoad", message: "missing" });
    await expect(tauriSpellChecker.check("ru", ["x"])).rejects.toMatchObject({
      name: "AppError",
      code: "spell.dictionaryLoad",
    });
  });
});
```

Run: `pnpm exec vitest run src/services/platform/__tests__/spell.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 2: Типы**

`src/types/spelling.ts`:

```ts
export type SpellLanguage = "ru" | "en";
export const SPELL_LANGUAGES: readonly SpellLanguage[] = ["ru", "en"];
export interface SpellToken {
  word: string;
  from: number;
  to: number;
}
export interface Misspelling extends SpellToken {
  lang: SpellLanguage;
}
```

`src/types/platform.ts` — импорт `SpellLanguage` и:

```ts
export interface SpellChecker {
  /** The misspelled subset of `words`, checked against the base dictionary only. */
  check(lang: SpellLanguage, words: string[]): Promise<string[]>;
  /** Up to five suggestions for one word. */
  suggest(lang: SpellLanguage, word: string): Promise<string[]>;
}
```

и `spell: SpellChecker;` в `PlatformServices`.

- [ ] **Step 3: Адаптер и фейк**

`src/services/platform/spell.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { appErrorFromUnknown } from "@/types/errors";
import type { SpellChecker } from "@/types/platform";

const adapt = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw appErrorFromUnknown(error, "spell.check");
  }
};
export const tauriSpellChecker: SpellChecker = {
  check: (lang, words) => adapt(() => invoke<string[]>("spell_check", { lang, words })),
  suggest: (lang, word) => adapt(() => invoke<string[]>("spell_suggest", { lang, word })),
};
```

`src/services/platform/memory-spell.ts`:

```ts
import { AppError } from "@/types/errors";
import type { SpellChecker } from "@/types/platform";
import type { SpellLanguage } from "@/types/spelling";

/** Words the e2e in-memory platform accepts; everything else is "misspelled". */
export const DEFAULT_MEMORY_WORDS: readonly string[] = [
  "глава",
  "мир",
  "и",
  "он",
  "сказал",
  "вышел",
  "chapter",
  "hello",
  "world",
  "the",
];
const lowerFirst = (word: string) => word.charAt(0).toLocaleLowerCase() + word.slice(1);

export function createMemorySpellChecker(
  options: { known?: Iterable<string>; failLoad?: boolean } = {},
): SpellChecker & { calls: Array<{ lang: SpellLanguage; words: string[] }> } {
  const known = new Set([...(options.known ?? DEFAULT_MEMORY_WORDS)].map(lowerFirst));
  const calls: Array<{ lang: SpellLanguage; words: string[] }> = [];
  const ensureLoaded = () => {
    if (options.failLoad)
      throw new AppError("spell.dictionaryLoad", "Spelling dictionary could not be loaded");
  };
  return {
    calls,
    async check(lang, words) {
      ensureLoaded();
      calls.push({ lang, words: [...words] });
      return words.filter((word) => !known.has(lowerFirst(word)));
    },
    async suggest(_lang, word) {
      ensureLoaded();
      const target = lowerFirst(word);
      return [...known]
        .filter((item) => item[0] === target[0] && Math.abs(item.length - target.length) <= 1)
        .filter((item) => item !== target)
        .slice(0, 5);
    },
  };
}
```

`src/services/platform/index.ts`: `spell: tauriSpellChecker` в `platformServices`; в `InMemoryPlatformOptions` — `spellWords?: string[]; spellUnavailable?: boolean;`; в `createInMemoryPlatformServices` — `spell: createMemorySpellChecker({ known: options.spellWords, failLoad: options.spellUnavailable })`.

- [ ] **Step 4: Прогнать тесты и типы**

Run: `pnpm exec vitest run src/services/platform/__tests__/spell.test.ts && pnpm exec vue-tsc --noEmit`
Expected: PASS. Если `vue-tsc` укажет тестовые фейки `PlatformServices` без `spell` — добавить им `spell: createMemorySpellChecker()`.

- [ ] **Step 5: Commit**

```bash
git add src/types src/services/platform
git commit -m "feat(spell): expose the spell checker through platform services"
```

---

### Task 3: Чистые функции `services/spell`

**Files:**

- Create: `src/services/spell/tokenize.ts`, `language.ts`, `dictionary.ts`, `summary.ts`, `src/services/spell/__tests__/spell.test.ts`
- Modify: `oxlint.config.ts`, `vitest.config.ts`

**Interfaces:**

- Consumes: типы Task 2.
- Produces: `tokenize(source: string): SpellToken[]`; `languageOf(word: string): SpellLanguage | null`; `dictionaryKey(word: string): string`; `createDictionaryIndex(words: readonly string[]): ReadonlySet<string>`; `isAccepted(word: string, index: ReadonlySet<string>, ignores: ReadonlySet<string>): boolean`; `summarizeMisspellings(items: readonly Misspelling[]): WordSummary[]` где `WordSummary { word: string; lang: SpellLanguage; count: number; first: Misspelling }`; `contextSnippet(source: string, from: number, to: number, radius?: number): { before: string; word: string; after: string }`.

- [ ] **Step 1: Написать падающие тесты**

`src/services/spell/__tests__/spell.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";
import { languageOf } from "../language";
import { createDictionaryIndex, isAccepted } from "../dictionary";
import { contextSnippet, summarizeMisspellings } from "../summary";

const words = (source: string) => tokenize(source).map((token) => token.word);

describe("tokenize", () => {
  it("returns words with offsets into the source", () => {
    const source = "Он **сказал** и *вышел*.";
    const tokens = tokenize(source);
    expect(tokens.map((token) => source.slice(token.from, token.to))).toEqual([
      "Он",
      "сказал",
      "и",
      "вышел",
    ]);
    expect(tokens.map((token) => token.word)).toEqual(["Он", "сказал", "и", "вышел"]);
  });
  it("skips block prefixes and footnote markup but checks their text", () => {
    expect(words("# Глава один\n> цитата\n[^note]: текст сноски\nслово[^abc] дальше")).toEqual([
      "Глава",
      "один",
      "цитата",
      "текст",
      "сноски",
      "слово",
      "дальше",
    ]);
  });
  it("checks image alt text and skips the image path", () => {
    expect(words("![красный дракон](images/red-dragon_01.png) после")).toEqual([
      "красный",
      "дракон",
      "после",
    ]);
  });
  it("keeps inner hyphens and apostrophes, drops edge ones", () => {
    expect(words("из-за кто-нибудь don't rock’n’roll -край- 'quoted'")).toEqual([
      "из-за",
      "кто-нибудь",
      "don't",
      "rock’n’roll",
      "край",
      "quoted",
    ]);
  });
  it("skips tokens with digits or underscores, and scene breaks", () => {
    expect(words("глава2 3D 2026 snake_case\n***\nслово")).toEqual(["слово"]);
  });
  it("handles CRLF-free empty and markup-only sources", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("***\n\n> \n")).toEqual([]);
  });
});

describe("languageOf", () => {
  it("maps scripts to languages", () => {
    expect(languageOf("слово")).toBe("ru");
    expect(languageOf("из-за")).toBe("ru");
    expect(languageOf("ёлка")).toBe("ru");
    expect(languageOf("don't")).toBe("en");
    expect(languageOf("Café")).toBe("en");
    expect(languageOf("словоword")).toBeNull();
    expect(languageOf("北京")).toBeNull();
    expect(languageOf("λόγος")).toBeNull();
  });
});

describe("book dictionary matching", () => {
  const index = createDictionaryIndex(["Минжуй", "Алёна", "дао"]);
  const none = new Set<string>();
  it("ignores first-letter case but not all caps", () => {
    expect(isAccepted("Минжуй", index, none)).toBe(true);
    expect(isAccepted("минжуй", index, none)).toBe(true);
    expect(isAccepted("МИНЖУЙ", index, none)).toBe(false);
    expect(isAccepted("Дао", index, none)).toBe(true);
  });
  it("treats ё and е as equal in both directions", () => {
    expect(isAccepted("Алена", index, none)).toBe(true);
    expect(isAccepted("Алёна", createDictionaryIndex(["Алена"]), none)).toBe(true);
  });
  it("accepts ignored words exactly", () => {
    const ignores = new Set(["Минжуи"]);
    expect(isAccepted("Минжуи", index, ignores)).toBe(true);
    expect(isAccepted("минжуи", index, ignores)).toBe(false);
  });
});

describe("summary", () => {
  it("groups by word in first-occurrence order with counts", () => {
    const items = [
      { word: "Минжуи", lang: "ru" as const, from: 0, to: 6 },
      { word: "превет", lang: "ru" as const, from: 10, to: 16 },
      { word: "Минжуи", lang: "ru" as const, from: 20, to: 26 },
    ];
    expect(summarizeMisspellings(items)).toEqual([
      { word: "Минжуи", lang: "ru", count: 2, first: items[0] },
      { word: "превет", lang: "ru", count: 1, first: items[1] },
    ]);
  });
  it("cuts context at the radius and at line breaks", () => {
    const source = "первая строка\nон сказал Минжуи и вышел из дома очень надолго";
    const from = source.indexOf("Минжуи");
    expect(contextSnippet(source, from, from + 6, 10)).toEqual({
      before: "он сказал ",
      word: "Минжуи",
      after: " и вышел …",
    });
    expect(contextSnippet("а".repeat(50) + "Х", 50, 51, 5)).toEqual({
      before: "…ааааа",
      word: "Х",
      after: "",
    });
  });
});
```

Run: `pnpm exec vitest run src/services/spell`
Expected: FAIL — модулей нет.

- [ ] **Step 2: Реализовать `tokenize.ts`**

```ts
import type { SpellToken } from "@/types/spelling";

// NovLang markup whose letters are not prose: footnote ids and image paths.
const FOOTNOTE_DEF = /^\[\^[^\]\s]+\]:[ \t]?/gm;
const FOOTNOTE_REF = /\[\^[^\]\s]+\]/g;
const IMAGE_TARGET = /!\[[^\]\n]*\](\([^)\n]*\))/g;
// Letters with inner hyphens or apostrophes; digits and `_` are captured so the
// whole token can be dropped instead of checking its letter part.
const TOKEN = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const NOT_PROSE = /[\p{N}_]/u;

function skippedRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of [FOOTNOTE_DEF, FOOTNOTE_REF])
    for (const match of source.matchAll(pattern))
      ranges.push([match.index, match.index + match[0].length]);
  for (const match of source.matchAll(IMAGE_TARGET)) {
    const end = match.index + match[0].length;
    ranges.push([end - match[1]!.length, end]);
  }
  return ranges;
}

/** Words of a NovLang chapter with UTF-16 offsets, as CodeMirror counts them. */
export function tokenize(source: string): SpellToken[] {
  const skipped = skippedRanges(source);
  const tokens: SpellToken[] = [];
  for (const match of source.matchAll(TOKEN)) {
    const from = match.index;
    const to = from + match[0].length;
    if (NOT_PROSE.test(match[0])) continue;
    if (skipped.some(([start, end]) => from < end && to > start)) continue;
    tokens.push({ word: match[0], from, to });
  }
  return tokens;
}
```

- [ ] **Step 3: Реализовать `language.ts`, `dictionary.ts`, `summary.ts`**

`language.ts`:

```ts
import type { SpellLanguage } from "@/types/spelling";

const CYRILLIC = /^[\p{Script=Cyrillic}\p{M}'’-]+$/u;
const LATIN = /^[\p{Script=Latin}\p{M}'’-]+$/u;

export function languageOf(word: string): SpellLanguage | null {
  if (CYRILLIC.test(word)) return "ru";
  if (LATIN.test(word)) return "en";
  return null;
}
```

`dictionary.ts`:

```ts
/** The book-dictionary form of a word: ё as е, first letter lower-cased. */
export function dictionaryKey(word: string): string {
  const plain = word.replace(/ё/g, "е").replace(/Ё/g, "Е");
  return plain.charAt(0).toLocaleLowerCase() + plain.slice(1);
}
export function createDictionaryIndex(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map(dictionaryKey));
}
export function isAccepted(
  word: string,
  index: ReadonlySet<string>,
  ignores: ReadonlySet<string>,
): boolean {
  return ignores.has(word) || index.has(dictionaryKey(word));
}
```

`summary.ts`:

```ts
import type { Misspelling, SpellLanguage } from "@/types/spelling";

export interface WordSummary {
  word: string;
  lang: SpellLanguage;
  count: number;
  first: Misspelling;
}
export function summarizeMisspellings(items: readonly Misspelling[]): WordSummary[] {
  const byWord = new Map<string, WordSummary>();
  for (const item of items) {
    const entry = byWord.get(item.word);
    if (entry) entry.count++;
    else byWord.set(item.word, { word: item.word, lang: item.lang, count: 1, first: item });
  }
  return [...byWord.values()];
}
export function contextSnippet(source: string, from: number, to: number, radius = 30) {
  const lineStart = source.lastIndexOf("\n", from - 1) + 1;
  const lineEndIndex = source.indexOf("\n", to);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const start = Math.max(lineStart, from - radius);
  const end = Math.min(lineEnd, to + radius);
  return {
    before: (start > lineStart ? "…" : "") + source.slice(start, from),
    word: source.slice(from, to),
    after: source.slice(to, end) + (end < lineEnd ? "…" : ""),
  };
}
```

- [ ] **Step 4: Границы импортов и coverage**

`oxlint.config.ts`: в трёх glob-списках `{book,edb,epub,azw3,export,search,checks,css-support}` добавить `spell` → `{book,edb,epub,azw3,export,search,checks,css-support,spell}`. `vitest.config.ts`: в `coverage.include` добавить `"src/services/spell/**/*.ts"`.

- [ ] **Step 5: Прогнать тесты и линт**

Run: `pnpm exec vitest run src/services/spell && pnpm lint`
Expected: PASS. Если ожидание `contextSnippet` расходится только пробелами на краях — исправить реализацию, а не тест: пробелы вокруг слова в сниппете сохраняются.

- [ ] **Step 6: Commit**

```bash
git add src/services/spell oxlint.config.ts vitest.config.ts
git commit -m "feat(spell): tokenize NovLang text and match the book dictionary"
```

---

### Task 4: `Book.dictionary` и формат `.edb` версии 2

**Files:**

- Modify: `src/types/book.ts`, `src/types/manifest.ts`, `src/services/edb/read.ts`, `src/services/edb/write.ts`, `src/services/edb/migrations.ts`, `src/services/edb/__tests__/read.test.ts`, `src/services/edb/__tests__/write.test.ts`, `src/services/edb/__tests__/fixtures.ts`, `src/services/book/create.ts`, `src/stores/project.ts`, все места сборки `Book` (по `vue-tsc`, сейчас: `src/services/epub/build.ts`, `src/services/platform/{recovery,index}.ts`, `scripts/build-fixture-epubs.mts`, тестовые фикстуры)
- Create: `src/services/book/dictionary.ts`, `src/services/book/__tests__/dictionary.test.ts`

**Interfaces:**

- Produces: `Book.dictionary: string[]`; `normalizeDictionary(words: Iterable<string>): string[]`; `parseDictionaryText(text: string): string[]`; `serializeDictionary(words: readonly string[]): string`; `isDictionaryWord(word: string): boolean`; `addToDictionary(book: Book, word: string): BookMutation`; `removeFromDictionary(book: Book, word: string): BookMutation` (без изменений возвращают мутацию с тем же объектом `book`).
- Produces: `CURRENT_EDB_FORMAT_VERSION = 2`.

- [ ] **Step 1: Падающие тесты операций словаря**

`src/services/book/__tests__/dictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBook } from "../create";
import {
  addToDictionary,
  isDictionaryWord,
  normalizeDictionary,
  parseDictionaryText,
  removeFromDictionary,
  serializeDictionary,
} from "../dictionary";

const book = () =>
  createBook({
    locale: "ru",
    now: "2026-10-06T00:00:00Z",
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });

describe("book dictionary", () => {
  it("starts empty", () => expect(book().dictionary).toEqual([]));
  it("normalizes: trim, drop empties and duplicates, code-point sort", () => {
    expect(normalizeDictionary([" Минжуй ", "", "дао", "Минжуй", "Ann"])).toEqual([
      "Ann",
      "Минжуй",
      "дао",
    ]);
  });
  it("parses CRLF text and serializes with a trailing LF", () => {
    expect(parseDictionaryText("дао\r\n\r\nМинжуй\nдао\n")).toEqual(["Минжуй", "дао"]);
    expect(serializeDictionary(["Минжуй", "дао"])).toBe("Минжуй\nдао\n");
  });
  it("accepts single words only", () => {
    expect(isDictionaryWord("из-за")).toBe(true);
    expect(isDictionaryWord("два слова")).toBe(false);
    expect(isDictionaryWord("  ")).toBe(false);
  });
  it("adds and removes without touching chapters", () => {
    const start = book();
    const added = addToDictionary(start, "Минжуй");
    expect(added.book.dictionary).toEqual(["Минжуй"]);
    expect(added.changedChapters.size).toBe(0);
    expect(addToDictionary(added.book, "Минжуй").book).toBe(added.book);
    expect(addToDictionary(start, "два слова").book).toBe(start);
    const removed = removeFromDictionary(added.book, "Минжуй");
    expect(removed.book.dictionary).toEqual([]);
    expect(removeFromDictionary(removed.book, "Минжуй").book).toBe(removed.book);
  });
});
```

Run: `pnpm exec vitest run src/services/book/__tests__/dictionary.test.ts`
Expected: FAIL.

- [ ] **Step 2: Падающие тесты `.edb`**

В `src/services/edb/__tests__/write.test.ts` добавить (используя хелперы файла для сборки книги и чтения архива):

```ts
it("writes dictionary.txt after custom.css and format version 2", async () => {
  const bytes = await writeEdb(
    { ...sampleBook(), customCss: "p{}", dictionary: ["Минжуй", "дао"] },
    now,
  );
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files);
  expect(paths.at(-1)).toBe("dictionary.txt");
  expect(paths.at(-2)).toBe("styles/custom.css");
  expect(await zip.file("dictionary.txt")!.async("string")).toBe("Минжуй\nдао\n");
  expect(JSON.parse(await zip.file("manifest.json")!.async("string")).formatVersion).toBe(2);
});
it("omits dictionary.txt for an empty dictionary", async () => {
  const zip = await JSZip.loadAsync(await writeEdb({ ...sampleBook(), dictionary: [] }, now));
  expect(zip.file("dictionary.txt")).toBeNull();
});
```

В `read.test.ts`:

```ts
it("reads and normalizes dictionary.txt", async () => {
  const result = await readEdb(
    await archive({
      "manifest.json": manifest({ formatVersion: 2 }),
      "dictionary.txt": "дао\r\n\r\nМинжуй\nдао",
    }),
    deps,
  );
  expect(result.book.dictionary).toEqual(["Минжуй", "дао"]);
});
it("migrates a version 1 file to an empty dictionary", async () => {
  const result = await readEdb(
    await archive({ "manifest.json": manifest({ formatVersion: 1 }) }),
    deps,
  );
  expect(result.migrated).toBe(true);
  expect(result.book.dictionary).toEqual([]);
});
it("roundtrips the dictionary", async () => {
  const written = await writeEdb(
    {
      ...(await readEdb(await archive({ "manifest.json": manifest() }), deps)).book,
      dictionary: ["Минжуй"],
    },
    new Date(),
  );
  expect((await readEdb(written, deps)).book.dictionary).toEqual(["Минжуй"]);
});
```

Существующие тесты: `manifest({ formatVersion: 2 })` для «too new» → `3`; фикстура `formatVersion: 1` в `fixtures.ts` → `2`; ожидания `migrated` для версии 0 остаются `true`. Найти все: `grep -rn "formatVersion" src/services/edb/__tests__`.

Run: `pnpm exec vitest run src/services/edb`
Expected: FAIL.

- [ ] **Step 3: Реализация модели и операций**

`src/types/book.ts` — в `Book`: `/** Book spelling dictionary: sorted, unique; empty means no file. */ dictionary: string[];`.

`src/services/book/dictionary.ts`:

```ts
import type { Book, BookMutation } from "@/types/book";

const mutation = (book: Book): BookMutation => ({
  book,
  changedChapters: new Set(),
  removedChapters: new Set(),
  changedResources: new Set(),
  removedResources: new Set(),
});
// Code-point order: the same on every OS and locale, so the file diffs cleanly.
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function normalizeDictionary(words: Iterable<string>): string[] {
  return [...new Set([...words].map((word) => word.trim()).filter(Boolean))].sort(byCodePoint);
}
export function parseDictionaryText(text: string): string[] {
  return normalizeDictionary(text.replace(/\r\n?/g, "\n").split("\n"));
}
export function serializeDictionary(words: readonly string[]): string {
  return words.map((word) => `${word}\n`).join("");
}
export function isDictionaryWord(word: string): boolean {
  const value = word.trim();
  return value.length > 0 && !/\s/u.test(value);
}
export function addToDictionary(book: Book, word: string): BookMutation {
  const value = word.trim();
  if (!isDictionaryWord(value) || book.dictionary.includes(value)) return mutation(book);
  return mutation({ ...book, dictionary: normalizeDictionary([...book.dictionary, value]) });
}
export function removeFromDictionary(book: Book, word: string): BookMutation {
  if (!book.dictionary.includes(word)) return mutation(book);
  return mutation({ ...book, dictionary: book.dictionary.filter((item) => item !== word) });
}
```

`create.ts` — `dictionary: []`. `project.ts` `snapshotBook` — `dictionary: [...book.dictionary]`.

- [ ] **Step 4: Реализация `.edb`**

`src/types/manifest.ts`: `export const CURRENT_EDB_FORMAT_VERSION = 2;`.

`migrations.ts`:

```ts
export function migrateManifest(manifest: ManifestEnvelope, fromVersion: number): ManifestEnvelope {
  let current = { ...manifest };
  if (fromVersion === 0) current = { ...current, formatVersion: 1 };
  // 1 → 2 adds the optional dictionary.txt; an absent file is an empty dictionary.
  if (current.formatVersion === 1) current = { ...current, formatVersion: 2 };
  if (current.formatVersion !== CURRENT_EDB_FORMAT_VERSION)
    throw new AppError("edb.unsupportedVersion", `Unsupported migration from ${fromVersion}`);
  return current;
}
```

(импорт `CURRENT_EDB_FORMAT_VERSION` из `@/types/manifest`).

`read.ts`: после чтения CSS:

```ts
const dictionaryFile = zip.file("dictionary.txt");
```

и в `book`: `dictionary: dictionaryFile ? parseDictionaryText(await dictionaryFile.async("string")) : [],`.

`write.ts`: после блока `styles/custom.css`:

```ts
if (book.dictionary.length)
  entries.push({
    path: "dictionary.txt",
    bytes: utf8(serializeDictionary(normalizeDictionary(book.dictionary))),
    binary: false,
  });
```

- [ ] **Step 5: Прогнать `vue-tsc` и добавить поле во все сборки `Book`**

Run: `pnpm exec vue-tsc --noEmit`
Expected: ошибки «Property 'dictionary' is missing» — в каждом указанном месте добавить `dictionary: []` (в `recovery.ts`/`index.ts` пока `dictionary: []`; Task 5 заменит). `scripts/build-fixture-epubs.mts` проверяется `pnpm exec tsc --noEmit -p scripts` если такой tsconfig есть, иначе `pnpm build:fixture-epubs` в Task 12.

- [ ] **Step 6: Прогнать тесты**

Run: `pnpm exec vitest run src/services/book src/services/edb src/stores && pnpm exec vue-tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src scripts
git commit -m "feat(edb): store the book spelling dictionary in format version 2"
```

---

### Task 5: Словарь в сессии восстановления

**Files:**

- Modify: `src/services/platform/recovery.ts`, `src/services/platform/index.ts` (`MemoryRecovery`), `src/services/platform/__tests__/recovery.test.ts`

**Interfaces:**

- Consumes: `Book.dictionary`, `normalizeDictionary` (Task 4).
- Produces: строка `sessions` получает необязательное `dictionary?: string[]`; `restore()` всегда возвращает `dictionary: string[]`.

- [ ] **Step 1: Падающие тесты** (в `recovery.test.ts`, тем же `fake-indexeddb`-окружением файла)

```ts
it("keeps the dictionary in the session", async () => {
  const store = createRecoveryStore();
  const book = { ...sampleBook(), dictionary: ["Минжуй"] };
  await store.writeChanges(book, emptyDelta());
  expect((await store.restore(book.metadata.id))?.dictionary).toEqual(["Минжуй"]);
  await store.writeChanges({ ...book, dictionary: [] }, emptyDelta());
  expect((await store.restore(book.metadata.id))?.dictionary).toEqual([]);
});
it("reads a session written before dictionaries as an empty dictionary", async () => {
  const store = createRecoveryStore();
  const book = sampleBook();
  await store.writeChanges(book, emptyDelta());
  const db = await openDB("edb-recovery", 1);
  const row = await db.get("sessions", book.metadata.id);
  delete row.dictionary;
  await db.put("sessions", row);
  db.close();
  expect((await store.restore(book.metadata.id))?.dictionary).toEqual([]);
});
it("memory recovery keeps the dictionary too", async () => {
  const { recovery } = createInMemoryPlatformServices();
  const book = { ...sampleBook(), dictionary: ["дао"] };
  await recovery.writeChanges(book, emptyDelta());
  expect((await recovery.restore(book.metadata.id))?.dictionary).toEqual(["дао"]);
});
```

(`sampleBook`/`emptyDelta` — существующие хелперы файла или добавить: `createBook(...)` и четыре пустых `Set`.)

Run: `pnpm exec vitest run src/services/platform/__tests__/recovery.test.ts`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`recovery.ts`: `SessionRow` — `dictionary?: string[];`; в `put` — `dictionary: book.dictionary,`; в `restore` — `dictionary: Array.isArray(session.dictionary) ? normalizeDictionary(session.dictionary) : [],`. Версию базы (`1`) не менять: новое поле необязательно, схема хранилищ та же.

`index.ts` `MemoryRecovery`: в тип сессии `dictionary: string[]`, в `writeChanges` — `dictionary: [...book.dictionary]`, в `restore` — `dictionary: [...session.dictionary]`.

- [ ] **Step 3: Прогнать тесты**

Run: `pnpm exec vitest run src/services/platform src/composables/__tests__/use-autosave.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/platform
git commit -m "feat(recovery): keep the book dictionary in recovery sessions"
```

---

### Task 6: Настройки орфографии и локали

**Files:**

- Modify: `src/stores/settings.ts`, `src/components/settings/SettingsView.vue`, `src/components/settings/__tests__/SettingsView.test.ts`, `src/stores/__tests__/stores.test.ts`, `src/locales/{ru,en,zh-CN}.json`

**Interfaces:**

- Produces: `SpellingSettings { enabled: boolean; languages: Record<SpellLanguage, boolean> }`, `settings.spelling: Ref<SpellingSettings>`, `settings.setSpelling(patch: { enabled?: boolean; languages?: Partial<Record<SpellLanguage, boolean>> }): Promise<void>`; ключ хранилища `"spelling"`.
- Produces: все локальные ключи фичи (используются Tasks 7–11).

- [ ] **Step 1: Падающие тесты**

`stores.test.ts`:

```ts
it("loads spelling settings with defaults and persists patches", async () => {
  const repository = memorySettings(); // существующий хелпер файла или createInMemoryPlatformServices().settings
  const settings = useSettingsStore();
  settings.configure(repository);
  await settings.load();
  expect(settings.spelling).toEqual({ enabled: true, languages: { ru: true, en: true } });
  await settings.setSpelling({ languages: { en: false } });
  expect(settings.spelling).toEqual({ enabled: true, languages: { ru: true, en: false } });
  expect(await repository.get("spelling", null)).toEqual(settings.spelling);
});
```

`SettingsView.test.ts`:

```ts
it("toggles spelling and its languages", async () => {
  const { settings, user } = renderSettings(); // хелпер файла
  await user.click(screen.getByRole("switch", { name: "Check spelling" }));
  expect(settings.spelling.enabled).toBe(false);
  expect(screen.getByRole("checkbox", { name: "English" })).toBeDisabled();
  await user.click(screen.getByRole("switch", { name: "Check spelling" }));
  await user.click(screen.getByRole("checkbox", { name: "English" }));
  expect(settings.spelling.languages.en).toBe(false);
  expect(screen.getByText(/LibreOffice/)).toBeInTheDocument();
});
```

Run: `pnpm exec vitest run src/stores/__tests__/stores.test.ts src/components/settings`
Expected: FAIL.

- [ ] **Step 2: Store**

`settings.ts`:

```ts
export interface SpellingSettings {
  enabled: boolean;
  languages: Record<SpellLanguage, boolean>;
}
const defaultSpelling: SpellingSettings = { enabled: true, languages: { ru: true, en: true } };
```

`spelling = ref<SpellingSettings>(structuredClone(defaultSpelling))`; в `load()`:

```ts
const storedSpelling = await repository?.get<Partial<SpellingSettings>>("spelling", {});
spelling.value = {
  enabled: storedSpelling?.enabled ?? true,
  languages: { ...defaultSpelling.languages, ...storedSpelling?.languages },
};
```

в `persist()` — `await repository?.set("spelling", spelling.value);`; новое действие:

```ts
async function setSpelling(patch: {
  enabled?: boolean;
  languages?: Partial<Record<SpellLanguage, boolean>>;
}) {
  spelling.value = {
    enabled: patch.enabled ?? spelling.value.enabled,
    languages: { ...spelling.value.languages, ...patch.languages },
  };
  await repository?.set("spelling", spelling.value);
}
```

вернуть `spelling`, `setSpelling`.

- [ ] **Step 3: Локали**

Добавить во все три файла (новые объекты верхнего уровня `spelling`, `dictionary`; ключи в существующие `settings`, `explorer`):

en:

```json
"spelling": {
  "badge": "{count} spelling issue | {count} spelling issues",
  "checking": "Checking spelling…",
  "unavailable": "Spell checking is unavailable",
  "unavailableHint": "The dictionaries could not be loaded. Details are in the log.",
  "openLogs": "Log folder",
  "none": "No spelling issues",
  "chapterGroup": "Chapter {number} · {title} — {count}",
  "occurrences": "×{count}",
  "addToDictionary": "Add to book dictionary",
  "ignore": "Ignore",
  "noSuggestions": "No suggestions",
  "loadingSuggestions": "Looking for suggestions…",
  "menuLabel": "Spelling: {word}"
},
"dictionary": {
  "title": "Book dictionary",
  "filter": "Filter words",
  "newWord": "New word",
  "add": "Add word",
  "remove": "Remove {word}",
  "empty": "The book dictionary is empty",
  "noMatches": "No matching words",
  "invalid": "Enter one word without spaces"
}
```

`settings`: `"spelling": "Check spelling"`, `"spellingLanguages": "Spelling languages"`, `"spellingRussian": "Russian"`, `"spellingEnglish": "English"`, `"spellingCredits": "Dictionaries: LibreOffice ru_RU (© Alexander I. Lebedev, BSD licence) and SCOWL en_US (© Kevin Atkinson and others)."`; `explorer`: `"dictionary": "Dictionary"`.

ru:

```json
"spelling": {
  "badge": "{count} орфографическая ошибка | {count} орфографические ошибки | {count} орфографических ошибок",
  "checking": "Проверка орфографии…",
  "unavailable": "Проверка орфографии недоступна",
  "unavailableHint": "Не удалось загрузить словари. Подробности — в логе.",
  "openLogs": "Папка логов",
  "none": "Орфографических ошибок нет",
  "chapterGroup": "Глава {number} · {title} — {count}",
  "occurrences": "×{count}",
  "addToDictionary": "Добавить в словарь книги",
  "ignore": "Пропустить",
  "noSuggestions": "Нет вариантов",
  "loadingSuggestions": "Ищем варианты…",
  "menuLabel": "Орфография: {word}"
},
"dictionary": {
  "title": "Словарь книги",
  "filter": "Фильтр слов",
  "newWord": "Новое слово",
  "add": "Добавить слово",
  "remove": "Удалить {word}",
  "empty": "Словарь книги пуст",
  "noMatches": "Нет подходящих слов",
  "invalid": "Введите одно слово без пробелов"
}
```

`settings`: `"spelling": "Проверять орфографию"`, `"spellingLanguages": "Языки проверки"`, `"spellingRussian": "Русский"`, `"spellingEnglish": "English"`, `"spellingCredits": "Словари: LibreOffice ru_RU (© Александр Лебедев, лицензия BSD) и SCOWL en_US (© Kevin Atkinson и др.)."`; `explorer`: `"dictionary": "Словарь"`.

zh-CN:

```json
"spelling": {
  "badge": "{count} 个拼写问题",
  "checking": "正在检查拼写…",
  "unavailable": "拼写检查不可用",
  "unavailableHint": "无法加载词典。详细信息见日志。",
  "openLogs": "日志文件夹",
  "none": "没有拼写问题",
  "chapterGroup": "第 {number} 章 · {title} — {count}",
  "occurrences": "×{count}",
  "addToDictionary": "添加到本书词典",
  "ignore": "忽略",
  "noSuggestions": "没有建议",
  "loadingSuggestions": "正在查找建议…",
  "menuLabel": "拼写：{word}"
},
"dictionary": {
  "title": "本书词典",
  "filter": "筛选词语",
  "newWord": "新词",
  "add": "添加词语",
  "remove": "删除 {word}",
  "empty": "本书词典为空",
  "noMatches": "没有匹配的词语",
  "invalid": "请输入一个不含空格的词"
}
```

`settings`: `"spelling": "检查拼写"`, `"spellingLanguages": "拼写检查语言"`, `"spellingRussian": "Русский（俄语）"`, `"spellingEnglish": "English（英语）"`, `"spellingCredits": "词典：LibreOffice ru_RU（© Alexander I. Lebedev，BSD 许可）和 SCOWL en_US（© Kevin Atkinson 等）。"`; `explorer`: `"dictionary": "词典"`.

- [ ] **Step 4: SettingsView**

В карточке «Editor» после поля `settings-confirm-delete`:

```vue
<Field orientation="horizontal">
  <Label for="settings-spelling" class="flex-auto">
    {{ t("settings.spelling", "Check spelling") }}
  </Label>
  <Switch
    id="settings-spelling"
    :model-value="settings.spelling.enabled"
    @update:model-value="(value: boolean) => settings.setSpelling({ enabled: value })"
  />
</Field>
<FieldSet>
  <FieldLegend variant="label">{{ t("settings.spellingLanguages", "Spelling languages") }}</FieldLegend>
  <Field v-for="language in spellingLanguages" :key="language.value" orientation="horizontal">
    <Checkbox
      :id="`settings-spelling-${language.value}`"
      :model-value="settings.spelling.languages[language.value]"
      :disabled="!settings.spelling.enabled"
      @update:model-value="(value) => settings.setSpelling({ languages: { [language.value]: value === true } })"
    />
    <Label :for="`settings-spelling-${language.value}`">{{ t(language.key, language.fallback) }}</Label>
  </Field>
</FieldSet>
<p class="text-xs text-muted-foreground">
  {{ t("settings.spellingCredits", "Dictionaries: LibreOffice ru_RU and SCOWL en_US.") }}
</p>
```

в `<script>`: импорт `Checkbox` из `@/components/ui/checkbox` и

```ts
const spellingLanguages = [
  { value: "ru", key: "settings.spellingRussian", fallback: "Russian" },
  { value: "en", key: "settings.spellingEnglish", fallback: "English" },
] as const;
```

Проверить в `FieldLegend` наличие prop `variant` (`src/components/ui/field/FieldLegend.vue`); если нет — без него.

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm exec vitest run src/stores src/components/settings src/plugins`
Expected: PASS, включая проверку совпадения ключей локалей в `src/plugins/__tests__/i18n.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/stores src/components/settings src/locales
git commit -m "feat(spell): add spelling settings and translations"
```

---

### Task 7: `stores/spelling` и `useSpellcheck`

**Files:**

- Create: `src/stores/spelling.ts`, `src/composables/use-spellcheck.ts`, `src/composables/__tests__/use-spellcheck.test.ts`
- Modify: `src/views/EditorView.vue`, `src/stores/__tests__/stores.test.ts`

**Interfaces:**

- Consumes: Tasks 2, 3, 4, 6.
- Produces (store `useSpellingStore`):
  - `status: Ref<"idle" | "checking" | "unavailable">`;
  - `chapters: ShallowRef<Map<string, ChapterSpelling>>`, `ChapterSpelling { source: string; items: Misspelling[] }` — сырые ошибки базового словаря;
  - `visible: ComputedRef<Map<string, ChapterSpelling>>` — после фильтров (настройки, словарь книги, «Пропустить»), только главы с непустым списком;
  - `total: ComputedRef<number>`;
  - `cached(lang, word): boolean | undefined`, `remember(lang, words: string[], misspelled: ReadonlySet<string>): void`;
  - `setChapter(id, source, items)`, `removeChapter(id)`, `ignore(word)`, `resetBook()`.
- Produces: `useSpellcheck(options?: { checker?: SpellChecker; logger?: Logger }): void`; `resetSpellcheckSession(): void` (для тестов); константы `SPELL_DEBOUNCE_MS = 300`, `SPELL_BATCH_SIZE = 2000`.

- [ ] **Step 1: Падающие тесты store**

В `stores.test.ts`:

```ts
describe("spelling store", () => {
  it("filters by settings, book dictionary and ignores without new results", async () => {
    const project = useProjectStore();
    project.setBook({ ...createBook(bookOptions), dictionary: ["Минжуй"] });
    const settings = useSettingsStore();
    const spelling = useSpellingStore();
    spelling.setChapter("chapter1", "Минжуй превет wrold", [
      { word: "Минжуй", lang: "ru", from: 0, to: 6 },
      { word: "превет", lang: "ru", from: 7, to: 13 },
      { word: "wrold", lang: "en", from: 14, to: 19 },
    ]);
    expect(spelling.visible.get("chapter1")?.items.map((i) => i.word)).toEqual(["превет", "wrold"]);
    settings.spelling = { enabled: true, languages: { ru: true, en: false } };
    expect(spelling.total).toBe(1);
    spelling.ignore("превет");
    expect(spelling.total).toBe(0);
    expect(spelling.visible.has("chapter1")).toBe(false);
    settings.spelling = { enabled: false, languages: { ru: true, en: true } };
    expect(spelling.total).toBe(0);
  });
  it("keeps the word cache across books but resets chapters and ignores", () => {
    const spelling = useSpellingStore();
    spelling.remember("ru", ["мир", "мирр"], new Set(["мирр"]));
    spelling.setChapter("a", "мирр", [{ word: "мирр", lang: "ru", from: 0, to: 4 }]);
    spelling.ignore("мирр");
    spelling.resetBook();
    expect(spelling.cached("ru", "мир")).toBe(true);
    expect(spelling.cached("ru", "мирр")).toBe(false);
    expect(spelling.chapters.size).toBe(0);
    expect(spelling.total).toBe(0);
  });
});
```

(`bookOptions` — `{ locale: "ru", now: "2026-10-06T00:00:00Z", newUuid: () => "550e8400-e29b-41d4-a716-446655440000", newChapterId: () => "chapter1" }`.)

- [ ] **Step 2: Падающие тесты composable**

`src/composables/__tests__/use-spellcheck.test.ts`:

```ts
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { resetSpellcheckSession, useSpellcheck } from "../use-spellcheck";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";
import { useLayoutStore } from "@/stores/layout";
import { useNotificationsStore } from "@/stores/notifications";
import { createMemorySpellChecker } from "@/services/platform/memory-spell";
import { createBook } from "@/services/book/create";
import type { Book } from "@/types/book";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
function book(sources: string[], id = "550e8400-e29b-41d4-a716-446655440000"): Book {
  const base = createBook({
    locale: "ru",
    now: "2026-10-06T00:00:00Z",
    newUuid: () => id,
    newChapterId: () => "chapter0",
  });
  return { ...base, chapters: sources.map((source, index) => ({ id: `chapter${index}`, source })) };
}
function start(checker = createMemorySpellChecker({ known: ["мир", "и"] })) {
  const scope = effectScope();
  scope.run(() => useSpellcheck({ checker, logger }));
  return { scope, checker };
}

describe("useSpellcheck", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetSpellcheckSession();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("checks the open chapter first, then the rest", async () => {
    const project = useProjectStore();
    const layout = useLayoutStore();
    project.setBook(book(["мир превет", "мир иии"]));
    layout.center = { kind: "chapter", id: "chapter1" };
    const { checker } = start();
    await flushPromises();
    expect(checker.calls[0]).toEqual({ lang: "ru", words: ["мир", "иии"] });
    const spelling = useSpellingStore();
    expect(spelling.visible.get("chapter0")?.items.map((i) => i.word)).toEqual(["превет"]);
    expect(spelling.visible.get("chapter1")?.items.map((i) => i.word)).toEqual(["иии"]);
    expect(spelling.status).toBe("idle");
  });

  it("debounces edits and does not call Rust for cached words", async () => {
    const project = useProjectStore();
    project.setBook(book(["мир превет"]));
    const { checker } = start();
    await flushPromises();
    const calls = checker.calls.length;
    project.updateChapterSource("chapter0", "превет мир");
    await nextTick();
    vi.advanceTimersByTime(299);
    await flushPromises();
    expect(useSpellingStore().chapters.get("chapter0")?.source).toBe("мир превет");
    vi.advanceTimersByTime(1);
    await flushPromises();
    expect(checker.calls.length).toBe(calls);
    expect(useSpellingStore().chapters.get("chapter0")).toEqual({
      source: "превет мир",
      items: [{ word: "превет", lang: "ru", from: 0, to: 6 }],
    });
  });

  it("splits unique words into batches of 2000", async () => {
    const project = useProjectStore();
    // 4500 distinct Cyrillic words: i written in base 32 with the letters а…я.
    const word = (i: number) => {
      let value = "сл";
      do {
        value += String.fromCharCode(1072 + (i % 32));
        i = Math.floor(i / 32);
      } while (i > 0);
      return value;
    };
    project.setBook(book([Array.from({ length: 4500 }, (_, i) => word(i)).join(" ")]));
    const { checker } = start();
    await flushPromises();
    expect(checker.calls.map((call) => call.words.length)).toEqual([2000, 2000, 500]);
  });

  it("drops results that finish after the book changed", async () => {
    const project = useProjectStore();
    let release!: (value: string[]) => void;
    const checker = {
      check: vi.fn(() => new Promise<string[]>((resolve) => (release = resolve))),
      suggest: vi.fn(async () => []),
    };
    project.setBook(book(["превет"]));
    start(checker as never);
    await flushPromises();
    project.setBook(book(["мир"]));
    release(["превет"]);
    await flushPromises();
    expect(useSpellingStore().chapters.get("chapter0")?.source).not.toBe("превет");
  });

  it("removes deleted chapters from the results", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет", "иии"]));
    start();
    await flushPromises();
    project.applyMutation({
      book: { ...project.book!, chapters: project.book!.chapters.slice(0, 1) },
      changedChapters: new Set(),
      removedChapters: new Set(["chapter1"]),
      changedResources: new Set(),
      removedResources: new Set(),
    });
    await nextTick();
    expect(useSpellingStore().chapters.has("chapter1")).toBe(false);
  });

  it("goes unavailable once, notifies once per session, keeps editing working", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет"]));
    start(createMemorySpellChecker({ failLoad: true }));
    await flushPromises();
    const spelling = useSpellingStore();
    expect(spelling.status).toBe("unavailable");
    expect(useNotificationsStore().items).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { code: "spell.dictionaryLoad" });
    project.setBook(book(["другая"], "6ba7b810-9dad-41d1-80b4-00c04fd430c8"));
    await flushPromises();
    expect(useNotificationsStore().items).toHaveLength(1);
    expect(spelling.status).toBe("unavailable");
  });

  it("does not cache words after a failed check and retries on the next edit", async () => {
    const project = useProjectStore();
    project.setBook(book(["превет"]));
    const checker = createMemorySpellChecker({ known: [] });
    const check = vi.spyOn(checker, "check").mockRejectedValueOnce(new Error("boom"));
    start(checker);
    await flushPromises();
    expect(useSpellingStore().cached("ru", "превет")).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("превет");
    project.updateChapterSource("chapter0", "превет ");
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(check).toHaveBeenCalledTimes(2);
    expect(useSpellingStore().total).toBe(1);
  });

  it("does nothing while spelling is disabled and catches up when enabled", async () => {
    const project = useProjectStore();
    const settings = (await import("@/stores/settings")).useSettingsStore();
    settings.spelling = { enabled: false, languages: { ru: true, en: true } };
    project.setBook(book(["превет"]));
    const { checker } = start();
    await flushPromises();
    expect(checker.calls).toHaveLength(0);
    settings.spelling = { enabled: true, languages: { ru: true, en: true } };
    await flushPromises();
    expect(useSpellingStore().total).toBe(1);
  });
});
```

Run: `pnpm exec vitest run src/composables/__tests__/use-spellcheck.test.ts src/stores/__tests__/stores.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать store**

`src/stores/spelling.ts`:

```ts
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createDictionaryIndex, isAccepted } from "@/services/spell/dictionary";
import type { Misspelling, SpellLanguage } from "@/types/spelling";

export type SpellingStatus = "idle" | "checking" | "unavailable";
export interface ChapterSpelling {
  /** The chapter text the offsets belong to. */
  source: string;
  items: Misspelling[];
}

export const useSpellingStore = defineStore("spelling", () => {
  const project = useProjectStore();
  const settings = useSettingsStore();
  // Base-dictionary verdicts, shared by all chapters and books: true = correct.
  const cache = new Map<string, boolean>();
  const chapters = shallowRef(new Map<string, ChapterSpelling>());
  const ignores = shallowRef(new Set<string>());
  const status = ref<SpellingStatus>("idle");
  const dictionaryIndex = computed(() => createDictionaryIndex(project.book?.dictionary ?? []));

  const visible = computed(() => {
    const result = new Map<string, ChapterSpelling>();
    const { enabled, languages } = settings.spelling;
    if (!enabled) return result;
    for (const [id, entry] of chapters.value) {
      const items = entry.items.filter(
        (item) =>
          languages[item.lang] && !isAccepted(item.word, dictionaryIndex.value, ignores.value),
      );
      if (items.length) result.set(id, { source: entry.source, items });
    }
    return result;
  });
  const total = computed(() =>
    [...visible.value.values()].reduce((sum, entry) => sum + entry.items.length, 0),
  );

  const key = (lang: SpellLanguage, word: string) => `${lang}:${word}`;
  function cached(lang: SpellLanguage, word: string): boolean | undefined {
    return cache.get(key(lang, word));
  }
  function remember(lang: SpellLanguage, words: string[], misspelled: ReadonlySet<string>) {
    for (const word of words) cache.set(key(lang, word), !misspelled.has(word));
  }
  function setChapter(id: string, source: string, items: Misspelling[]) {
    chapters.value = new Map(chapters.value).set(id, { source, items });
  }
  function removeChapter(id: string) {
    if (!chapters.value.has(id)) return;
    const next = new Map(chapters.value);
    next.delete(id);
    chapters.value = next;
  }
  function ignore(word: string) {
    ignores.value = new Set(ignores.value).add(word);
  }
  function resetBook() {
    chapters.value = new Map();
    ignores.value = new Set();
    if (status.value !== "unavailable") status.value = "idle";
  }
  return {
    status,
    chapters,
    visible,
    total,
    cached,
    remember,
    setChapter,
    removeChapter,
    ignore,
    resetBook,
  };
});
```

- [ ] **Step 4: Реализовать composable**

`src/composables/use-spellcheck.ts`:

```ts
import { useDebounceFn } from "@vueuse/core";
import { onScopeDispose, watch } from "vue";
import { getRuntimePlatformServices } from "@/services/platform";
import { tokenize } from "@/services/spell/tokenize";
import { languageOf } from "@/services/spell/language";
import { useLayoutStore } from "@/stores/layout";
import { useNotificationsStore } from "@/stores/notifications";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { appErrorFromUnknown } from "@/types/errors";
import type { Chapter } from "@/types/book";
import type { Logger, SpellChecker } from "@/types/platform";
import { SPELL_LANGUAGES, type Misspelling, type SpellLanguage } from "@/types/spelling";

export const SPELL_DEBOUNCE_MS = 300;
export const SPELL_BATCH_SIZE = 2000;
// One "unavailable" notification per app session, not per book.
let notifiedUnavailable = false;
export function resetSpellcheckSession(): void {
  notifiedUnavailable = false;
}

/** One subscription per open book shell; the editor only reads the store. */
export function useSpellcheck(options: { checker?: SpellChecker; logger?: Logger } = {}): void {
  const services = options.checker && options.logger ? null : getRuntimePlatformServices();
  const checker = options.checker ?? services!.spell;
  const logger = options.logger ?? services!.logger;
  const project = useProjectStore();
  const layout = useLayoutStore();
  const settings = useSettingsStore();
  const spelling = useSpellingStore();
  const notifications = useNotificationsStore();
  const { t } = useSafeI18n();
  const pending = new Set<string>();
  let generation = 0;
  let running = false;
  let disposed = false;

  const canRun = () => !disposed && settings.spelling.enabled && spelling.status !== "unavailable";

  function nextChapter(): Chapter | undefined {
    const chapters = project.book?.chapters ?? [];
    const open = layout.center.kind === "chapter" ? layout.center.id : "";
    return (
      (pending.has(open) ? chapters.find((chapter) => chapter.id === open) : undefined) ??
      chapters.find((chapter) => pending.has(chapter.id))
    );
  }

  async function checkChapter(chapter: Chapter, runGeneration: number) {
    const source = chapter.source;
    const tokens: Misspelling[] = tokenize(source).flatMap((token) => {
      const lang = languageOf(token.word);
      return lang ? [{ ...token, lang }] : [];
    });
    const unknown: Record<SpellLanguage, Set<string>> = { ru: new Set(), en: new Set() };
    for (const token of tokens)
      if (spelling.cached(token.lang, token.word) === undefined)
        unknown[token.lang].add(token.word);
    for (const lang of SPELL_LANGUAGES) {
      const words = [...unknown[lang]];
      for (let index = 0; index < words.length; index += SPELL_BATCH_SIZE) {
        const batch = words.slice(index, index + SPELL_BATCH_SIZE);
        const started = performance.now();
        const misspelled = new Set(await checker.check(lang, batch));
        logger.debug("Spell check batch", {
          lang,
          words: batch.length,
          ms: Math.round(performance.now() - started),
        });
        spelling.remember(lang, batch, misspelled);
      }
    }
    if (runGeneration !== generation) return;
    spelling.setChapter(
      chapter.id,
      source,
      tokens.filter((token) => spelling.cached(token.lang, token.word) === false),
    );
  }

  /** Returns true when checking must stop for this session. */
  function handleError(error: unknown): boolean {
    const appError = appErrorFromUnknown(error, "spell.check");
    if (appError.code === "spell.dictionaryLoad") {
      spelling.status = "unavailable";
      pending.clear();
      logger.error("Spelling dictionary could not be loaded", { code: appError.code });
      if (!notifiedUnavailable) {
        notifiedUnavailable = true;
        notifications.add({
          kind: "warning",
          message: t("spelling.unavailable", "Spell checking is unavailable"),
        });
      }
      return true;
    }
    logger.warn("Spell check failed", { code: appError.code });
    return false;
  }

  async function drain() {
    if (running) return;
    running = true;
    const runGeneration = generation;
    try {
      while (canRun() && runGeneration === generation) {
        const chapter = nextChapter();
        if (!chapter) break;
        pending.delete(chapter.id);
        try {
          await checkChapter(chapter, runGeneration);
        } catch (error) {
          if (handleError(error)) break;
        }
      }
    } finally {
      running = false;
      if (spelling.status === "checking" && (!pending.size || !canRun())) spelling.status = "idle";
      if (canRun() && pending.size) void drain();
    }
  }
  const schedule = useDebounceFn(() => void drain(), SPELL_DEBOUNCE_MS);

  function queueBook() {
    pending.clear();
    if (!canRun()) return;
    for (const chapter of project.book?.chapters ?? []) pending.add(chapter.id);
    if (pending.size) spelling.status = "checking";
    void drain();
  }

  const stopBook = watch(
    () => project.bookGeneration,
    () => {
      generation++;
      schedule.cancel();
      spelling.resetBook();
      queueBook();
    },
    { immediate: true },
  );
  const stopChapters = watch(
    () => project.book?.chapters,
    (chapters, previous) => {
      if (!chapters || !previous) return;
      const before = new Map(previous.map((chapter) => [chapter.id, chapter.source]));
      const ids = new Set(chapters.map((chapter) => chapter.id));
      for (const id of spelling.chapters.keys()) if (!ids.has(id)) spelling.removeChapter(id);
      for (const id of [...pending]) if (!ids.has(id)) pending.delete(id);
      for (const chapter of chapters)
        if (before.get(chapter.id) !== chapter.source) pending.add(chapter.id);
      if (pending.size && canRun()) schedule();
    },
  );
  const stopEnabled = watch(
    () => settings.spelling.enabled,
    (enabled) => {
      if (enabled) queueBook();
    },
  );
  onScopeDispose(() => {
    disposed = true;
    schedule.cancel();
    stopBook();
    stopChapters();
    stopEnabled();
  });
}
```

Замечание для исполнителя: смена книги вызывает оба watcher; `stopBook` очищает и ставит все главы, `stopChapters` для новой книги лишь повторно добавит их в то же множество — это безвредно. Если `vue-tsc` ругается на `services!` — разнести на две ветки без non-null.

`EditorView.vue`: рядом с `useCssSupport();` — `useSpellcheck();` (импорт `@/composables/use-spellcheck`).

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm exec vitest run src/composables/__tests__/use-spellcheck.test.ts src/stores src/views`
Expected: PASS. Если тест «batches» слишком медленный (> 2 s) — уменьшить количество слов до 2100, ожидание то же.

- [ ] **Step 6: Commit**

```bash
git add src/stores src/composables src/views/EditorView.vue
git commit -m "feat(spell): check the whole book in the background with a shared word cache"
```

---

### Task 8: Подчёркивания в редакторе главы

**Files:**

- Create: `src/components/editor/spelling-decorations.ts`, `src/components/editor/__tests__/spelling-decorations.test.ts`
- Modify: `src/components/editor/SourceEditor.vue`, `src/components/editor/__tests__/SourceEditor.test.ts`, `src/assets/style.css`

**Interfaces:**

- Consumes: `useSpellingStore().visible` (Task 7).
- Produces: `setMisspellings: StateEffectType<readonly Misspelling[]>`, `misspellingField: StateField<readonly Misspelling[]>`, `misspellingAt(state: EditorState, pos: number): Misspelling | null`, `spellingExtensions: Extension[]`; CSS-токен `--spelling` и `--color-spelling`.

- [ ] **Step 1: Падающие тесты**

`spelling-decorations.test.ts`:

```ts
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  misspellingAt,
  misspellingField,
  setMisspellings,
  spellingExtensions,
} from "../spelling-decorations";

const item = (word: string, from: number) => ({
  word,
  lang: "ru" as const,
  from,
  to: from + word.length,
});

describe("spelling decorations", () => {
  it("stores, maps and finds misspellings", () => {
    let state = EditorState.create({ doc: "мир превет мир", extensions: [misspellingField] });
    state = state.update({ effects: setMisspellings.of([item("превет", 4)]) }).state;
    expect(misspellingAt(state, 6)?.word).toBe("превет");
    expect(misspellingAt(state, 1)).toBeNull();
    state = state.update({ changes: { from: 0, insert: "Он " } }).state;
    expect(state.field(misspellingField)).toEqual([item("превет", 7)]);
  });
  it("drops a misspelling the user edits until it is checked again", () => {
    let state = EditorState.create({ doc: "превет", extensions: [misspellingField] });
    state = state.update({ effects: setMisspellings.of([item("превет", 0)]) }).state;
    state = state.update({ changes: { from: 2, to: 3, insert: "и" } }).state;
    expect(state.field(misspellingField)).toEqual([]);
  });
  it("renders marks with the misspelled class", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "мир превет", extensions: spellingExtensions }),
    });
    view.dispatch({ effects: setMisspellings.of([item("превет", 4)]) });
    expect(view.contentDOM.querySelector(".cm-misspelled")?.textContent).toBe("превет");
    view.dispatch({ effects: setMisspellings.of([]) });
    expect(view.contentDOM.querySelector(".cm-misspelled")).toBeNull();
    view.destroy();
  });
});
```

В `SourceEditor.test.ts` (хелперы монтирования файла):

```ts
it("turns off WebView spellcheck and shows store misspellings for the current text only", async () => {
  const { container, project } = await mountEditor("мир превет"); // хелпер файла
  expect(container.querySelector(".cm-content")?.getAttribute("spellcheck")).toBe("false");
  const spelling = useSpellingStore();
  spelling.setChapter("chapter1", "старый текст", [{ word: "старый", lang: "ru", from: 0, to: 6 }]);
  await nextTick();
  expect(container.querySelector(".cm-misspelled")).toBeNull();
  spelling.setChapter("chapter1", project.book!.chapters[0]!.source, [
    { word: "превет", lang: "ru", from: 4, to: 10 },
  ]);
  await nextTick();
  expect(container.querySelector(".cm-misspelled")?.textContent).toBe("превет");
});
```

Run: `pnpm exec vitest run src/components/editor/__tests__/spelling-decorations.test.ts src/components/editor/__tests__/SourceEditor.test.ts`
Expected: FAIL.

- [ ] **Step 2: Расширение CodeMirror**

`src/components/editor/spelling-decorations.ts`:

```ts
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Misspelling } from "@/types/spelling";

export const setMisspellings = StateEffect.define<readonly Misspelling[]>();

/** Misspellings of the shown text; separate from @codemirror/lint so NovLang warnings don't mix. */
export const misspellingField = StateField.define<readonly Misspelling[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMisspellings)) return effect.value;
    if (!tr.docChanged) return value;
    return value.flatMap((item) => {
      if (tr.changes.touchesRange(item.from, item.to)) return [];
      return [{ ...item, from: tr.changes.mapPos(item.from), to: tr.changes.mapPos(item.to) }];
    });
  },
});

export function misspellingAt(state: EditorState, pos: number): Misspelling | null {
  return (
    state.field(misspellingField, false)?.find((item) => item.from <= pos && pos <= item.to) ?? null
  );
}

const mark = Decoration.mark({ class: "cm-misspelled" });
function build(view: EditorView): DecorationSet {
  const items = view.state.field(misspellingField);
  const visible = items.filter((item) =>
    view.visibleRanges.some((range) => item.to > range.from && item.from < range.to),
  );
  return Decoration.set(
    visible.map((item) => mark.range(item.from, item.to)),
    true,
  );
}
const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.field(misspellingField) !== update.state.field(misspellingField)
      )
        this.decorations = build(update.view);
    }
  },
  { decorations: (value) => value.decorations },
);
const theme = EditorView.theme({
  ".cm-misspelled": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "var(--spelling)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
});
export const spellingExtensions = [misspellingField, plugin, theme];
```

- [ ] **Step 3: Токен темы**

`src/assets/style.css`: в блоке `@theme inline` рядом с `--color-destructive` — `--color-spelling: var(--spelling);`; в `:root` после `--destructive` — `--spelling: oklch(0.6 0.2 18);`; в `.dark` после `--destructive` — `--spelling: oklch(0.72 0.17 18);`. Оттенок красноватый, светлее/темнее `--destructive`, жёлтые предупреждения не задеты.

- [ ] **Step 4: Подключить в SourceEditor**

В `editorExtensions()`: добавить `...spellingExtensions` после `syntaxHighlighting(...)`; `spellcheck: "true"` → `spellcheck: "false"`. Добавить:

```ts
const spelling = useSpellingStore();
function updateMisspellings() {
  if (!view) return;
  const entry = spelling.visible.get(props.chapterId);
  // Offsets belong to the text that was checked; a newer text waits for its own result
  // and meanwhile keeps the mapped underlines from misspellingField.
  if (entry && entry.source !== view.state.doc.toString()) return;
  view.dispatch({ effects: setMisspellings.of(entry?.items ?? []) });
}
watch(() => [props.chapterId, spelling.visible.get(props.chapterId)], updateMisspellings);
```

и вызвать `updateMisspellings()` в конце `mountEditor`. Нюанс: если `entry` нет (глава ещё не проверена или ошибок нет) и текст менялся — `[]` снимает подчёркивания, это корректно, т. к. `visible` не содержит глав без ошибок.

- [ ] **Step 5: Прогнать тесты**

Run: `pnpm exec vitest run src/components/editor`
Expected: PASS. Если существующий тест проверял `spellcheck="true"` — обновить ожидание на `"false"` (это требование спеки §4.3).

- [ ] **Step 6: Commit**

```bash
git add src/components/editor src/assets/style.css
git commit -m "feat(spell): underline misspelled words in the chapter editor"
```

---

### Task 9: Меню подсказок (правый клик и Mod+.)

**Files:**

- Create: `src/composables/use-spelling-actions.ts`, `src/components/spelling/SpellingMenu.vue`, `src/components/spelling/__tests__/SpellingMenu.test.ts`
- Modify: `src/components/editor/SourceEditor.vue`, `src/components/editor/__tests__/SourceEditor.test.ts`

**Interfaces:**

- Consumes: `misspellingAt` (Task 8), `useSpellingStore().ignore`, `addToDictionary` (Task 4).
- Produces: `useSpellingActions(): { suggest(lang: SpellLanguage, word: string): Promise<string[]>; addToDictionary(word: string): void; ignore(word: string): void; openLogs(): Promise<void> }` — единственная точка, через которую компоненты фичи трогают платформу и книгу.
- Produces: `SpellingMenu` props `{ open: boolean; word: string; lang: SpellLanguage; anchor: { left: number; top: number; height: number } | null }`, emits `update:open(boolean)`, `replace(suggestion: string)`, `ignore()`, `add()`.

- [ ] **Step 1: Падающие тесты**

`SpellingMenu.test.ts`:

```ts
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SpellingMenu from "../SpellingMenu.vue";

const suggest = vi.fn();
vi.mock("@/composables/use-spelling-actions", () => ({
  useSpellingActions: () => ({
    suggest,
    addToDictionary: vi.fn(),
    ignore: vi.fn(),
    openLogs: vi.fn(),
  }),
}));
const props = {
  open: true,
  word: "превет",
  lang: "ru" as const,
  anchor: { left: 10, top: 10, height: 16 },
};

describe("SpellingMenu", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    suggest.mockReset();
  });
  it("asks for suggestions only when opened and lists them", async () => {
    suggest.mockResolvedValue(["привет", "превед"]);
    const { emitted } = render(SpellingMenu, { props });
    expect(suggest).toHaveBeenCalledWith("ru", "превет");
    await userEvent.click(await screen.findByRole("menuitem", { name: "привет" }));
    expect(emitted().replace).toEqual([["привет"]]);
  });
  it("shows No suggestions, Ignore and Add", async () => {
    suggest.mockResolvedValue([]);
    const { emitted } = render(SpellingMenu, { props });
    expect(await screen.findByText("No suggestions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Ignore" }));
    expect(emitted().ignore).toHaveLength(1);
  });
  it("treats a failed suggestion request as no suggestions", async () => {
    suggest.mockRejectedValue(new Error("x"));
    render(SpellingMenu, { props });
    expect(await screen.findByText("No suggestions")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add to book dictionary" })).toBeInTheDocument();
  });
});
```

В `SourceEditor.test.ts`:

```ts
it("opens the menu on a misspelling with Mod+. and replaces in one undoable step", async () => {
  const { container, project } = await mountEditor("мир превет");
  useSpellingStore().setChapter("chapter1", "мир превет", [
    { word: "превет", lang: "ru", from: 4, to: 10 },
  ]);
  await nextTick();
  const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
  view.dispatch({ selection: { anchor: 6 } });
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key: ".", ctrlKey: true, metaKey: true, bubbles: true }),
  );
  await userEvent.click(await screen.findByRole("menuitem", { name: "привет" })); // фейк suggest из in-memory платформы
  expect(project.book!.chapters[0]!.source).toBe("мир привет");
  undo(view);
  expect(view.state.doc.toString()).toBe("мир превет");
});
it("adds a word to the book dictionary from the menu", async () => {
  const { container, project } = await mountEditor("мир превет");
  useSpellingStore().setChapter("chapter1", "мир превет", [
    { word: "превет", lang: "ru", from: 4, to: 10 },
  ]);
  await nextTick();
  const target = container.querySelector(".cm-misspelled") as HTMLElement;
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 1, clientY: 1 }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Add to book dictionary" }));
  expect(project.book!.dictionary).toEqual(["превет"]);
  expect(container.querySelector(".cm-misspelled")).toBeNull();
});
```

Для `suggest` в тестах SourceEditor: `setRuntimePlatformServices(createInMemoryPlatformServices({ spellWords: ["привет", "мир"] }))` в `beforeEach`. Если `posAtCoords` в happy-dom возвращает `null` для правого клика — в обработчике использовать позицию из `event.target` через `view.posAtDOM(event.target)` (см. Step 3), тогда тест работает без раскладки.

Run: `pnpm exec vitest run src/components/spelling src/components/editor/__tests__/SourceEditor.test.ts`
Expected: FAIL.

- [ ] **Step 2: `useSpellingActions`**

```ts
import { getRuntimePlatformServices } from "@/services/platform";
import { addToDictionary as addWord } from "@/services/book/dictionary";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";
import type { SpellLanguage } from "@/types/spelling";

export function useSpellingActions() {
  const services = getRuntimePlatformServices();
  const project = useProjectStore();
  const spelling = useSpellingStore();
  return {
    async suggest(lang: SpellLanguage, word: string): Promise<string[]> {
      try {
        return await services.spell.suggest(lang, word);
      } catch (error) {
        services.logger.warn("Spelling suggestions failed", {
          code: (error as { code?: string }).code,
        });
        return [];
      }
    },
    addToDictionary(word: string) {
      if (!project.book) return;
      const mutation = addWord(project.book, word);
      if (mutation.book !== project.book) project.applyMutation(mutation);
    },
    ignore: (word: string) => spelling.ignore(word),
    openLogs: () => services.logs.openDirectory(),
  };
}
```

`suggest` в `SpellingMenu` при ошибке получает `[]` от `useSpellingActions`; тест с `mockRejectedValue` мокает весь composable, поэтому компонент тоже ловит ошибку (`try/catch` вокруг вызова).

- [ ] **Step 3: `SpellingMenu.vue` и подключение в SourceEditor**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { useSpellingActions } from "@/composables/use-spelling-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SpellLanguage } from "@/types/spelling";

const props = defineProps<{
  open: boolean;
  word: string;
  lang: SpellLanguage;
  anchor: { left: number; top: number; height: number } | null;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  replace: [value: string];
  ignore: [];
  add: [];
}>();
const { t } = useSafeI18n();
const actions = useSpellingActions();
const suggestions = ref<string[] | null>(null);

watch(
  () => [props.open, props.word, props.lang] as const,
  async ([open, word, lang]) => {
    if (!open) return;
    suggestions.value = null;
    let result: string[] = [];
    try {
      result = await actions.suggest(lang, word);
    } catch {
      result = [];
    }
    if (props.open && props.word === word) suggestions.value = result;
  },
  { immediate: true },
);
</script>

<template>
  <DropdownMenu :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <!-- An invisible trigger over the word gives the menu its position. -->
    <DropdownMenuTrigger as-child>
      <span
        aria-hidden="true"
        class="pointer-events-none fixed w-px"
        :style="
          anchor
            ? { left: `${anchor.left}px`, top: `${anchor.top}px`, height: `${anchor.height}px` }
            : { display: 'none' }
        "
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="start"
      :aria-label="t('spelling.menuLabel', 'Spelling: {word}', { word })"
    >
      <DropdownMenuLabel
        v-if="suggestions === null"
        class="text-xs font-normal text-muted-foreground"
      >
        {{ t("spelling.loadingSuggestions", "Looking for suggestions…") }}
      </DropdownMenuLabel>
      <DropdownMenuLabel
        v-else-if="suggestions.length === 0"
        class="text-xs font-normal text-muted-foreground"
      >
        {{ t("spelling.noSuggestions", "No suggestions") }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="item in suggestions ?? []"
        :key="item"
        class="font-medium"
        @select="emit('replace', item)"
      >
        {{ item }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="emit('ignore')">{{
        t("spelling.ignore", "Ignore")
      }}</DropdownMenuItem>
      <DropdownMenuItem @select="emit('add')">
        {{ t("spelling.addToDictionary", "Add to book dictionary") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
```

Если `t()` не подставляет `{word}` (как `editor.status` в StatusBar) — добавить `.replace("{word}", word)`.

`SourceEditor.vue`:

```ts
const spellingActions = useSpellingActions();
const spellingMenu = ref<{
  item: Misspelling;
  anchor: { left: number; top: number; height: number };
} | null>(null);
function openSpellingMenu(editor: EditorView, pos: number): boolean {
  const item = misspellingAt(editor.state, pos);
  if (!item) return false;
  const rect = editor.coordsAtPos(item.from);
  spellingMenu.value = {
    item,
    anchor: rect
      ? { left: rect.left, top: rect.top, height: rect.bottom - rect.top }
      : { left: 0, top: 0, height: 0 },
  };
  return true;
}
function replaceMisspelling(suggestion: string) {
  const current = spellingMenu.value?.item;
  spellingMenu.value = null;
  if (!view || !current || view.state.sliceDoc(current.from, current.to) !== current.word) return;
  view.dispatch({
    changes: { from: current.from, to: current.to, insert: suggestion },
    selection: { anchor: current.from + suggestion.length },
    userEvent: "input.spelling",
  });
  view.focus();
}
function closeSpellingMenu(action?: "ignore" | "add") {
  const word = spellingMenu.value?.item.word;
  spellingMenu.value = null;
  if (word && action === "ignore") spellingActions.ignore(word);
  if (word && action === "add") spellingActions.addToDictionary(word);
  view?.focus();
}
```

В `keymap.of([...])` (перед `...defaultKeymap`): `{ key: "Mod-.", run: (editor) => openSpellingMenu(editor, editor.state.selection.main.head) }`. В `domEventHandlers`:

```ts
contextmenu: (event, editor) => {
  const pos =
    editor.posAtCoords({ x: event.clientX, y: event.clientY }) ??
    (event.target instanceof Node ? editor.posAtDOM(event.target) : null);
  if (pos === null || !openSpellingMenu(editor, pos)) return false;
  event.preventDefault();
  return true;
},
```

В шаблоне после host-`div` (обернуть корень в фрагмент или `div.contents`):

```vue
<SpellingMenu
  v-if="spellingMenu"
  :open="true"
  :word="spellingMenu.item.word"
  :lang="spellingMenu.item.lang"
  :anchor="spellingMenu.anchor"
  @update:open="(open) => !open && closeSpellingMenu()"
  @replace="replaceMisspelling"
  @ignore="closeSpellingMenu('ignore')"
  @add="closeSpellingMenu('add')"
/>
```

Правый клик вне подчёркнутого слова возвращает `false` — поведение как раньше (меню WebView).

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm exec vitest run src/components/spelling src/components/editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/use-spelling-actions.ts src/components/spelling src/components/editor
git commit -m "feat(spell): offer suggestions, ignore and add-to-dictionary on misspelled words"
```

---

### Task 10: Плашка орфографии в строке статуса

**Files:**

- Create: `src/components/spelling/SpellingPopover.vue`, `src/components/spelling/__tests__/SpellingPopover.test.ts`
- Modify: `src/components/layout/StatusBar.vue`, `src/components/layout/__tests__/StatusBar.test.ts`, `src/views/EditorView.vue`, `src/views/__tests__/EditorView.test.ts`

**Interfaces:**

- Consumes: `useSpellingStore().visible/total/status`, `summarizeMisspellings`, `contextSnippet` (Task 3), `useSpellingActions` (Task 9).
- Produces: `SpellingPopover` emits `select: [item: { chapterId: string; from: number; to: number }]`; `StatusBar` emits `selectSpelling` с тем же payload.

- [ ] **Step 1: Падающие тесты**

`SpellingPopover.test.ts`:

```ts
it("shows the book total, groups by chapter with counts and context, and jumps to the word", async () => {
  const project = useProjectStore();
  project.setBook({
    ...createBook(bookOptions),
    chapters: [
      { id: "chapter1", source: "# Начало\nтекст" },
      { id: "chapter2", source: "# Встреча\nсказал Минжуи и вышел. Минжуи ушёл." },
    ],
  });
  const source = project.book!.chapters[1]!.source;
  const first = source.indexOf("Минжуи");
  const second = source.lastIndexOf("Минжуи");
  useSpellingStore().setChapter("chapter2", source, [
    { word: "Минжуи", lang: "ru", from: first, to: first + 6 },
    { word: "Минжуи", lang: "ru", from: second, to: second + 6 },
  ]);
  const { emitted } = render(SpellingPopover);
  await userEvent.click(screen.getByRole("button", { name: "2 spelling issues" }));
  expect(screen.getByText("Chapter 2 · Встреча — 2")).toBeInTheDocument();
  expect(screen.getByText("×2")).toBeInTheDocument();
  expect(screen.getByText(/сказал/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Минжуи/ }));
  expect(emitted().select).toEqual([[{ chapterId: "chapter2", from: first, to: first + 6 }]]);
});
it("clears all occurrences with Add to dictionary and Ignore", async () => {
  const project = useProjectStore();
  const source = "Минжуи превет Минжуи превет";
  project.setBook({ ...createBook(bookOptions), chapters: [{ id: "chapter1", source }] });
  const spelling = useSpellingStore();
  spelling.setChapter("chapter1", source, [
    { word: "Минжуи", lang: "ru", from: 0, to: 6 },
    { word: "превет", lang: "ru", from: 7, to: 13 },
    { word: "Минжуи", lang: "ru", from: 14, to: 20 },
    { word: "превет", lang: "ru", from: 21, to: 27 },
  ]);
  render(SpellingPopover);
  await userEvent.click(screen.getByRole("button", { name: "4 spelling issues" }));
  await userEvent.click(screen.getAllByRole("button", { name: "Add to book dictionary" })[0]!);
  expect(project.book!.dictionary).toEqual(["Минжуи"]);
  expect(spelling.total).toBe(2);
  await userEvent.click(screen.getAllByRole("button", { name: "Ignore" })[0]!);
  expect(spelling.total).toBe(0);
  expect(project.book!.dictionary).toEqual(["Минжуи"]);
});
it("is grey with a hint and a log button when unavailable, hidden when disabled", async () => {
  useSpellingStore().status = "unavailable";
  render(SpellingPopover);
  const button = screen.getByRole("button", { name: "Spell checking is unavailable" });
  expect(button).toHaveAttribute(
    "title",
    "The dictionaries could not be loaded. Details are in the log.",
  );
  await userEvent.click(button);
  await userEvent.click(screen.getByRole("button", { name: "Log folder" }));
  expect(openLogs).toHaveBeenCalled();
});
it("shows a spinner while the first pass runs", () => {
  useSpellingStore().status = "checking";
  render(SpellingPopover);
  expect(screen.getByRole("button", { name: "Checking spelling…" })).toBeInTheDocument();
});
```

`useSpellingActions` здесь не мокается: в `beforeEach` — `setActivePinia(createPinia())`, `const services = createInMemoryPlatformServices(); setRuntimePlatformServices(services); const openLogs = vi.spyOn(services.logs, "openDirectory");` (объявить `openLogs` на уровне `describe`). `bookOptions` — как в Task 7.

`StatusBar.test.ts`: плашка орфографии стоит сразу после кнопки предупреждений и пробрасывает `select` как `selectSpelling`.

`EditorView.test.ts`: `selectSpelling({ chapterId, from, to })` открывает главу и вызывает `focusRange` редактора (по образцу существующего теста `selectSearchResult`).

Run: `pnpm exec vitest run src/components/spelling src/components/layout src/views`
Expected: FAIL.

- [ ] **Step 2: Реализация `SpellingPopover.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { IconTextSpellcheck } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { useSpellingActions } from "@/composables/use-spelling-actions";
import { extractTitle } from "@/services/book/extract-title";
import { contextSnippet, summarizeMisspellings } from "@/services/spell/summary";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";

const emit = defineEmits<{ select: [item: { chapterId: string; from: number; to: number }] }>();
const { t } = useSafeI18n();
const project = useProjectStore();
const settings = useSettingsStore();
const spelling = useSpellingStore();
const actions = useSpellingActions();
const open = ref(false);
const fill = (text: string, params: Record<string, string | number>) =>
  Object.entries(params).reduce(
    (value, [key, param]) => value.replace(`{${key}}`, String(param)),
    text,
  );

const groups = computed(() =>
  (project.book?.chapters ?? []).flatMap((chapter, index) => {
    const entry = spelling.visible.get(chapter.id);
    if (!entry) return [];
    const title =
      extractTitle(chapter.source) ||
      fill(t("chapters.fallback", "Chapter {number}", { number: index + 1 }), {
        number: index + 1,
      });
    return [
      {
        chapterId: chapter.id,
        title: fill(
          t("spelling.chapterGroup", "Chapter {number} · {title} — {count}", {
            number: index + 1,
            title,
            count: entry.items.length,
          }),
          { number: index + 1, title, count: entry.items.length },
        ),
        words: summarizeMisspellings(entry.items).map((summary) => ({
          ...summary,
          snippet: contextSnippet(entry.source, summary.first.from, summary.first.to),
        })),
      },
    ];
  }),
);
const label = computed(() =>
  spelling.status === "unavailable"
    ? t("spelling.unavailable", "Spell checking is unavailable")
    : spelling.status === "checking"
      ? t("spelling.checking", "Checking spelling…")
      : fill(t("spelling.badge", `${spelling.total} spelling issues`, spelling.total), {
          count: spelling.total,
        }),
);
function select(chapterId: string, from: number, to: number) {
  open.value = false;
  emit("select", { chapterId, from, to });
}
</script>

<template>
  <Popover v-if="settings.spelling.enabled" v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="xs"
        :aria-label="label"
        :title="
          spelling.status === 'unavailable'
            ? t(
                'spelling.unavailableHint',
                'The dictionaries could not be loaded. Details are in the log.',
              )
            : undefined
        "
        :class="spelling.status === 'unavailable' && 'opacity-50'"
      >
        <IconTextSpellcheck aria-hidden="true" />
        <Spinner v-if="spelling.status === 'checking'" class="size-3" aria-hidden="true" />
        <Badge
          v-else-if="spelling.status !== 'unavailable'"
          :variant="spelling.total ? 'destructive' : 'secondary'"
          aria-hidden="true"
          >{{ spelling.total }}</Badge
        >
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" class="w-96 p-0">
      <ScrollArea class="[&>[data-slot=scroll-area-viewport]]:max-h-96">
        <div class="flex flex-col gap-3 p-3 text-xs">
          <template v-if="spelling.status === 'unavailable'">
            <p>
              {{
                t(
                  "spelling.unavailableHint",
                  "The dictionaries could not be loaded. Details are in the log.",
                )
              }}
            </p>
            <Button variant="outline" size="sm" class="self-start" @click="actions.openLogs()">
              {{ t("spelling.openLogs", "Log folder") }}
            </Button>
          </template>
          <p v-else-if="groups.length === 0" class="text-muted-foreground">
            {{ t("spelling.none", "No spelling issues") }}
          </p>
          <section
            v-for="group in groups"
            :key="group.chapterId"
            class="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <h3 class="font-medium">{{ group.title }}</h3>
            <div v-for="word in group.words" :key="word.word" class="flex items-start gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="h-auto min-w-0 flex-1 flex-col items-start whitespace-normal px-1 py-1 text-left text-xs font-normal"
                @click="select(group.chapterId, word.first.from, word.first.to)"
              >
                <span
                  ><span class="font-medium text-spelling">{{ word.word }}</span>
                  <span v-if="word.count > 1" class="text-muted-foreground">
                    {{
                      fill(t("spelling.occurrences", "×{count}", { count: word.count }), {
                        count: word.count,
                      })
                    }}</span
                  ></span
                >
                <span class="text-muted-foreground"
                  >{{ word.snippet.before }}<strong>{{ word.snippet.word }}</strong
                  >{{ word.snippet.after }}</span
                >
              </Button>
              <Button variant="ghost" size="xs" @click="actions.addToDictionary(word.word)">
                {{ t("spelling.addToDictionary", "Add to book dictionary") }}
              </Button>
              <Button variant="ghost" size="xs" @click="actions.ignore(word.word)">
                {{ t("spelling.ignore", "Ignore") }}
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
```

Проверить: иконка `IconTextSpellcheck` есть в `@tabler/icons-vue` (`grep -l IconTextSpellcheck node_modules/@tabler/icons-vue/dist/esm/icons/*.mjs | head -1`), иначе `IconAbc`. `Spinner` — `src/components/ui/spinner`. Если кнопки «Add»/«Ignore» не помещаются в 24rem — заменить текст иконками `IconBookmarkPlus`/`IconEyeOff` с `aria-label` теми же ключами (тест ищет по имени).

- [ ] **Step 3: StatusBar и EditorView**

`StatusBar.vue`: импорт `SpellingPopover`; emit `selectSpelling: [item: { chapterId: string; from: number; to: number }]`; сразу после `<WarningsPopover …/>` — `<SpellingPopover @select="emit('selectSpelling', $event)" />`.

`EditorView.vue`: на `<StatusBar>` — `@select-spelling="(item) => selectSearchResult(item.chapterId, item.from, item.to)"`.

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm exec vitest run src/components/spelling src/components/layout src/views`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/views
git commit -m "feat(spell): show book-wide spelling issues in the status bar"
```

---

### Task 11: Вид «Словарь» в Проводнике

**Files:**

- Create: `src/components/spelling/DictionaryView.vue`, `src/components/spelling/__tests__/DictionaryView.test.ts`
- Modify: `src/stores/layout.ts`, `src/components/sidebar/ExplorerView.vue`, `src/components/sidebar/__tests__/ExplorerView.test.ts`, `src/components/layout/Breadcrumbs.vue`, `src/components/layout/__tests__/Breadcrumbs.test.ts`, `src/views/EditorView.vue`

**Interfaces:**

- Consumes: `addToDictionary`, `removeFromDictionary`, `isDictionaryWord` (Task 4).
- Produces: `CenterView` вариант `{ kind: "dictionary" }`.

- [ ] **Step 1: Падающие тесты**

`DictionaryView.test.ts`:

```ts
it("lists, filters, adds and removes words", async () => {
  const project = useProjectStore();
  project.setBook({ ...createBook(bookOptions), dictionary: ["Минжуй", "дао"] });
  render(DictionaryView);
  expect(screen.getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
    "Минжуй",
    "дао",
  ]);
  await userEvent.type(screen.getByRole("searchbox", { name: "Filter words" }), "мин");
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  await userEvent.clear(screen.getByRole("searchbox", { name: "Filter words" }));
  await userEvent.type(screen.getByRole("textbox", { name: "New word" }), "Алёна{Enter}");
  expect(project.book!.dictionary).toEqual(["Алёна", "Минжуй", "дао"]);
  await userEvent.click(screen.getByRole("button", { name: "Remove дао" }));
  expect(project.book!.dictionary).toEqual(["Алёна", "Минжуй"]);
  expect(project.dirty).toBe(true);
});
it("rejects text with spaces and shows the empty state", async () => {
  const project = useProjectStore();
  project.setBook(createBook(bookOptions));
  render(DictionaryView);
  expect(screen.getByText("The book dictionary is empty")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox", { name: "New word" }), "два слова{Enter}");
  expect(screen.getByText("Enter one word without spaces")).toBeInTheDocument();
  expect(project.book!.dictionary).toEqual([]);
});
```

`ExplorerView.test.ts`: в секции «Book» есть treeitem «Dictionary»; клик ставит `layout.center = { kind: "dictionary" }` и выделяет пункт. `Breadcrumbs.test.ts`: для `{ kind: "dictionary" }` — «Book › Dictionary».

Run: `pnpm exec vitest run src/components/spelling src/components/sidebar src/components/layout`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`layout.ts`: в `CenterView` — `| { kind: "dictionary" }`.

`DictionaryView.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { IconTrash } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import {
  addToDictionary,
  isDictionaryWord,
  removeFromDictionary,
} from "@/services/book/dictionary";
import { useProjectStore } from "@/stores/project";
import type { BookMutation } from "@/types/book";

const { t } = useSafeI18n();
const project = useProjectStore();
const filter = ref("");
const draft = ref("");
const invalid = ref(false);
const words = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase();
  return (project.book?.dictionary ?? []).filter((word) =>
    word.toLocaleLowerCase().includes(query),
  );
});
function apply(mutation: BookMutation) {
  if (mutation.book !== project.book) project.applyMutation(mutation);
}
function add() {
  if (!project.book) return;
  invalid.value = !isDictionaryWord(draft.value);
  if (invalid.value) return;
  apply(addToDictionary(project.book, draft.value));
  draft.value = "";
}
</script>

<template>
  <section class="flex max-w-xl flex-col gap-4 p-8" aria-labelledby="dictionary-title">
    <h1 id="dictionary-title" class="text-xl font-semibold">
      {{ t("dictionary.title", "Book dictionary") }}
    </h1>
    <form class="flex gap-2" @submit.prevent="add">
      <Input
        v-model="draft"
        :aria-label="t('dictionary.newWord', 'New word')"
        :aria-invalid="invalid"
        class="flex-1"
      />
      <Button type="submit">{{ t("dictionary.add", "Add word") }}</Button>
    </form>
    <p v-if="invalid" class="text-xs text-destructive">
      {{ t("dictionary.invalid", "Enter one word without spaces") }}
    </p>
    <Input
      v-model="filter"
      type="search"
      :aria-label="t('dictionary.filter', 'Filter words')"
      :placeholder="t('dictionary.filter', 'Filter words')"
    />
    <p v-if="!project.book?.dictionary.length" class="text-sm text-muted-foreground">
      {{ t("dictionary.empty", "The book dictionary is empty") }}
    </p>
    <p v-else-if="!words.length" class="text-sm text-muted-foreground">
      {{ t("dictionary.noMatches", "No matching words") }}
    </p>
    <ul v-else class="flex flex-col divide-y rounded-md border">
      <li
        v-for="word in words"
        :key="word"
        class="flex items-center justify-between px-3 py-1.5 text-sm"
      >
        <span>{{ word }}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="t('dictionary.remove', 'Remove {word}', { word }).replace('{word}', word)"
          @click="project.book && apply(removeFromDictionary(project.book, word))"
        >
          <IconTrash aria-hidden="true" />
        </Button>
      </li>
    </ul>
  </section>
</template>
```

(проверить, что у `Button` есть размер `icon-sm`; иначе `icon`.) `textContent` элемента списка включает только слово — у кнопки нет текста, только `aria-label`.

`ExplorerView.vue`: в union `ExplorerNode` — `| { id: "dictionary"; kind: "dictionary" }`; в детях секции «book» после `images` — `{ id: "dictionary", kind: "dictionary" }`; в `selectedNode` — `if (center.kind === "dictionary") return { id: "dictionary" };`; обработчик `selectDictionary(event) { event.preventDefault(); layout.center = { kind: "dictionary" }; }`; в шаблоне строка по образцу пункта `images` с текстом `t("explorer.dictionary", "Dictionary")` и счётчиком `book.dictionary.length` (Badge как у секции, только если > 0).

`Breadcrumbs.vue`: `if (center.kind === "dictionary") return [{ label: book }, { label: t("explorer.dictionary", "Dictionary") }];` (переменная `book` — существующая подпись «Книга» в функции).

`EditorView.vue`: `singlePane` — добавить `"dictionary"`; в `#single` — `<DictionaryView v-else-if="layout.center.kind === 'dictionary'" />` перед `SettingsView`.

- [ ] **Step 3: Прогнать тесты**

Run: `pnpm exec vitest run src/components src/views`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components src/stores/layout.ts src/views
git commit -m "feat(spell): manage the book dictionary from the explorer"
```

---

### Task 12: e2e, документация и общая проверка

**Files:**

- Create: `e2e/spelling.spec.ts`
- Modify: `README.md`, `docs/release-checklist.md`, `AGENTS.md`, при необходимости `e2e/app.spec.ts` (если существующие сценарии зависят от `spellcheck="true"`)

**Interfaces:**

- Consumes: всё выше; in-memory платформа (`vite --mode e2e`) с `DEFAULT_MEMORY_WORDS` («глава», «мир», «и», «он», «сказал», «вышел», «chapter», «hello», «world», «the»).

- [ ] **Step 1: e2e-сценарий**

`e2e/spelling.spec.ts`:

```ts
import { expect } from "playwright/test";
import { test } from "./fixtures/platform";

test("misspelled word → add to dictionary → save → reopen → still accepted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n\nОн сказал Минжуи и вышел.");
  const underline = page.locator(".cm-misspelled", { hasText: "Минжуи" });
  await expect(underline).toBeVisible();
  await underline.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to book dictionary" }).click();
  await expect(underline).toHaveCount(0);
  await expect(page.getByRole("button", { name: /spelling issue/ })).toContainText("0");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: /^File/ }).click();
  await page.getByRole("menuitem", { name: /^Close project/ }).click();
  await page.getByRole("button", { name: /^Open/ }).click();
  await expect(page.locator(".cm-content")).toContainText("Минжуи");
  await expect(page.locator(".cm-misspelled")).toHaveCount(0);
  await page.getByRole("treeitem", { name: /Dictionary/ }).click();
  await expect(page.getByRole("listitem")).toHaveText(["Минжуи"]);
});
```

Имена кнопок «New project», «File», «Open», «Close project» сверить с `e2e/file-menu.spec.ts` и `e2e/app.spec.ts` и использовать такие же локаторы. «Chapter 1» новой книги на en-UI — слово «Chapter» в фейке известно, цифра пропускается, так что до правки ошибок нет.

Run: `pnpm test:e2e -- spelling`
Expected: PASS.

- [ ] **Step 2: Документация**

- `README.md`: в «Features» — пункт про проверку орфографии ru/en со словарём книги; в «Keyboard shortcuts» — `Mod+.` «Spelling suggestions»; в «Roadmap» — убрать проверку орфографии из будущего (или пометить сделанной); в «License» — строку о словарях (ссылка на `src-tauri/resources/dictionaries/README.md`, лицензии BSD-style и SCOWL; `spellbook` — MPL-2.0).
- `docs/release-checklist.md`: раздел «Spelling» — на каждой ОС (Windows 11 WebView2, macOS, Linux WebKitGTK) в собранном приложении: подчёркивание ru и en в одной главе; правый клик и Mod+. (подсказки, замена, Mod+Z); «Пропустить»/«Добавить в словарь»; плашка и переход к слову; нет второго (системного) подчёркивания на macOS; время до первых подчёркиваний на книге 100+ глав; удалённый `ru_RU.dic` в бандле → одно уведомление, серая плашка, редактирование работает; старый `.edb` v1 открывается и сохраняется как v2; RU/EN/zh-CN тексты.
- `AGENTS.md`: строка статуса с датой — реализована проверка орфографии по плану `docs/superpowers/plans/2026-10-06-spell-checker.md`; в «Roadmap» отметить пункт spell checker как реализованный; в секции 2 (формат `.edb`) — `dictionary.txt` и `formatVersion: 2`.
- Спецификация: в шапке `Status:` — `implemented (plan 2026-10-06)`.

- [ ] **Step 3: Полная проверка**

Run: `pnpm check && pnpm build && pnpm test:e2e && (cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)`
Expected: всё exit 0. `pnpm build:fixture-epubs` — exit 0 (скрипт собирает `Book` с новым полем).

- [ ] **Step 4: Ручная проверка в приложении**

Run: `pnpm tauri dev` — открыть книгу, убедиться: подчёркивания появляются, правый клик открывает меню, в логе (`Папка логов`) нет слов книги, только количества и тайминги. Результат и найденные отличия записать в описание PR.

- [ ] **Step 5: Проверка diff**

- `rg "spellcheck: \"true\"" src` — пусто.
- `rg "@tauri-apps" src/services/spell src/stores src/composables src/components` — пусто.
- Нет логирования `word`/`source`/`words` в `use-spellcheck.ts`, `use-spelling-actions.ts`, `spell.rs` (только `count`, `lang`, `code`, `ms`).
- Ключи локалей совпадают (тест i18n).
- Экспорт (`use-export.ts`, `ExportDialog.vue`) не менялся.

- [ ] **Step 6: Commit**

```bash
git add -A e2e README.md docs AGENTS.md
git commit -m "docs: document the spell checker and add its end-to-end check"
```

---

## Самопроверка плана

- §1/§2 (Windows без подчёркиваний, ru/en, смешанный текст, никакой блокировки экспорта) — Tasks 1, 3, 7, 12; экспорт не трогается.
- §3 (движок `spellbook`) — Task 1; версия 0.4.2, лицензия MPL-2.0 зафиксированы.
- §4.1 (ленивая загрузка, `spawn_blocking`, две команды, `{ code, message }`, словарь книги не в Rust) — Task 1.
- §4.2 (`SpellChecker`, адаптер, фейк; `tokenize`/`languageOf`/`isAccepted`; store; composable 300 ms, открытая глава первой, пачки 2000, фильтры без Rust) — Tasks 2, 3, 7.
- §4.3 (`Decoration.mark` только для видимых диапазонов, отдельно от lint, `spellcheck="false"`) — Task 8.
- §5 (модель словаря, совпадение регистра/ё, `dictionary.txt`, v1 → v2, операции, восстановление, вид «Словарь») — Tasks 3, 4, 5, 11.
- §6.1 (`--spelling`, меню по правому клику/Mod+., ≤ 5 подсказок по требованию, одна транзакция, Пропустить, Добавить, «Нет вариантов») — Tasks 8, 9.
- §6.2 (плашка после ⚠, сумма по книге, спиннер, серая при unavailable, группы по главам, «×7», контекст, переход, быстрые действия) — Task 10.
- §6.3 (настройки «Проверять орфографию» + языки) — Task 6, фильтр — Task 7.
- §7 (уведомление раз за сессию, лог без текста, повтор после сбоя) — Tasks 1, 7.
- §8 (производительность) — Tasks 1 (замер), 7 (кэш, пачки), 8 (видимые диапазоны).
- §9 (ресурсы бандла, README словарей, лицензии, кредиты) — Tasks 1, 6, 12; «About» заменён подписью в настройках (раздела нет).
- §10 (тесты Rust, unit, edb, stores/composables, компоненты, e2e, ключи локалей) — Tasks 1–12.
- §11 (версия `spellbook`, качество ru-подсказок, ограничение для длинных слов) — Task 1, Steps 6–7.
- Review Focus 1–5 закреплены тестами: Task 7 «drops results…», Task 8 SourceEditor «current text only» и «drops a misspelling the user edits»; Task 7 смена книги; Tasks 1 и 3 (ё/дефис/апостроф/регистр); Tasks 4 и 5 (v1, roundtrip, сессия без поля); Tasks 1, 7, 10 (ошибка загрузки).
- Имена согласованы: `SpellChecker.check/suggest`, `Misspelling`, `useSpellingStore().visible/total/status/ignore/setChapter`, `setMisspellings`/`misspellingField`/`misspellingAt`, `useSpellingActions().suggest/addToDictionary/ignore/openLogs`, `CenterView { kind: "dictionary" }`.
