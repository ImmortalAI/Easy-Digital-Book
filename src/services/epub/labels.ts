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

export function getLabels(language: string): EpubLabels {
  return labels[language] ?? labels.en;
}
