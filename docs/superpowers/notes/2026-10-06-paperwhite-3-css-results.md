# Результаты CSS на Kindle Paperwhite 3 — 2026-10-06

Этот отчёт сохраняет первый прогон. После уточняющих замеров актуальные
выводы записаны в [итоге двух книг](2026-10-06-paperwhite-3-css-conclusions.md).
Рекомендации повторить спорные тесты ниже относятся к моменту первого анализа;
повторная книга уже проверена, новый прогон для итоговых выводов не требуется.

Источник: [исходный CSV](2026-10-06-paperwhite-3-css-results.csv), сохранён без изменений.
Пользователь подтвердил прошивку **5.16.2.1.1** и чтение **исходного AZW3**.
В CSV размер шрифта 3, вертикальная ориентация. Инкремент версии прошивки
по строкам — артефакт заполнения, а не проверки разных прошивок.
Гарнитура и настройка шрифта издателя не записаны; повторных измерений
с другой ориентацией/размером шрифта в файле нет.

Все 142 ID, номера и CSS совпали с manifest книги. Пропусков, дублей и
пустых результатов нет. 134 случая из таблицы приложения, 8 дополнительных.
При анализе «НЕ РАБОТАЕТ» объединено с «НЕТ», «НЕОПРЕДЕЛЕН» нормализовано
в «НЕОПРЕДЕЛЁН». Исходный файл не нормализован.

| Сырой результат   | Количество |
| ----------------- | ---------: |
| ДА                |         99 |
| НЕТ / НЕ РАБОТАЕТ |         26 |
| ЧАСТИЧНО          |          4 |
| НЕОПРЕДЕЛЁН       |         13 |

## Выводы из наблюдений

Положительные эффекты отмечены у большинства фонов, рамок, размеров,
отступов, шрифтов, списков, float/clear, относительного позиционирования,
счётчиков, content, opacity и z-index. Это свидетельства для конкретных
значений и контекстов, а не всех возможностей каждого свойства.
text-transform:uppercase работает в образце и с кириллицей.

Положительные результаты единиц: em, rem, px, pt, pc, cm, mm, in, ex, %.
Отрицательные: ch, vw, vh, vmin, vmax, dvw, dvh, svw, svh, lvw, lvh.
Это проверка видимого отступа: физические размеры и масштабирование при
смене шрифта/ориентации отдельно не подтверждены.

Другие отрицательные результаты: :visited, :has(), :is(), :where(),
::first-line, @supports, @layer, @media amzn-kf8, @page с margin:2em,
CSS-переменные/var(), calc(), transform, page-break-after и break-inside.
Ограничения некоторых образцов перечислены ниже. Наблюдение по условию
amzn-kf8 не распространяется на весь @media. Отрицательный эффект не
является ошибкой синтаксиса CSS.

Дополнительные положительные результаты: !important, box-shadow и
hyphens:auto. Для hyphens тест смешивает два фактора и требует уточнения.

## Ограничения тестовой книги и интерпретация

Основание — генератор и CSS/XHTML исходного EPUB, сопоставленные с комментариями.

|              № | Причина                                                                        | Как интерпретировать                                                                                                                     |
| -------------: | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
|             26 | display:block задан уже блочному div; вложенные span остаются inline           | Мой образец не различает поддержку. «НЕТ» не доказывает несовместимость display:block. Повторить на span с inline → block.               |
|          27–30 | Два коротких span могут стоять рядом и без flex/grid                           | Сохранить неопределённость. Нужны контрастный контроль block, явные размеры/колонки/направление.                                         |
|             76 | word-wrap: оба блока уже переносят длинное слово                               | Поддержка не доказана. Сравнить explicit normal и break-word при одинаковой ширине.                                                      |
|         83, 85 | Комментарий об иконке; p:first-child/p:only-child выбирают p, не вложенный img | Отсутствие отдельной рамки у img не доказывает частичную поддержку. Проверить рамку самого p; для img сделать другой селектор.           |
|             63 | Три position:fixed блока с одинаковыми bottom/left наложились внизу            | Положительный эффект ожидаемого позиционирования, с риском перекрытия текста. Поведение между страницами отдельно не описано.            |
|             38 | height дал дополнительное место и наложение у границы страницы                 | Свойство оказывает эффект. Уточнить коротким текстом и разными overflow; отличить ограничение высоты от пагинации/переполнения.          |
|              3 | Белый фон картинки сохраняется поверх background-color                         | Само по себе не ограничение CSS: фон не заменяет непрозрачные пиксели JPEG.                                                              |
|              7 | background-size немного увеличил картинку                                      | Оставить неопределённым; сравнить контрастные 1em/4em.                                                                                   |
|             19 | bottom: «в обоих случаях есть отступ»                                          | Отступ не измеряет сдвиг. Нужна неподвижная опорная линия.                                                                               |
| 64, 78–80, 112 | sticky, hover/active/focus и animation не наблюдались                          | Недоступное состояние/движение не равно отсутствию поддержки. Сохранить неопределённость.                                                |
|            105 | @media amzn-kf8 не дал эффекта                                                 | Результат только этого условия. Отдельно проверить all/screen/width.                                                                     |
|            107 | @font-face local(Caecilia) дал эффект                                          | Локальный поиск, не проверка встраивания TTF/OTF.                                                                                        |
|            108 | Внутренний @import сработал                                                    | В AZW3 ссылка ведёт к реальному kindle:flow CSS. Это не проверка сетевых импортов и не снятие ограничений приложения.                    |
|            109 | @charset неопределён                                                           | UTF-8 работает и без директивы; образец не различает её поддержку.                                                                       |
|            110 | @namespace с XHTML-селекторами дал эффект                                      | Положительный результат именно этого namespace/селектора.                                                                                |
|             99 | ::first-line не дал эффекта; инструкция также ожидала рамку                    | Рамка — неподходящий индикатор first-line. Подчёркивание полезно, но повторить многострочным текстом с цветом/начертанием первой строки. |
|            140 | page-break-after отрицательно                                                  | Повторить короткими блоками с ясными метками страниц; возможен вклад KF8-пагинации/упаковки.                                             |
|            141 | break-inside отрицательно; положение у границы не задаётся                     | Без подтверждения, что блок пересекает страницу и помещается на следующей, отсутствие эффекта не различает поддержку.                    |
|            142 | Одновременно включены width:8em и hyphens:auto                                 | Смешаны ширина и переносы. Повторить при одинаковой ширине с none/manual/auto.                                                           |

Для строки 99: [W3C CSS Pseudo-Elements §2.1.2](https://www.w3.org/TR/css-pseudo-4/#first-line-styling) перечисляет свойства, применимые к first-line. Border не входит в обязательный набор; шрифт, цвет и text-decoration подходят для проверки. Это пояснение семантики CSS, а не свидетельство о Kindle.

## Применение к приложению

Хранить наблюдения отдельно по модели, прошивке, формату, точному CSS и
ограничениям образца. Положительный тест одного значения не означает
полной поддержки свойства. Результаты PW3 не распространяются на PW12.
В текущих правилах проекта универсальные supported/unsupported требуют
проверок обоих устройств, поэтому production-таблица этим анализом не
изменена. Данные PW3 теперь являются источником доказательств; PW12 открыт.

Для будущего UI полезны сведения по отдельным моделям — это предложение,
а не выполненная смена архитектуры. Приоритет повторной книги: display,
word-wrap, first-child/only-child, hyphens; затем media conditions,
позиционирование/высота, first-line и пагинация. Для единиц повторить два
размера шрифта и обе ориентации. Перепроверять весь набор с нуля не требуется.

## Полный реестр исходных наблюдений

SHA-256 исходного CSV: `0907e22587fab82595ce9d7fc7daa0fe08c2b8866cda7724d8de3ed9e4d3c629`.

|   № | ID                                     | Результат   | Комментарий                                                                                                                                            |
| --: | -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | `property-background`                  | ДА          | -                                                                                                                                                      |
|   2 | `property-background-attachment`       | НЕОПРЕДЕЛЁН | Изображение просто пропало из тестируемого блока                                                                                                       |
|   3 | `property-background-color`            | ДА          | Под самим изображением background не окрашивается, это видно по белому фону на скруглении изображения                                                  |
|   4 | `property-background-image`            | ДА          | Изображение под текстом есть                                                                                                                           |
|   5 | `property-background-position`         | ДА          | Все 3 изображения по центру                                                                                                                            |
|   6 | `property-background-repeat`           | ДА          | Задний фон заполнен изоюражением                                                                                                                       |
|   7 | `property-background-size`             | НЕОПРЕДЕЛЁН | Изображение стало совсем немного больше, не уверен, тот ли это эффект                                                                                  |
|   8 | `property-border`                      | ДА          | -                                                                                                                                                      |
|   9 | `property-border-bottom`               | ДА          | —                                                                                                                                                      |
|  10 | `property-border-color`                | ДА          | —                                                                                                                                                      |
|  11 | `property-border-left`                 | ДА          | —                                                                                                                                                      |
|  12 | `property-border-right`                | ДА          | —                                                                                                                                                      |
|  13 | `property-border-style`                | ДА          | —                                                                                                                                                      |
|  14 | `property-border-top`                  | ДА          | —                                                                                                                                                      |
|  15 | `property-border-width`                | ДА          | —                                                                                                                                                      |
|  16 | `property-border-radius`               | ДА          | —                                                                                                                                                      |
|  17 | `property-border-collapse`             | ДА          | —                                                                                                                                                      |
|  18 | `property-border-spacing`              | ДА          | —                                                                                                                                                      |
|  19 | `property-bottom`                      | НЕОПРЕДЕЛЁН | В обоих случаях есть отступ                                                                                                                            |
|  20 | `property-clear`                       | ДА          | —                                                                                                                                                      |
|  21 | `property-color`                       | ДА          | —                                                                                                                                                      |
|  22 | `property-content`                     | ДА          | —                                                                                                                                                      |
|  23 | `property-counter-increment`           | ДА          | —                                                                                                                                                      |
|  24 | `property-counter-reset`               | ДА          | —                                                                                                                                                      |
|  25 | `property-direction`                   | ДА          | —                                                                                                                                                      |
|  26 | `property-display`                     | НЕТ         | —                                                                                                                                                      |
|  27 | `value-display-grid`                   | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  28 | `value-display-inline-grid`            | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  29 | `value-display-flex`                   | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  30 | `value-display-inline-flex`            | НЕОПРЕДЕЛЁН | Все 5 тестов по block/grid/flex выглядят одинаково между контрольным и тестовым                                                                        |
|  31 | `property-float`                       | ДА          | —                                                                                                                                                      |
|  32 | `property-font`                        | ДА          | —                                                                                                                                                      |
|  33 | `property-font-family`                 | ДА          | —                                                                                                                                                      |
|  34 | `property-font-size`                   | ДА          | —                                                                                                                                                      |
|  35 | `property-font-style`                  | ДА          | —                                                                                                                                                      |
|  36 | `property-font-variant`                | ДА          | —                                                                                                                                                      |
|  37 | `property-font-weight`                 | ДА          | —                                                                                                                                                      |
|  38 | `property-height`                      | ЧАСТИЧНО    | В слове Width буква h перенеслась на новую строку + новую страницу и слилась с первой буквой "Третий", сам блок еще имеет дополнительное место в конце |
|  39 | `property-left`                        | ДА          | —                                                                                                                                                      |
|  40 | `property-letter-spacing`              | ДА          | —                                                                                                                                                      |
|  41 | `property-line-height`                 | ДА          | —                                                                                                                                                      |
|  42 | `property-list-style`                  | ДА          | —                                                                                                                                                      |
|  43 | `property-list-style-image`            | ДА          | —                                                                                                                                                      |
|  44 | `property-list-style-position`         | ДА          | Маркеры стоят чуть правее                                                                                                                              |
|  45 | `property-list-style-type`             | ДА          | Аналогично правилу 42                                                                                                                                  |
|  46 | `property-margin`                      | ДА          | —                                                                                                                                                      |
|  47 | `property-margin-top`                  | ДА          | —                                                                                                                                                      |
|  48 | `property-margin-bottom`               | ДА          | —                                                                                                                                                      |
|  49 | `property-margin-left`                 | ДА          | —                                                                                                                                                      |
|  50 | `property-margin-right`                | ДА          | —                                                                                                                                                      |
|  51 | `property-max-height`                  | ДА          | Работает как height, так и max-height                                                                                                                  |
|  52 | `property-max-width`                   | ДА          | Работает как width, так и max-width                                                                                                                    |
|  53 | `property-min-height`                  | ДА          | —                                                                                                                                                      |
|  54 | `property-min-width`                   | ДА          | —                                                                                                                                                      |
|  55 | `property-opacity`                     | ДА          | —                                                                                                                                                      |
|  56 | `property-overflow`                    | ДА          | —                                                                                                                                                      |
|  57 | `property-padding`                     | ДА          | —                                                                                                                                                      |
|  58 | `property-padding-top`                 | ДА          | —                                                                                                                                                      |
|  59 | `property-padding-bottom`              | ДА          | —                                                                                                                                                      |
|  60 | `property-padding-left`                | ДА          | —                                                                                                                                                      |
|  61 | `property-padding-right`               | ДА          | —                                                                                                                                                      |
|  62 | `property-position`                    | ДА          | —                                                                                                                                                      |
|  63 | `value-position-fixed`                 | ДА          | Текст наложился друг на друга снизу                                                                                                                    |
|  64 | `value-position-sticky`                | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  65 | `property-right`                       | ДА          | Текст с рамкой вышел за пределы главной рамки                                                                                                          |
|  66 | `property-text-align`                  | ДА          | —                                                                                                                                                      |
|  67 | `property-text-decoration`             | ДА          | —                                                                                                                                                      |
|  68 | `property-text-indent`                 | ДА          | —                                                                                                                                                      |
|  69 | `property-text-transform`              | ДА          | Не только латинский текст, но и кириллический                                                                                                          |
|  70 | `property-top`                         | ДА          | —                                                                                                                                                      |
|  71 | `property-vertical-align`              | ДА          | —                                                                                                                                                      |
|  72 | `property-visibility`                  | ДА          | —                                                                                                                                                      |
|  73 | `property-white-space`                 | ДА          | —                                                                                                                                                      |
|  74 | `property-width`                       | ДА          | —                                                                                                                                                      |
|  75 | `property-word-spacing`                | ДА          | —                                                                                                                                                      |
|  76 | `property-word-wrap`                   | ЧАСТИЧНО    | Оба примера разбивают длинное слово, значит по умолчанию уже стоит break-word                                                                          |
|  77 | `property-z-index`                     | ДА          | —                                                                                                                                                      |
|  78 | `selector-pseudo-class-hover`          | НЕОПРЕДЕЛЁН | Изменение состояния не наблюдается                                                                                                                     |
|  79 | `selector-pseudo-class-active`         | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  80 | `selector-pseudo-class-focus`          | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
|  81 | `selector-pseudo-class-link`           | ДА          | —                                                                                                                                                      |
|  82 | `selector-pseudo-class-visited`        | НЕТ         | —                                                                                                                                                      |
|  83 | `selector-pseudo-class-first-child`    | ЧАСТИЧНО    | Иконка книги не обводится                                                                                                                              |
|  84 | `selector-pseudo-class-last-child`     | ДА          | —                                                                                                                                                      |
|  85 | `selector-pseudo-class-only-child`     | ЧАСТИЧНО    | Иконка книги не обводится                                                                                                                              |
|  86 | `selector-pseudo-class-nth-child`      | ДА          | —                                                                                                                                                      |
|  87 | `selector-pseudo-class-nth-of-type`    | ДА          | —                                                                                                                                                      |
|  88 | `selector-pseudo-class-first-of-type`  | ДА          | —                                                                                                                                                      |
|  89 | `selector-pseudo-class-last-of-type`   | ДА          | —                                                                                                                                                      |
|  90 | `selector-pseudo-class-has`            | НЕТ         | —                                                                                                                                                      |
|  91 | `selector-pseudo-class-is`             | НЕТ         | —                                                                                                                                                      |
|  92 | `selector-pseudo-class-not`            | ДА          | —                                                                                                                                                      |
|  93 | `selector-pseudo-class-where`          | НЕТ         | —                                                                                                                                                      |
|  94 | `selector-pseudo-class-root`           | ДА          | —                                                                                                                                                      |
|  95 | `selector-pseudo-class-empty`          | ДА          | —                                                                                                                                                      |
|  96 | `selector-pseudo-element-before`       | ДА          | —                                                                                                                                                      |
|  97 | `selector-pseudo-element-after`        | ДА          | —                                                                                                                                                      |
|  98 | `selector-pseudo-element-first-letter` | ДА          | —                                                                                                                                                      |
|  99 | `selector-pseudo-element-first-line`   | НЕТ         | —                                                                                                                                                      |
| 100 | `selector-combinator-child`            | ДА          | —                                                                                                                                                      |
| 101 | `selector-combinator-adjacent`         | ДА          | —                                                                                                                                                      |
| 102 | `selector-combinator-sibling`          | ДА          | —                                                                                                                                                      |
| 103 | `selector-combinator-descendant`       | ДА          | —                                                                                                                                                      |
| 104 | `selector-attribute-attribute`         | ДА          | —                                                                                                                                                      |
| 105 | `at-rule-media`                        | НЕТ         | —                                                                                                                                                      |
| 106 | `at-rule-supports`                     | НЕТ         | —                                                                                                                                                      |
| 107 | `at-rule-font-face`                    | ДА          | —                                                                                                                                                      |
| 108 | `at-rule-import`                       | ДА          | —                                                                                                                                                      |
| 109 | `at-rule-charset`                      | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
| 110 | `at-rule-namespace`                    | ДА          | —                                                                                                                                                      |
| 111 | `at-rule-page`                         | НЕТ         | Даже заголовок с текстом "СПОРНЫЙ" остались на том же месте вплоть до пикселя                                                                          |
| 112 | `at-rule-keyframes`                    | НЕОПРЕДЕЛЁН | —                                                                                                                                                      |
| 113 | `at-rule-layer`                        | НЕТ         | —                                                                                                                                                      |
| 114 | `unit-em`                              | ДА          | —                                                                                                                                                      |
| 115 | `unit-rem`                             | ДА          | —                                                                                                                                                      |
| 116 | `unit-px`                              | ДА          | —                                                                                                                                                      |
| 117 | `unit-pt`                              | ДА          | —                                                                                                                                                      |
| 118 | `unit-pc`                              | ДА          | —                                                                                                                                                      |
| 119 | `unit-cm`                              | ДА          | —                                                                                                                                                      |
| 120 | `unit-mm`                              | ДА          | —                                                                                                                                                      |
| 121 | `unit-in`                              | ДА          | —                                                                                                                                                      |
| 122 | `unit-ex`                              | ДА          | —                                                                                                                                                      |
| 123 | `unit-ch`                              | НЕТ         | —                                                                                                                                                      |
| 124 | `unit-vw`                              | НЕТ         | —                                                                                                                                                      |
| 125 | `unit-vh`                              | НЕТ         | —                                                                                                                                                      |
| 126 | `unit-vmin`                            | НЕТ         | —                                                                                                                                                      |
| 127 | `unit-vmax`                            | НЕТ         | —                                                                                                                                                      |
| 128 | `unit-dvw`                             | НЕТ         | —                                                                                                                                                      |
| 129 | `unit-dvh`                             | НЕТ         | —                                                                                                                                                      |
| 130 | `unit-svw`                             | НЕТ         | —                                                                                                                                                      |
| 131 | `unit-svh`                             | НЕТ         | —                                                                                                                                                      |
| 132 | `unit-lvw`                             | НЕТ         | —                                                                                                                                                      |
| 133 | `unit-lvh`                             | НЕТ         | —                                                                                                                                                      |
| 134 | `unit-%`                               | ДА          | —                                                                                                                                                      |
| 135 | `extra-custom-properties`              | НЕТ         | —                                                                                                                                                      |
| 136 | `extra-calc`                           | НЕТ         | —                                                                                                                                                      |
| 137 | `extra-important`                      | ДА          | —                                                                                                                                                      |
| 138 | `extra-transform`                      | НЕТ         | —                                                                                                                                                      |
| 139 | `extra-box-shadow`                     | ДА          | —                                                                                                                                                      |
| 140 | `extra-page-break-after`               | НЕТ         | —                                                                                                                                                      |
| 141 | `extra-break-inside`                   | НЕТ         | —                                                                                                                                                      |
| 142 | `extra-hyphens`                        | ДА          | —                                                                                                                                                      |
