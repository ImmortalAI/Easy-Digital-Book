import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemorySpellChecker } from "../memory-spell";
import { createInMemoryPlatformServices } from "..";

const invoke = vi.hoisted(() =>
  vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>(),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("memory spell checker", () => {
  it("accepts known words regardless of first-letter case and records calls", async () => {
    const checker = createMemorySpellChecker({ known: ["мир", "world"] });
    expect(await checker.check("ru", ["мир", "Мир", "мирр"])).toEqual(["мирр"]);
    expect(checker.calls).toEqual([{ lang: "ru", words: ["мир", "Мир", "мирр"] }]);
  });
  it("suggests close known words, at most five", async () => {
    const checker = createMemorySpellChecker({ known: ["мир", "мира", "мирт"] });
    expect(await checker.suggest("ru", "мирр")).toEqual(["мир", "мира", "мирт"]);
  });
  it("fails with spell.dictionaryLoad when the dictionary is unavailable", async () => {
    const checker = createMemorySpellChecker({ failLoad: true });
    await expect(checker.check("en", ["x"])).rejects.toMatchObject({
      code: "spell.dictionaryLoad",
    });
  });
  it("is part of the in-memory platform", async () => {
    const services = createInMemoryPlatformServices({ spellWords: ["hello"] });
    expect(await services.spell.check("en", ["hello", "helo"])).toEqual(["helo"]);
  });
});

describe("tauri spell checker", () => {
  beforeEach(() => invoke.mockReset());
  it("calls the commands with lang and words", async () => {
    const { tauriSpellChecker } = await import("../spell");
    invoke.mockResolvedValueOnce(["helo"]);
    expect(await tauriSpellChecker.check("en", ["hello", "helo"])).toEqual(["helo"]);
    expect(invoke).toHaveBeenCalledWith("spell_check", { lang: "en", words: ["hello", "helo"] });
    invoke.mockResolvedValueOnce(["hello"]);
    await tauriSpellChecker.suggest("en", "helo");
    expect(invoke).toHaveBeenLastCalledWith("spell_suggest", { lang: "en", word: "helo" });
  });
  it("maps command errors to AppError", async () => {
    const { tauriSpellChecker } = await import("../spell");
    invoke.mockRejectedValueOnce({ code: "spell.dictionaryLoad", message: "missing" });
    await expect(tauriSpellChecker.check("ru", ["x"])).rejects.toMatchObject({
      name: "AppError",
      code: "spell.dictionaryLoad",
    });
  });
});
