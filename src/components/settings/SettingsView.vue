<script setup lang="ts">
import { ref } from "vue";
import {
  IconDeviceDesktop,
  IconFolderOpen,
  IconMoon,
  IconRefresh,
  IconSun,
} from "@tabler/icons-vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import type { Theme } from "@/composables/use-theme";
import type { ExportSettings, useSettingsStore } from "@/stores/settings";
import type { SupportedLocale } from "@/plugins/i18n";
import type { SettingsActions } from "@/composables/use-settings-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const props = defineProps<{
  settings: ReturnType<typeof useSettingsStore>;
  actions: SettingsActions;
}>();
const { currentLocale, t, setLocale } = useSafeI18n();
// Only the stored choice changes here; main.ts applies it to <html> via useTheme().
const update = ref<{ version: string; url: string } | null>(null);
const updateMessage = ref("");

const themes = [
  { value: "light", icon: IconSun, key: "settings.themeLight", fallback: "Light" },
  { value: "dark", icon: IconMoon, key: "settings.themeDark", fallback: "Dark" },
  { value: "system", icon: IconDeviceDesktop, key: "settings.themeSystem", fallback: "System" },
] as const;

const imageSwitches = [
  { field: "grayscale", key: "export.grayscale", fallback: "Grayscale" },
] as const;
const bookSwitches = [
  { field: "titlePage", key: "export.titlePage", fallback: "Add title page" },
  { field: "versionInTitle", key: "export.versionInTitle", fallback: "Add version to title" },
] as const;
type ExportSwitch = (typeof imageSwitches)[number] | (typeof bookSwitches)[number];

const persist = () => props.actions.persist();

async function changeLocale(value: unknown) {
  if (value !== "ru" && value !== "en" && value !== "zh-CN") return;
  props.settings.locale = value as SupportedLocale;
  setLocale(value);
  await persist();
}

async function changeTheme(value: unknown) {
  if (!themes.some((theme) => theme.value === value)) return;
  props.settings.theme = value as Theme;
  await persist();
}

async function changePreset(value: unknown) {
  if (value !== "kindle-paperwhite" && value !== "original") return;
  props.settings.exportSettings.imagePreset = value;
  await persist();
}

async function changeExportSwitch(
  field: ExportSwitch["field"],
  value: ExportSettings[typeof field],
) {
  props.settings.exportSettings[field] = value;
  await persist();
}

async function changeConfirmDelete(value: boolean) {
  props.settings.confirmDelete = value;
  await persist();
}

async function checkUpdates() {
  const result = await props.actions.checkUpdates();
  if (result.status === "skipped") {
    updateMessage.value = t(
      "settings.updateAlreadyChecked",
      "Updates were checked within the last day",
    );
    return;
  }
  update.value = result.update;
  updateMessage.value =
    result.status === "failed"
      ? t("settings.updateCheckFailed", "Could not check for updates")
      : result.update
        ? t("settings.updateAvailable", "A new version is available")
        : t("settings.upToDate", "You are up to date");
}

const openLogs = () => props.actions.openLogs();
</script>

<template>
  <section
    class="flex max-w-2xl flex-col gap-6 p-8"
    aria-labelledby="settings-title"
    data-settings-view
  >
    <h1 id="settings-title" class="text-xl font-semibold">
      {{ t("settings.title", "Settings") }}
    </h1>

    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{{ t("settings.appearance", "Appearance") }}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <Label for="settings-locale" class="flex-auto">
              {{ t("settings.language", "Interface language") }}
            </Label>
            <Select
              :model-value="settings.locale ?? currentLocale"
              @update:model-value="changeLocale"
            >
              <SelectTrigger id="settings-locale" class="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Label for="settings-theme" class="flex-auto">
              {{ t("settings.theme", "Theme") }}
            </Label>
            <Select :model-value="settings.theme" @update:model-value="changeTheme">
              <SelectTrigger id="settings-theme" class="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="theme in themes" :key="theme.value" :value="theme.value">
                  <component :is="theme.icon" aria-hidden="true" />
                  {{ t(theme.key, theme.fallback) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Label for="settings-confirm-delete" class="flex-auto">
              {{ t("settings.confirmDelete", "Confirm deletions") }}
            </Label>
            <Switch
              id="settings-confirm-delete"
              :model-value="settings.confirmDelete"
              @update:model-value="changeConfirmDelete"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{{ t("settings.export", "Export") }}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{{ t("settings.exportImages", "Images") }}</FieldLegend>
            <FieldGroup>
              <FieldSet>
                <FieldLegend id="settings-preset-legend" variant="label">
                  {{ t("export.preset", "Image preset") }}
                </FieldLegend>
                <RadioGroup
                  aria-labelledby="settings-preset-legend"
                  :model-value="settings.exportSettings.imagePreset"
                  @update:model-value="changePreset"
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem id="settings-preset-kindle" value="kindle-paperwhite" />
                    <Label for="settings-preset-kindle">
                      {{ t("export.kindle", "Kindle Paperwhite") }}
                    </Label>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem id="settings-preset-original" value="original" />
                    <Label for="settings-preset-original">
                      {{ t("export.original", "Without changes") }}
                    </Label>
                  </Field>
                </RadioGroup>
              </FieldSet>
              <Field v-for="item in imageSwitches" :key="item.field" orientation="horizontal">
                <Label :for="`settings-export-${item.field}`" class="flex-auto">
                  {{ t(item.key, item.fallback) }}
                </Label>
                <Switch
                  :id="`settings-export-${item.field}`"
                  :model-value="settings.exportSettings[item.field]"
                  @update:model-value="changeExportSwitch(item.field, $event)"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{{ t("settings.exportBook", "Book") }}</FieldLegend>
            <FieldGroup>
              <Field v-for="item in bookSwitches" :key="item.field" orientation="horizontal">
                <Label :for="`settings-export-${item.field}`" class="flex-auto">
                  {{ t(item.key, item.fallback) }}
                </Label>
                <Switch
                  :id="`settings-export-${item.field}`"
                  :model-value="settings.exportSettings[item.field]"
                  @update:model-value="changeExportSwitch(item.field, $event)"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{{ t("settings.maintenance", "Maintenance") }}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal" class="flex-wrap">
            <Button variant="outline" @click="checkUpdates">
              <IconRefresh aria-hidden="true" />
              {{ t("settings.checkUpdates", "Check for updates") }}
            </Button>
            <span role="status" class="text-muted-foreground text-sm">{{ updateMessage }}</span>
            <Button
              v-if="update"
              variant="link"
              :aria-label="`${t('settings.openUpdate', 'Open release')} ${update.version}`"
              @click="actions.openUpdate(update.url)"
            >
              {{ update.version }}
            </Button>
          </Field>
          <Field orientation="horizontal">
            <Button variant="outline" @click="openLogs">
              <IconFolderOpen aria-hidden="true" />
              {{ t("settings.openLogs", "Open log folder") }}
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  </section>
</template>
