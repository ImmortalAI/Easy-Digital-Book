import { defineStore } from "pinia";
import { ref } from "vue";
import type { SettingsRepository } from "@/types/platform";
import type { SupportedLocale } from "@/plugins/i18n";
import type { Theme } from "@/composables/use-theme";
import type { ExportFormat } from "@/services/export/types";
import type { SpellLanguage } from "@/types/spelling";
export interface ExportSettings {
  format: ExportFormat;
  imagePreset: "kindle-paperwhite" | "original";
  grayscale: boolean;
  titlePage: boolean;
  versionInTitle: boolean;
  lastDir: string | null;
}
export interface PreviewSettings {
  /** Dark "old paper" look of the preview under the dark theme. */
  paperStyle: boolean;
  /** Dim images in the paper look so white illustrations don't glare. */
  dimImages: boolean;
}
export interface UpdateSettings {
  lastCheckedAt: number | null;
}
export interface SpellingSettings {
  enabled: boolean;
  languages: Record<SpellLanguage, boolean>;
}
const defaultSpelling: SpellingSettings = { enabled: true, languages: { ru: true, en: true } };
const defaultExport: ExportSettings = {
  format: "epub",
  imagePreset: "kindle-paperwhite",
  grayscale: false,
  titlePage: true,
  versionInTitle: true,
  lastDir: null,
};
const defaultPreview: PreviewSettings = { paperStyle: true, dimImages: true };
export const useSettingsStore = defineStore("settings", () => {
  const confirmDelete = ref(true),
    recentFiles = ref<string[]>([]),
    exportSettings = ref<ExportSettings>({ ...defaultExport }),
    locale = ref<SupportedLocale | null>(null),
    theme = ref<Theme>("system"),
    preview = ref<PreviewSettings>({ ...defaultPreview }),
    updates = ref<UpdateSettings>({ lastCheckedAt: null }),
    spelling = ref<SpellingSettings>(structuredClone(defaultSpelling));
  let repository: SettingsRepository | undefined;
  function configure(value: SettingsRepository) {
    repository = value;
  }
  async function load() {
    confirmDelete.value = (await repository?.get("confirmDelete", true)) ?? true;
    recentFiles.value = ((await repository?.get("recentFiles", [])) ?? []).slice(0, 10);
    const storedExport = await repository?.get<Partial<ExportSettings>>("export", {});
    exportSettings.value = {
      ...defaultExport,
      ...storedExport,
      format: storedExport?.format === "azw3" ? "azw3" : "epub",
    };
    locale.value = (await repository?.get<SupportedLocale | null>("locale", null)) ?? null;
    theme.value = (await repository?.get<Theme>("theme", "system")) ?? "system";
    preview.value = {
      ...defaultPreview,
      ...(await repository?.get<Partial<PreviewSettings>>("preview", {})),
    };
    const updateSettings = await repository?.get<Partial<UpdateSettings>>("updates", {});
    updates.value = {
      lastCheckedAt:
        updateSettings?.lastCheckedAt ??
        (await repository?.get<number | null>("updates.lastCheckedAt", null)) ??
        null,
    };
    const storedSpelling = await repository?.get<Partial<SpellingSettings>>("spelling", {});
    spelling.value = {
      enabled: storedSpelling?.enabled ?? true,
      languages: { ...defaultSpelling.languages, ...storedSpelling?.languages },
    };
  }
  async function persist() {
    await repository?.set("confirmDelete", confirmDelete.value);
    await repository?.set("recentFiles", recentFiles.value);
    await repository?.set("export", exportSettings.value);
    await repository?.set("locale", locale.value);
    await repository?.set("theme", theme.value);
    await repository?.set("preview", preview.value);
    await repository?.set("updates", updates.value);
    await repository?.set("updates.lastCheckedAt", updates.value.lastCheckedAt);
    await repository?.set("spelling", spelling.value);
  }
  async function setSpelling(patch: {
    enabled?: boolean;
    languages?: Partial<Record<SpellLanguage, boolean>>;
  }) {
    spelling.value = {
      enabled: patch.enabled ?? spelling.value.enabled,
      languages: { ...spelling.value.languages, ...patch.languages },
    };
    await repository?.set("spelling", spelling.value);
  }
  async function setPreview(patch: Partial<PreviewSettings>) {
    preview.value = { ...preview.value, ...patch };
    await repository?.set("preview", preview.value);
  }
  async function addRecent(path: string) {
    recentFiles.value = [path, ...recentFiles.value.filter((item) => item !== path)].slice(0, 10);
    await repository?.set("recentFiles", recentFiles.value);
  }
  async function removeRecent(path: string) {
    recentFiles.value = recentFiles.value.filter((item) => item !== path);
    await repository?.set("recentFiles", recentFiles.value);
  }
  return {
    confirmDelete,
    recentFiles,
    exportSettings,
    locale,
    theme,
    preview,
    updates,
    spelling,
    configure,
    load,
    persist,
    setPreview,
    setSpelling,
    addRecent,
    removeRecent,
  };
});
