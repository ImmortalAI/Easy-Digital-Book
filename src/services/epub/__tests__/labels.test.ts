import { describe, expect, it } from "vitest";
import { getLabels } from "@/services/epub/labels";

describe("EPUB labels", () => {
  it("uses Russian, English, Chinese, and English fallback", () => {
    expect(getLabels("ru").translation).toBe("Перевод");
    expect(getLabels("en").series).toBe("Series");
    expect(getLabels("zh-CN").version).toBe("版本");
    expect(getLabels("fr").translation).toBe("Translation");
  });

  it("names the notes page in the book language", () => {
    expect(getLabels("ru").notes).toBe("Примечания");
    expect(getLabels("en").notes).toBe("Notes");
    expect(getLabels("zh-CN").notes).toBe("注释");
  });

  it("matches regional and script tags by their base language", () => {
    expect(getLabels("ru-RU").translation).toBe("Перевод");
    expect(getLabels("RU-ru").notes).toBe("Примечания");
    expect(getLabels("en-GB").series).toBe("Series");
    expect(getLabels("zh-Hans-CN").notes).toBe("注释");
    expect(getLabels("zh").version).toBe("版本");
    expect(getLabels("fr-CA").translation).toBe("Translation");
    expect(getLabels("").translation).toBe("Translation");
  });
});
