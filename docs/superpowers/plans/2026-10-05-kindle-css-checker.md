# Kindle CSS Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать ошибки синтаксиса и предупреждения о совместимости `custom.css` с Kindle в редакторе, списке проблем книги и диалоге экспорта.

**Architecture:** Чистый анализатор на Lezer CSS возвращает диапазоны и ключи локализации. Таблица поддержки отделена от обхода дерева. Composable уровня книги обновляет диагностики независимо от наличия CSS-редактора; экспорт синхронно анализирует актуальный CSS тем же сервисом.

**Tech Stack:** TypeScript, Vue 3, Pinia, CodeMirror 6, `@codemirror/lint`, `@lezer/css`, `css-tree/utils`, Vitest, vue-i18n.

**Spec:** `docs/superpowers/specs/2026-10-03-kindle-css-checker-design.md`.

## Global Constraints

- Проверяется только `custom.css`; встроенная тема проверяется отдельным тестом тем же анализатором.
- “Warns and never blocks.” Ни синтаксис, ни совместимость не запрещают экспорт.
- Цели: AZW3/KF8 на Paperwhite 3 и Paperwhite 12th gen; отличия KFX — `partial`.
- “An entry without a device test is `partial` at most.” Не выдавать предположения за подтверждённую поддержку или неподдержку.
- Каждая запись таблицы имеет непустой `source` и ключ `note`, существующий в ru / en / zh-CN.
- `unsupported` → `warning`, `partial` → `info`, `supported` → без finding.
- Ошибки синтаксиса дают один `info` finding за документ; анализ остальных доступных узлов продолжается.
- `@font-face` отмечается как ограничение экспорта шрифтов; добавление шрифтов в книгу вне задачи.
- Нет quick fixes и данных по отдельным firmware в первой версии.
- Сервисы не импортируют Vue, Pinia, Tauri или CodeMirror view. Все изменения проверяются на трёх десктопных ОС.

## Review Focus

1. Незаконченный CSS во время ввода: один синтаксический finding и сохранение анализа исправных соседних правил (Task 2).
2. CSS escapes, строки, комментарии и вложенные функции: не находить ложные свойства, единицы, селекторы и URL (Task 2).
3. Смена книги до срабатывания debounce: не переносить finding и координаты в другую книгу, даже с тем же UUID (Task 3).
4. Экспорт сразу после правки: предупреждения отражают актуальный текст, а не прошлый результат debounce (Task 5).
5. Нет CSS, пустой CSS и удаление CSS: не анализировать шаблон вместо данных книги и очищать результаты (Tasks 3–5).

## Решения и карта файлов

Рабочая ветка: `feat/kindle-css-check`, от текущего состояния `feat/azw3-export`. Пользователь запросил смену ветки в существующем checkout; дополнительный worktree не создаётся. Этот план не включает реализацию.

- Create `src/services/css-support/types.ts`: типы таблицы и `CssFinding`.
- Create `src/services/css-support/kindle.ts`: данные поддержки и источники, без логики.
- Create `src/services/css-support/check.ts`: синтаксис, объявления, значения, единицы, селекторы, at-rules, URL.
- Create `src/services/css-support/__tests__/kindle.test.ts`, `check.test.ts`: целостность таблицы, анализатор, тема.
- Create `src/composables/use-css-support.ts` и `__tests__/use-css-support.test.ts`: debounce 150 ms, lifecycle книги.
- Modify `src/stores/diagnostics.ts`, `src/stores/__tests__/stores.test.ts`: отдельное состояние CSS.
- Create `src/components/editor/css-diagnostics.ts` и `__tests__/css-diagnostics.test.ts`: преобразование в lint diagnostics.
- Modify `src/components/editor/CssEditor.vue`, `__tests__/CssEditor.test.ts`: lint и переход к диапазону.
- Modify `src/components/editor/WarningsPopover.vue`, `__tests__/WarningsPopover.test.ts`: строка Styles и доступные отдельные findings.
- Modify `src/components/layout/StatusBar.vue`, `src/views/EditorView.vue`, `src/views/__tests__/EditorView.test.ts`: передача CSS-перехода и запуск composable.
- Modify `src/composables/use-export.ts`, `src/composables/__tests__/use-export.test.ts`, `src/components/export/ExportDialog.vue`, `__tests__/ExportDialog.test.ts`: свежие локализованные findings без блокировки.
- Modify `src/locales/{ru,en,zh-CN}.json`: сообщения `cssSupport.<code>` и подпись Styles.
- Modify `package.json`, `pnpm-lock.yaml`: прямые зависимости `@lezer/css`, `css-tree@^3.2.1` и dev dependency `@types/css-tree@^3.2.0`.
- Create `src/types/css-tree-utils.d.ts`: декларация публичного subpath `css-tree/utils`, переиспользующая типы helpers из `@types/css-tree`.
- Modify `scripts/build-fixture-azw3.mts`, `docs/release-checklist.md`: CSS-страница и журнал результатов устройств.

Не расширять `DiagnosticSeverity` главы: CSS имеет отдельный тип с `info`. Не менять `checkBook()` ради добавления локализуемых CSS findings. Не переписывать механизм CSS URL экспорта в рамках этой задачи.

## Переиспользование внешних библиотек (DRY)

- CSS grammar, tokenizer, recovery, дерево и offsets предоставляет `@lezer/css`. Не писать собственный parser, tokenizer или поиск синтаксических ошибок регулярными выражениями. Логика обхода проверяет только правила Kindle из таблицы.
- Сохранить `cssEditingExtensions()` на основе `@codemirror/lang-css`: highlighting, completion, brackets и indentation уже подключены. Эта библиотека не экспортирует Kindle checker или syntax linter; список completion не является таблицей поддержки Kindle.
- Для debounce использовать существующий `useDebounceFn` из `@vueuse/core`, как в `useNovlangParse`, включая `.cancel()` на смене книги и dispose. Не добавлять собственный debounce/timer scheduler или второй debounce через CodeMirror `linter()`.
- Для lint использовать `setDiagnostics` из `@codemirror/lint`: библиотека хранит и отображает диапазоны, tooltip и severity. Не создавать собственные decorations, hover tooltip или хранилище lint ranges. Adapter нужен только для перевода `CssFinding` в штатный Diagnostic.
- Стандартный `.cm-lintRange-info` в установленном CodeMirror использует волнистое подчёркивание. Для dotted из спеки добавить только theme override этого класса через `EditorView.theme`; остальные стили и механизм lint оставить библиотеке.
- Для escapes использовать `ident.decode`, `string.decode`, `url.decode` из публичного subpath `css-tree/utils`; не писать CSS-unescape helper. `string.decode` получает quoted string token; `url.decode` — полный unquoted url token, не quoted function. Нормализация и проверка путей остаются логикой приложения. Helpers не являются валидатором: вызывать их на подходящих исправных узлах Lezer. Не использовать `decodeURIComponent`.
- Проверенные `@types/css-tree@3.2.0` описывают helpers корневого модуля, но не subpath. Добавить ambient declaration `declare module "css-tree/utils" { export { ident, string, url } from "css-tree"; }`, без дублирования signatures или runtime imports. Проверить `vue-tsc --noEmit`.
- Импорт helpers из корня `css-tree` запрещён для этой задачи: в пробной браузерной сборке он удержал parser/lexer/data (~201 KB minified вместо ~3.2 KB для utils). После реализации проверить реальную Vite сборку. Обоснование выбора и альтернативы: `docs/superpowers/notes/2026-10-05-css-library-analysis.md`.
- Существующий `rewriteCssResourceUrls()` занимается преобразованием ресурсов, а проверка — сообщениями без изменения CSS. Его regex не покрывает нужные parser cases, поэтому не использовать его как tokenizer. Общую политику путей выделять только при наличии реального повторения; изменение export rewriting вне этой фичи.

### Task 1: Таблица поддержки с проверяемыми источниками

**Files:** types.ts, kindle.ts, kindle.test.ts, locales, package.json, pnpm-lock.yaml из карты.

**Interfaces:**

- Produces `Support = "supported" | "partial" | "unsupported"` и `PropertyRule`, `SelectorRule`, `AtRule` точно по §3 спеки.
- Produces `UnitRule { name: string; support: Support; note: string; source: string }` и `KindleSupportTable { properties: readonly PropertyRule[]; selectors: readonly SelectorRule[]; atRules: readonly AtRule[]; units: readonly UnitRule[] }`.
- Produces `CssFinding { from: number; to: number; severity: "warning" | "info"; code: string; params: Record<string, string> }` и `kindleSupport: KindleSupportTable`.

- [ ] Добавить failing tests `tableSourcesAndLocales`, `unverifiedRowsArePartial`, `uniqueRuleNames`: все source непусты, note есть в трёх локалях, нет повторных ключей. Для supported/unsupported требуется ссылка на записанный тест обоих устройств.
- [ ] Запустить `pnpm exec vitest run src/services/css-support/__tests__/kindle.test.ts`; ожидается FAIL из-за отсутствия модуля.
- [ ] Добавить зависимости `pnpm add @lezer/css css-tree@^3.2.1` и `pnpm add -D @types/css-tree@^3.2.0`; версия Lezer должна быть совместима с установленным lang-css. Добавить декларацию subpath из раздела DRY и проверить `pnpm exec vue-tsc --noEmit`. Проверить реальные имена узлов установленного parser небольшими деревьями CSS перед Task 2.
- [ ] Заполнить таблицу: свойства встроенной темы и шаблона, position/display, значения fixed/grid/flex, единицы vw/vh/rem, псевдоселекторы, комбинаторы, атрибуты, @media/@supports/@font-face. Источники собрать из отчёта AZW3, наблюдений Calibre и официальных Amazon Guidelines; при использовании внешних документов проверить их актуальные первичные страницы и записать URL/раздел. До device evidence все такие записи — partial. Не выдумывать результаты устройств.
- [ ] Для неизвестных свойств использовать `unknownProperty` warning: это отсутствие записи в модели, а не подтверждённый device verdict. Для неизвестных селекторов, единиц и at-rules — `unknownSelector`, `unknownUnit`, `unknownAtRule` info. `syntax` — info, `externalUrl` — warning о ресурсе вне images/. Все коды имеют переводы; записи таблицы используют `code`, равный `note` без префикса `cssSupport.`.
- [ ] Повторить targeted tests; ожидается PASS. Commit `feat: define sourced Kindle CSS support table`.

### Task 2: Чистый анализатор CSS

**Files:** check.ts, check.test.ts; при необходимости уточнить данные kindle.ts.

**Interfaces:** Consumes Task 1. Produces `checkKindleCss(css: string, table: KindleSupportTable = kindleSupport): CssFinding[]`. Диапазоны — UTF-16 offsets, как у Lezer и CodeMirror; порядок from/to/code, точные дубликаты удалены.

- [ ] Написать failing tests на тестовой таблице, где имеются все три Support: имя свойства, keyword override, единица, каждый selector pattern, at-rule, внешний URL. Проверять `css.slice(from, to)` на точное имя/keyword/единицу/селектор/URL. Keyword override имеет приоритет над общей поддержкой свойства; не создавать две одинаковые диагностики одного объявления.
- [ ] Добавить `syntaxOnceAndContinue`, `nestedMedia`, `ignoreCommentsAndStrings`, `escapedIdentifiers`, `nestedFunctionsAndCalc`, `unicodeOffsets`, `emptyCss`. Например, в `/* display:grid */ p { content: "10vh :hover"; width: calc(1em + 2vw); }` предупреждение единицы относится только к vw. Использовать отдельный fixture malformed CSS, где Lezer восстанавливает следующее валидное объявление.
- [ ] Добавить URL fixtures: images/a.png и quoted URL внутри images/ допустимы; https:, data:, ../images/, images/../ и абсолютный путь получают externalUrl; `content: "url(https://x)"` игнорируется. Разбирать узлы вызова url, учитывать escapes, не искать URL regex по всему документу.
- [ ] Запустить `pnpm exec vitest run src/services/css-support/__tests__/check.test.ts`; ожидается FAIL.
- [ ] Реализовать обход `parser.parse(css)`, нормализацию CSS identifiers через `ident.decode` из `css-tree/utils`, контекст деклараций и функций. Quoted strings декодировать через `string.decode`, unquoted url tokens — через `url.decode`; offsets брать из исходного дерева, а не декодированных строк. Error node даёт один syntax info; recovery tree продолжает обходиться. Не проверять слова внутри строк как units/keywords. Исключить comments и ошибочные токены из compatibility traversal. Значения регистронезависимы там, где этого требует CSS; пользовательские имена `--*` не нормализовать как обычные свойства.
- [ ] Зафиксировать тестом conservative policy custom properties/var(): info об ограничении KF8, без попытки вычислять cascade. Для неизвестного свойства не добавлять догадки о его keyword values.
- [ ] Проверить `themeCss` из `src/assets/epub/theme.css.ts`: нет warning о неподдержке и нет syntax finding. Существующий `:has(> img:only-child)` не считать supported без device evidence; допускается partial info. Проверить и шаблон customCssTemplate на синтаксис.
- [ ] Повторить targeted tests, ожидается PASS. Commit `feat: analyze CSS syntax and Kindle compatibility`.

### Task 3: Диагностики на уровне открытой книги

**Files:** use-css-support.ts, его тест; diagnostics.ts, stores.test.ts; EditorView.vue.

**Interfaces:** Consumes Task 2. Produces `useCssSupport(): void`, `diagnostics.css: CssFinding[]`, `setCssFindings(findings: CssFinding[]): void`, `clearCss(): void`. `clear()` очищает и CSS. Findings хранят ключи, а не локализованные строки.

- [ ] Failing tests с fake timers: при открытии книги результаты доступны сразу; изменение customCss пересчитывается через 150 ms; null/пустой CSS очищает findings; dispose отменяет timer; смена `bookGeneration` сбрасывает предыдущие данные даже при одинаковом metadata.id. CSS findings входят в store count один раз и сохраняют severity info.
- [ ] Запустить `pnpm exec vitest run src/composables/__tests__/use-css-support.test.ts src/stores/__tests__/stores.test.ts`; новые проверки ожидаемо FAIL.
- [ ] Реализовать composable с `useDebounceFn(..., 150)` из `@vueuse/core` и вызвать ровно один раз в EditorView. Watch bookGeneration и book.customCss; на смене книги отменять pending работу, очищать/пересчитывать сразу. При правке очищать устаревшие диапазоны до нового результата. Не анализировать customCssTemplate, если его ещё нет в книге.
- [ ] Сохранить существующие parse/book/read API; CSS не помещать в `bookWarnings`, иначе последующий setBookWarnings потеряет данные. Добавить CSS в all/count без преобразования в Diagnostic главы.
- [ ] Повторить targeted tests, ожидается PASS. Commit `feat: track CSS findings throughout book lifecycle`.

### Task 4: Подчёркивания и переход из списка проблем

**Files:** css-diagnostics.ts, CssEditor.vue, WarningsPopover.vue, StatusBar.vue, EditorView.vue, соответствующие тесты, locales.

**Interfaces:**

- Consumes `diagnostics.css` из Task 3.
- Produces `cssLintDiagnostics(findings: readonly CssFinding[], translate: (key: string, params: Record<string, string>) => string): import("@codemirror/lint").Diagnostic[]`.
- Produces `WarningSelection = { chapterId?: string; position?: DiagnosticPosition } | { kind: "css"; from: number; to: number }` в types/diagnostics.ts; использовать во всех трёх звеньях события.
- CssEditor expose `focusRange(range: { from: number; to: number }): void`.

- [ ] Failing EditorState tests: setDiagnostics появляются и очищаются; warning/info сохраняются; локализация использует `cssSupport.${code}` с params. Компонентные tests: изменение locale обновляет tooltips без правки книги; info получает dotted underline, warning wavy; пустой список снимает подчёркивания.
- [ ] Failing navigation tests: Book содержит Styles с общим count и раскрываемыми findings; badge считает findings один раз; выбор конкретного finding открывает CSS, выделяет диапазон, прокручивает и фокусирует editor. Проверить переход из preview-only mode: редактор должен стать видимым. Проверить ограничение диапазона длиной актуального документа и старые chapter-переходы.
- [ ] Запустить `pnpm exec vitest run src/components/editor/__tests__/css-diagnostics.test.ts src/components/editor/__tests__/CssEditor.test.ts src/components/editor/__tests__/WarningsPopover.test.ts src/views/__tests__/EditorView.test.ts`; новые tests ожидаемо FAIL.
- [ ] Реализовать lint adapter, применить штатный `setDiagnostics` к CssEditor, watcher на findings и locale, focusRange с clamp. Не подключать параллельный `linter()` с собственным debounce. Dotted info реализовать только theme override `.cm-lintRange-info`; tooltip и диапазоны предоставляет CodeMirror. Уничтожение view останавливает только подписки UI, не диагностики книги.
- [ ] Добавить Styles в Book группу, с раскрытием конкретных локализованных сообщений и offsets. Расширить emit types по цепочке WarningsPopover → StatusBar → EditorView; CSS branch обрабатывать до fallback на chapterId, после nextTick вызвать CssEditor ref. Не использовать chapter position для CSS.
- [ ] Повторить targeted tests, ожидается PASS. Commit `feat: show and navigate Kindle CSS diagnostics`.

### Task 5: Предупреждения экспорта без блокировки

**Files:** use-export.ts, ExportDialog.vue, их тесты.

**Interfaces:** Consumes Task 2. Добавить `ExportController.cssFindings: ComputedRef<CssFinding[]>`, сохранить существующий `warnings` для checkBook. ExportDialog локализует CSS findings при render.

- [ ] Failing controller tests: cssFindings актуальны сразу после правки без ожидания 150 ms; null/пустой CSS дают []; синтаксические и unsupported findings не мешают вызову builder и writeFileAtomic для EPUB и AZW3. Проверять реальные success/failure пути существующих фейков, не только enabled кнопки.
- [ ] Failing dialog tests: видны сообщения всех severity; locale меняет текст; повторные findings одного code имеют разные стабильные ключи from/to/code; кнопка экспорт остаётся доступной.
- [ ] Запустить `pnpm exec vitest run src/composables/__tests__/use-export.test.ts src/components/export/__tests__/ExportDialog.test.ts`; новые tests ожидаемо FAIL.
- [ ] Реализовать computed через `checkKindleCss(project.book?.customCss ?? "")`, без зависимости от mounted editor или debounce. Добавить сообщения к warning summary в диалоге. Не менять builder dependencies, содержимое CSS, сохранение книги или поведение отмены.
- [ ] Повторить targeted tests, ожидается PASS. Commit `feat: include advisory CSS findings in export summary`.

### Task 6: Fixture, документация и общая проверка

**Files:** scripts/build-fixture-azw3.mts, docs/release-checklist.md; при необходимости tests fixture generation рядом с существующими script tests.

**Interfaces:** Consumes table/checker и существующий AZW3 fixture pipeline. CSS fixture содержит отдельную главу с видимым образцом на каждый проверяемый ряд и идентификатором результата, пригодным для `source`.

- [ ] Добавить CSS samples отдельной главой существующего CSS fixture, сохранив четыре текущих export fixtures и семантические ожидания независимого verifier. Зафиксировать fixture identifiers, property/value/selector/at-rule и ожидаемый вид образца; не считать наличие декларации доказательством рендера на Kindle.
- [ ] Обновить release checklist: RU/EN/zh-CN, editor diagnostics и переход, экспорт при warning/info, оба Paperwhite с firmware, датой, app version и результатом каждого CSS sample. Непроверенные строки остаются partial. Для изменения статуса таблицы нужны результаты обоих устройств.
- [ ] Запустить `pnpm check` и `pnpm build`; ожидается exit 0. Запустить `pnpm build:fixture-azw3` и `pnpm test:verify-azw3`; ожидается exit 0. Если Calibre 9.15.0 доступен, `pnpm verify:azw3`; записать фактический результат. Недоступные device/packaged проверки оставить открытыми.
- [ ] Проверить diff: нет реализации fonts/quick fixes, нет запрещённых импортов, обновления CSS диагностики не вызывают revision++, все новые locale keys совпадают. Commit `test: document Kindle CSS compatibility verification`.

## Самопроверка плана

- §1/prerequisite: CSS highlighting уже реализован в css-language.ts; Task 1 добавляет прямой parser dependency и готовые helpers CSS Tree без второго parser.
- §2/§6: advisory-only и три уровня — Tasks 1, 2, 5.
- §3/sources и device fixtures — Tasks 1, 6; неподтверждённых supported/unsupported записей нет.
- §4: каждый вид проверки, диапазоны и синтаксическое recovery — Task 2.
- §5: lint/debounce, Styles, навигация, export и три локали — Tasks 3–5.
- §7: integrity, nested CSS, ignored strings/comments, тема, EditorState — Tasks 1, 2, 4.
- §8/§9: AZW3 evidence используется в таблице; firmware детализация и quick fixes отложены.
- Все пять Review Focus имеют явные тесты. Интерфейсы смежных задач совпадают; CSS info не смешивается с диагностикой NovLang.

## Перед реализацией

План готов для ревью. Рекомендуемый способ выполнения — `superpowers:executing-plans`: задачи последовательно используют одну таблицу и один анализатор. Запуск реализации — отдельный следующий запрос пользователя; в текущей задаче меняются только ветка и этот документ.
