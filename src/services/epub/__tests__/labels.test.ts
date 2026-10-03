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
});
