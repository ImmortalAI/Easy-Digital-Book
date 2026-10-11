export interface EpubLabels {
  translation: string;
  series: string;
  version: string;
  notes: string;
}

const labels: Record<string, EpubLabels> = {
  ru: { translation: "Перевод", series: "Серия", version: "Версия", notes: "Примечания" },
  en: { translation: "Translation", series: "Series", version: "Version", notes: "Notes" },
  "zh-CN": { translation: "翻译", series: "系列", version: "版本", notes: "注释" },
};

const baseLanguages: Record<string, string> = { ru: "ru", en: "en", zh: "zh-CN" };

/** Labels follow the book's base language, so "ru-RU" and "zh-Hans-CN" are covered too. */
export function getLabels(language: string): EpubLabels {
  const base = language.split(/[-_]/, 1)[0]!.toLowerCase();
  return labels[baseLanguages[base] ?? "en"]!;
}
