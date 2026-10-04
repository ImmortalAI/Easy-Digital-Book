<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planBatchRename, type ResourceRename } from "@/services/book/rename-resources";
import { sanitizeNameInput } from "@/utils/paths";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = defineProps<{ open: boolean; paths: string[] }>();
const emit = defineEmits<{ cancel: []; confirm: [renames: ResourceRename[]] }>();
const project = useProjectStore();
const { t } = useSafeI18n();
const name = ref("");
watch(
  () => props.open,
  (open) => open && (name.value = ""),
);

const plan = computed(() =>
  project.book
    ? planBatchRename(project.book, props.paths, name.value)
    : { error: "empty" as const },
);
const preview = computed(() => {
  const width = String(props.paths.length).length;
  return props.paths.map((from, index) => ({
    from: from.replace(/^images\//, ""),
    to: name.value
      ? `${name.value}_${String(index + 1).padStart(width, "0")}${from.slice(from.lastIndexOf("."))}`
      : "—",
  }));
});
const error = computed(() =>
  "error" in plan.value && plan.value.error === "conflict"
    ? t("gallery.renameConflict", "{name} already exists", {
        name: (plan.value.path ?? "").replace(/^images\//, ""),
      }).replace("{name}", (plan.value.path ?? "").replace(/^images\//, ""))
    : "",
);
function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const clean = sanitizeNameInput(input.value);
  if (clean !== input.value) input.value = clean;
  name.value = clean;
}
function confirm() {
  if ("renames" in plan.value) emit("confirm", plan.value.renames);
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !value && emit('cancel')">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("gallery.renameTitle", "Rename images") }}</DialogTitle>
        <DialogDescription>{{
          t(
            "gallery.renameHint",
            "Images are numbered in the order you selected them. Latin letters, digits, _ and - only.",
          )
        }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="confirm">
        <Label for="rename-name">{{ t("gallery.newName", "New name") }}</Label>
        <Input
          id="rename-name"
          :model-value="name"
          autocomplete="off"
          spellcheck="false"
          @input="onInput"
        />
        <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
        <ol class="max-h-60 overflow-auto text-sm">
          <li v-for="row in preview" :key="row.from" class="flex gap-2">
            <span class="truncate text-muted-foreground">{{ row.from }}</span>
            <span aria-hidden="true">→</span>
            <span class="truncate">{{ row.to }}</span>
          </li>
        </ol>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('cancel')">{{
            t("common.cancel", "Cancel")
          }}</Button>
          <Button type="submit" :disabled="!('renames' in plan)">{{
            t("gallery.renameConfirm", "Rename")
          }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
