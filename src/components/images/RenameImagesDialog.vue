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
import { planRename, renameTargets, type ResourceRename } from "@/services/book/rename-resources";
import { sanitizeNameInput } from "@/utils/paths";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = defineProps<{ open: boolean; paths: string[] }>();
const emit = defineEmits<{ cancel: []; confirm: [renames: ResourceRename[]] }>();
const project = useProjectStore();
const { t } = useSafeI18n();
const name = ref("");
const single = computed(() => props.paths.length === 1);
const shortName = (path: string) => path.replace(/^images\//, "");
const stem = (path: string) => shortName(path).replace(/\.[^.]+$/, "");
watch(
  () => props.open,
  (open) => {
    if (open) name.value = single.value ? stem(props.paths[0]!) : "";
  },
  { immediate: true },
);

const plan = computed(() =>
  project.book ? planRename(project.book, props.paths, name.value) : { error: "empty" as const },
);
// The preview comes from the same naming rule as the plan.
const preview = computed(() => {
  const targets = name.value ? renameTargets(props.paths, name.value) : [];
  return props.paths.map((from, index) => ({
    from: shortName(from),
    to: targets[index] ? shortName(targets[index]) : "—",
  }));
});
const canConfirm = computed(() => "renames" in plan.value && plan.value.renames.length > 0);
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
  if (canConfirm.value && "renames" in plan.value) emit("confirm", plan.value.renames);
}
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !value && emit('cancel')">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{
          single
            ? t("gallery.renameOneTitle", "Rename image")
            : t("gallery.renameTitle", "Rename images")
        }}</DialogTitle>
        <DialogDescription>{{
          single
            ? t("gallery.renameOneHint", "Latin letters, digits, _ and - only.")
            : t(
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
          @focus="($event.target as HTMLInputElement).select()"
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
          <Button type="submit" :disabled="!canConfirm">{{
            t("gallery.renameConfirm", "Rename")
          }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
