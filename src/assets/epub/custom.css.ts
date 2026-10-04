export const customCssTemplate = `/* Custom EPUB styles.
   NovLang blocks: h1, p, blockquote, p.novlang-scene-break.
   Footnotes: references are a.noteref; the notes page (and the preview) uses
   section.endnotes-chapter and div.endnote.
   Colours: most e-ink readers ignore them. Under the dark theme the preview
   uses a paper style; switch it off (Mod+Alt+P) to check your colours.
*/

p.novlang-scene-break { text-align: center; }
`;
