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
