# CSS checker: анализ внешних библиотек

Дата: 2026-10-05. Контекст: `2026-10-03-kindle-css-checker-design.md`, план `2026-10-05-kindle-css-checker.md`.

## Решение

Для текущей спеки использовать Lezer CSS для разбора и добавить `css-tree@^3.2.1` ради публичного `css-tree/utils`: ident/string/url decoding. Это заменяет самописную обработку CSS escapes с небольшим runtime overhead. CodeMirror lint и VueUse debounce остаются как в плане. Полный CSS Tree lexer и набор PostCSS пока не добавлять.

Это вывод из эксперимента, а не запрет новых зависимостей. Дополнительная библиотека оправдана, если заменяет сложную стандартную механику; готового Kindle support dataset ни у рассмотренных инструментов нет, таблица и правила применения остаются кодом проекта.

## Сравнение

| Вариант                                        | Что переиспользуется                                                                   | Что остаётся своим / цена                                                                                                                       | Вывод                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Lezer CSS                                      | Grammar, token boundaries, offsets, recovery                                           | Обход конкретного дерева, Kindle policy, escapes                                                                                                | Хорошая основа: уже нужен lang-css и закреплён спекой                                                         |
| Lezer + CSS Tree utils                         | Дополнительно стандартные escapes identifiers/strings/URL                              | Ещё npm package с mdn-data/source-map-js на диске; короткая декларация TS subpath                                                               | Использовать: существенно уменьшает риск ошибок в escapes                                                     |
| CSS Tree parser + walker                       | Семантические Declaration/Dimension/Url/Selector nodes, traversal, recovery, offsets   | Второй parser рядом с Lezer в editor; адаптация плана и спеки; точный property/unit range иногда надо извлекать отдельно                        | Реальная альтернатива, но для текущего scope выигрыш не покрывает дополнительные grammar/recovery расхождения |
| Полный CSS Tree с lexer                        | Проверка грамматики значений CSS по словарям, например `color: definitely-not-a-color` | Словари обычного CSS не описывают Kindle; var() и custom properties требуют отдельной политики; заметно больше runtime code/data                | Вернуться, если понадобится общая семантическая валидация значений, которой текущая спека не требует          |
| PostCSS + safe parser + selector/value parsers | AST объявлений и отдельных значений/селекторов, error recovery                         | Несколько AST и преобразований диапазонов, пакетная конфигурация; safe parser исправляет ошибки, а не заменяет отчёт о каждой ошибке            | Overhead для checker без CSS transformation pipeline                                                          |
| Только postcss-selector-parser/value-parser    | Семантические AST фрагментов                                                           | Повторный разбор фрагментов, offset translation; весь CSS всё равно разбирает Lezer                                                             | Не добавлять: дублирует уже разобранную структуру                                                             |
| Stylelint                                      | Готовые lint rules, конфигурация, plugins                                              | Node engine/API, CLI/fs/config инфраструктура и 35 прямых runtime dependencies в проверенном релизе 17.16.0; правила Kindle всё равно отдельные | Overhead для WebView checker; рассматривать отдельно для developer CI lint                                    |
| cssesc                                         | Кодирование CSS strings/identifiers                                                    | Требуется декодирование, а не кодирование                                                                                                       | Не решает нужную задачу                                                                                       |

Источники: [CSS Tree API и subpath exports](https://github.com/csstree/csstree), [parsing/recovery/positions](https://github.com/csstree/csstree/blob/master/docs/parsing.md), [helpers](https://github.com/csstree/csstree/blob/master/docs/utils.md), [PostCSS API](https://postcss.org/api/), [safe parser](https://github.com/postcss/postcss-safe-parser), [selector parser](https://github.com/postcss/postcss-selector-parser), [value parser](https://github.com/postcss/postcss-value-parser), [Stylelint dependencies](https://github.com/stylelint/stylelint/blob/main/package.json), [cssesc](https://github.com/mathiasbynens/cssesc).

## Измерения

Установка только в `/private/tmp/edb-css-library-audit`; package.json/lockfile проекта не менялись. Проверены css-tree 3.2.1, @types/css-tree 3.2.0, postcss 8.5.29, safe-parser 7.1.0, selector-parser 7.1.6, value-parser 4.2.0, esbuild 0.28.2; Lezer из установленного lang-css проекта.

Отдельные browser ESM bundles с esbuild, minify, gzip Node zlib по умолчанию. Это сравнение экспортируемых API, не размер установленного npm package и не дельта production Vite build. Lezer уже входит в приложение: его строку нельзя считать новой нагрузкой.

| Экспортируемые API                             | Minified bytes | Gzip bytes |
| ---------------------------------------------- | -------------: | ---------: |
| Lezer parser                                   |         80 538 |     28 812 |
| CSS Tree utils: ident/string/url               |          3 213 |      1 348 |
| Lezer + CSS Tree utils                         |         83 826 |     30 088 |
| CSS Tree parser + walker + utils               |         65 636 |     18 403 |
| CSS Tree parser + walker + lexer + utils       |        201 390 |     56 580 |
| Только helpers, импорт из корня css-tree       |        201 355 |     56 561 |
| PostCSS selector + value parsers               |         69 117 |     16 729 |
| PostCSS + safe parser + selector/value parsers |        128 502 |     35 412 |

Utils добавили к Lezer 3 288 bytes minified и 1 276 bytes gzip в этом эксперименте. Отличие от standalone объясняется объединением и сжатием bundle. Для десктопной поставки важнее minified размер; gzip приведён для сравнения, а не как размер установленного приложения. Runtime benchmark не проводился: выводов о скорости нет. Финальный размер и TS compilation надо проверить в реальном Vite build Task 1/6.

## Проверка поведения и API

- `ident.decode('d\\69 splay')` → `display`.
- `string.decode('"images/\\61 .png"')` → `images/a.png`.
- `url.decode('url(images/\\61 .png)')` → `images/a.png`.
- CSS Tree с `positions: true` возвращает offsets на исходную строку, распознаёт `2vw` внутри calc и декодирует Url node; идентификатор property остаётся escaped, нужен ident.decode.
- `p { color red; display: grid; }`: CSS Tree сообщает ошибку colon, сохраняет Raw и следующее корректное объявление.
- `p { color: red`: tolerant CSS Tree parser не вызывает onParseError на незакрытом блоке; его recovery policy отличается от ожидаемой редакторной диагностики. Это не баг библиотеки и не исчерпывающее сравнение с Lezer.
- `p { color: definitely-not-a-color; }`: CSS Tree parser принимает значение; общую грамматику значений проверяет отдельный lexer, простой переход на другой parser не даёт полного syntax/semantic lint.
- Public subpaths `css-tree/parser` и `css-tree/walker` используют default exports. `css-tree/utils` — named namespaces. Проверенный @types/css-tree описывает root helpers, без subpath declaration; план добавляет type-only re-export, а не собственные signatures. Такой re-export проверен локальным TypeScript проекта с strict/nodenext: exit 0; финальная проверка vue-tsc остаётся задачей реализации.

## Воспроизведение

Скрипт: `2026-10-05-css-library-audit.mjs` рядом с этим документом. Установить перечисленные версии в отдельный временный каталог; скопировать туда скрипт, запустить из каталога установки с `EDB_REPO` равным пути checkout проекта. Скрипт ничего не меняет в проекте и сборки держит в памяти.

Проверить после реализации: импорт именно `css-tree/utils`, отсутствие parser/lexer/MDN data в добавленном runtime graph, TypeScript resolution декларации subpath, реальные Vite bundle sizes. На Kindle проверяется support table, а не корректность JavaScript parser.
