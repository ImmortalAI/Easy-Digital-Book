# Chapter markup (NovLang)

[Русский](../ru/markup.md) · **English** · [简体中文](../zh-CN/markup.md)

Chapters in Easy Digital Book are written in **NovLang**, a small
Markdown-like markup language for fiction. One file is one chapter. The
markup is parsed by the [`novlang-js`](https://www.npmjs.com/package/novlang-js)
library; this page describes what it supports and how the app uses the
result.

NovLang is **not** Markdown: it has no lists, links, code, tables or headings
inside the text. Anything the parser does not recognise is output as plain
text. No mistake can stop a chapter from opening; at worst you get a ⚠
warning.

## Cheat sheet

| What               | How to write it                         | Shortcut                            |
| ------------------ | --------------------------------------- | ----------------------------------- |
| Chapter heading    | `# Title` on the first line             | —                                   |
| Paragraph          | text; a blank line separates paragraphs | —                                   |
| Italic             | `*text*`                                | Mod+I                               |
| Bold               | `**text**`                              | Mod+B                               |
| Bold italic        | `***text***`                            | —                                   |
| Scene break        | `***` on a line of its own              | —                                   |
| Image              | `![caption](images/file.png)`           | paste / drag & drop                 |
| Footnote reference | `[^1]`                                  | Mod+Alt+F                           |
| Footnote text      | `[^1]: footnote text`                   | (inserted along with the reference) |
| Quote / letter     | `> ` at the start of every line         | —                                   |
| Escaping           | `\*`, `\[`, `\]`, `\!`, `\\`            | —                                   |

Mod is Ctrl on Windows and Linux, ⌘ on macOS.

## Chapter heading

```
# Chapter 12. Return to the Capital

The first paragraph of the chapter…
```

- A heading is allowed **only on the first line** of a chapter. `#` must be
  followed by a space.
- The app takes the chapter title from it for the sidebar, the EPUB table of
  contents and the page `<title>`.
- Without a heading the chapter is called "Chapter N" (N is its position in
  the book) and a ⚠ appears in the book's warnings. That title is **not**
  added to the chapter text.
- `#` on any other line is plain text: `# A late heading` on the second line
  is shown as is, hash included.

## Paragraphs

Paragraphs are separated by a **blank line**. A single line break does not
end a paragraph: the lines are joined and the reader wraps the text itself.

```
The first line of a paragraph
and its continuation.

This is the second paragraph.
```

First-line indents and spacing come from the book theme; there is no need to
indent paragraphs with spaces.

## Italic and bold

```
This is *italic*, this is **bold**, and this is ***both***.
Nesting works too: *quietly, **very** quietly*.
```

- Mod+I / Mod+B wrap the selection in `*` / `**`. Pressing the shortcut again
  removes the markup. Without a selection a pair of markers is inserted with
  the cursor between them.
- Nesting works when the markers are separated by spaces, as above. When the
  inner markers touch the text (`*a**b**c*`), NovLang does not nest them and
  splits the run into three separate italic pieces. No text is lost, but if
  you want nesting, use spaces.
- An unclosed marker (`Start *of italic with no end.`) is shown as a literal
  asterisk and produces the warning "Unmatched '*' delimiter".

## Scene break

Three asterisks **alone on a line**, with blank lines around them:

```
…and the door closed behind him.

***

The morning was cold.
```

The book shows a centred `⁘` ornament in its place.

## Images

```
![Map of the Northern Lands](images/map.png)
```

- The text in `[]` is the alternative caption (alt); it may be empty:
  `![](images/map.png)`.
- The path is **relative to the project root**; all images live in
  `images/`. Files outside the project cannot be referenced directly: import
  the image into the project first. Ways to do it:
  - drag a file into the editor or paste an image from the clipboard (it is
    named `pasted-YYYYMMDD-HHmmss.png`) — the image is inserted into the text
    right there as a separate paragraph `![](images/…)`, with the cursor
    inside `[]`;
  - click + in the Explorer's "Images" section — the image is only added to
    the project; to put it into the text use "Insert in text" from the
    image's context menu.

  The app copies the file into `images/` and cleans up its name (Latin
  letters, digits, `-`). Identical images are not duplicated.

- JPEG, PNG, GIF and WebP are supported. On export images are optimised for
  the selected preset (size, format and optionally greyscale).
- An image may also sit inside a paragraph (`Text ![](images/i.png) text`),
  but illustrations work better as a paragraph of their own.
- A reference to a missing file produces a "missing image" ⚠. On export such
  an image is simply skipped.

## Footnotes

```
The master spoke of qi[^1] as if it were something you could touch.

[^1]: Qi is the vital energy of Chinese tradition.
```

- `[^1]` is the reference in the text, `[^1]: …` is the footnote text. The
  definition may go anywhere in the chapter; the end is most convenient.
- The label does not have to be a number: `[^qi]` or `[^a]` work too.
- **Mod+Alt+F** inserts a reference with the next free number at the cursor,
  appends an empty definition `[^N]: ` to the end of the chapter and moves
  the cursor there.
- Footnote text may span several consecutive lines, up to a blank line.
- Footnotes only work within their own chapter.
- A reference without a definition is shown as `[2]` and produces the
  warning `Footnote reference "^2" has no matching definition`.
- On Kindle footnotes open in a popup. The app preview shows them at the
  bottom of the chapter.

## Quotes and letters

`>` and a space at the start of **every** line. A line containing only `>`
separates paragraphs inside the quote:

```
> Dear friend,
>
> I am writing to you from the capital.
> Nothing has changed here.

Plain text again after the letter.
```

## Escaping

A backslash cancels the special meaning of the next character, but only
before `*`, `[`, `]`, `!` and `\`:

| You write             | You get                 |
| --------------------- | ----------------------- |
| `2 \* 3 = 6`          | `2 * 3 = 6`             |
| `\*not italic\*`      | `*not italic*`          |
| `\[^1\]`              | `[^1]` (not a footnote) |
| `\![not an image](x)` | `![not an image](x)`    |
| `C:\\Games`           | `C:\Games`              |

Before any other character `\` stays in the text: `\>` is shown as `\>`.

## What NovLang does not have

Links `[text](url)`, lists, code, tables, horizontal rules `---`,
subheadings inside a chapter, HTML tags. All of these are output as plain
text. Formatting (fonts, indents, alignment) is not set by markup but by the
book theme and the optional `styles/custom.css` file ("Styles" in the
Explorer).

## custom.css on Kindle

The book theme only uses styling that works on Kindle. If you add your own
rules to `custom.css`, the lists below show what had a visible effect on a
real **Kindle Paperwhite 3** (firmware 5.16.2.1.1, exported AZW3, font size 3,
portrait). Other models, firmware versions and reader settings may behave
differently, so check the book on your own device. Until these features are
also tested on a Paperwhite 12th gen, the app's CSS check keeps showing them
as unverified notes; the notes never block export.

**Worked:**

- margins, padding, borders, backgrounds, `text-indent`, alignment, font
  properties, `text-transform`, `float` and `clear`, `height`;
- `display: block`, `position: relative`, `word-wrap: break-word`;
- type, class and attribute selectors, combinators, `:not`, `:first-child`,
  `:only-child` and other structural pseudo-classes, `::before`, `::after`,
  `::first-letter`, `::first-line`;
- `@media all`, `@media screen`, `@media (min-width: …)`;
- units `em`, `rem`, `ex`, `%`, `px`, `pt`, `pc`, `cm`, `mm`, `in`.

**Had no effect, avoid:**

- `display: flex` and `display: grid`;
- CSS variables (`var()`), `calc()`, `transform`;
- `:has`, `:is`, `:where`, `:visited`;
- `@supports`, `@layer`, `@page`, and the `@media amzn-kf8` condition;
- page breaks inside a chapter: `page-break-after`, `break-after`, and
  `page-break-inside: avoid` / `break-inside: avoid`;
- units `ch`, `vw`, `vh`, `vmin`, `vmax` and their `dv*`, `sv*`, `lv*`
  variants.

**Unreliable:**

- `position: fixed` sticks to the corner of the screen, but its border and
  text are split across several pages;
- `background-size` worked at font size 3, but at size 6 the box moved off
  the screen;
- `hyphens`, `position: sticky`, `:hover`, `:active`, `:focus` and
  `@keyframes` gave no clear result.

## Full example

```
# Chapter 3. The Letter

Li Ming held the envelope for a long time before opening it.
The paper smelled of *jasmine*.

> Brother,
>
> if you are reading this, I have already left the **Azure Cloud Sect**.
> Do not look for me.

He read the letter three times[^1].

***

At dawn a cart was waiting at the gate.

![The sect gate](images/gate.jpg)

[^1]: By custom, a letter from an elder brother is read three times, out of respect.
```
