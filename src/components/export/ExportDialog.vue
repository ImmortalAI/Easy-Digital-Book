<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import type { ExportController } from "@/composables/use-export";
import type { useProjectStore } from "@/stores/project";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  controller: ExportController;
  project?: ReturnType<typeof useProjectStore>;
}>();
const emit = defineEmits<{ close: [] }>();
const open = defineModel<boolean>("open", { default: true });
const { t } = useSafeI18n();
const abortController = ref<AbortController | null>(null);
const success = ref(false);
const hasVersion = computed(() => Boolean(props.project?.book?.metadata.version));
const formatLabel = computed(() => props.controller.format.value.toUpperCase());
const title = computed(() =>
  t("export.title", `Export ${formatLabel.value}`, { format: formatLabel.value }),
);
const filterName = computed(() =>
  t("export.filterName", `${formatLabel.value} book`, { format: formatLabel.value }),
);
const savedMessage = computed(() =>
  t("export.saved", `${formatLabel.value} saved`, { format: formatLabel.value }),
);
/** Prefer a message for the specific failure, falling back to the generic one. */
const errorMessage = computed(() => {
  const error = props.controller.error.value;
  const generic = t("errors.export.failed", "Could not export book");
  return error ? t(`errors.${error.code}`, generic, error.params) : generic;
});
const progressPercent = computed(() => {
  const value = props.controller.progress.value;
  if (!value) return 0;
  if (value.stage === "zip") return 100;
  return value.total > 0 ? Math.round((value.done / value.total) * 100) : 0;
});

// The dialog is now a long-lived component (EditorView keeps it mounted and
// only toggles `open`), so per-open state that used to reset itself via
// remounting must be reset explicitly here whenever the dialog opens again.
watch(open, (value) => {
  if (value) {
    success.value = false;
    abortController.value = null;
  } else {
    emit("close");
  }
});

watch(
  () => props.controller.format.value,
  () => {
    success.value = false;
    props.controller.lastOutput.value = null;
  },
);

async function exportBook() {
  if (props.controller.exporting.value) return;
  success.value = false;
  const controller = new AbortController();
  abortController.value = controller;
  try {
    const target = await props.controller.exportBook({
      signal: controller.signal,
      dialogTitle: title.value,
      dialogFilterName: filterName.value,
    });
    success.value = Boolean(target);
  } catch {
    // The controller stores a localized-safe AppError for the template.
  } finally {
    abortController.value = null;
  }
}

/** Every dismissal path (Escape, outside click, footer button) routes through
 * here so an in-flight export is aborted instead of silently orphaned. */
function requestClose(next: boolean) {
  if (!next && props.controller.exporting.value) {
    abortController.value?.abort();
    return;
  }
  open.value = next;
}
</script>

<template>
  <Dialog :open="open" @update:open="requestClose">
    <DialogContent :show-close-button="false" class="grid gap-4 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ controller.fileName.value }}</DialogDescription>
      </DialogHeader>

      <Alert v-if="controller.warnings.value.length" variant="destructive">
        <AlertDescription>
          <ul class="list-disc space-y-1 pl-4">
            <li
              v-for="warning in controller.warnings.value"
              :key="`${warning.code}-${warning.chapterId ?? ''}`"
            >
              {{ warning.message }}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Field>
        <Label for="export-format">{{ t("export.format", "Format") }}</Label>
        <Select v-model="controller.format.value" :disabled="controller.exporting.value">
          <SelectTrigger id="export-format" class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="epub">EPUB</SelectItem>
            <SelectItem value="azw3">AZW3</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <Label for="export-preset">{{ t("export.preset", "Image preset") }}</Label>
        <Select
          v-model="controller.options.value.imagePreset"
          :disabled="controller.exporting.value"
        >
          <SelectTrigger id="export-preset" class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kindle-paperwhite">
              {{ t("export.kindle", "Kindle Paperwhite") }}
            </SelectItem>
            <SelectItem value="original">{{ t("export.original", "Without changes") }}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div class="flex items-center gap-2">
        <Checkbox
          id="export-grayscale"
          v-model="controller.options.value.grayscale"
          :disabled="controller.exporting.value"
        />
        <Label for="export-grayscale">{{ t("export.grayscale", "Grayscale") }}</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="export-title-page"
          v-model="controller.options.value.titlePage"
          :disabled="controller.exporting.value"
        />
        <Label for="export-title-page">{{ t("export.titlePage", "Add title page") }}</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="export-version"
          v-model="controller.options.value.versionInTitle"
          :disabled="!hasVersion || controller.exporting.value"
        />
        <Label for="export-version">{{ t("export.versionInTitle", "Add version to title") }}</Label>
      </div>

      <div v-if="controller.progress.value" class="grid gap-1.5">
        <p class="text-muted-foreground text-sm">
          <span v-if="controller.progress.value.stage === 'images'">
            {{ t("export.progressImages", "Images {done}/{total}", controller.progress.value) }}
          </span>
          <span v-else-if="controller.progress.value.stage === 'chapters'">
            {{ t("export.progressChapters", "Chapters {done}/{total}", controller.progress.value) }}
          </span>
          <span v-else-if="controller.progress.value.stage === 'azw3'">
            {{ t("export.progressAzw3", "Creating AZW3…") }}
          </span>
          <span v-else>{{ t("export.progressZip", "Creating EPUB…") }}</span>
        </p>
        <Progress :model-value="progressPercent" />
      </div>

      <Alert v-if="controller.error.value" variant="destructive">
        <AlertDescription>{{ errorMessage }}</AlertDescription>
      </Alert>

      <p v-if="success" class="text-primary text-sm" role="status">
        {{ savedMessage }}
        <Button type="button" variant="link" class="h-auto p-0" @click="controller.revealOutput()">
          {{ t("export.showInFolder", "Show in folder") }}
        </Button>
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" @click="requestClose(false)">
          {{
            controller.exporting.value ? t("common.cancel", "Cancel") : t("common.close", "Close")
          }}
        </Button>
        <Button
          v-if="!success"
          type="button"
          :disabled="controller.exporting.value"
          @click="exportBook"
        >
          <Spinner v-if="controller.exporting.value" :aria-label="t('common.loading', 'Loading')" />
          {{ t("export.action", "Export…") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
