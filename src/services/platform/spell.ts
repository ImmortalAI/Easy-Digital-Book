import { invoke } from "@tauri-apps/api/core";
import { appErrorFromUnknown } from "@/types/errors";
import type { SpellChecker } from "@/types/platform";

const adapt = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw appErrorFromUnknown(error, "spell.check");
  }
};
export const tauriSpellChecker: SpellChecker = {
  check: (lang, words) => adapt(() => invoke<string[]>("spell_check", { lang, words })),
  suggest: (lang, word) => adapt(() => invoke<string[]>("spell_suggest", { lang, word })),
};
