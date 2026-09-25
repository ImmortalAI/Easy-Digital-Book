<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import { ref, watch } from "vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    details?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    askAgainLabel?: string;
    showAskAgain?: boolean;
  }>(),
  { showAskAgain: true },
);
const emit = defineEmits<{ confirm: [value: { askAgain: boolean }]; cancel: [] }>();
// The box reads "Do not ask again", so ticking it is what stops the asking.
// It starts unticked on every opening; a choice left in a cancelled dialog
// does not carry over.
const stopAsking = ref(false);
watch(
  () => props.open,
  (open) => {
    if (open) stopAsking.value = false;
  },
);
const confirmButton = ref<ComponentPublicInstance | null>(null);
const { t } = useSafeI18n();

// Stop the focus scope's default (focusing the first tabbable element, which
// would be the ask-again checkbox) and focus the destructive action instead,
// matching this dialog's original behaviour.
function focusConfirm(event: Event) {
  event.preventDefault();
  (confirmButton.value?.$el as HTMLElement | undefined)?.focus();
}
</script>

<template>
  <AlertDialog :open="props.open">
    <AlertDialogContent @open-auto-focus="focusConfirm" @escape-key-down="emit('cancel')">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription as="div">
          <p>{{ message }}</p>
          <p v-if="details" class="mt-1">{{ details }}</p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="showAskAgain" class="flex items-center gap-2">
        <Checkbox id="confirm-dialog-ask-again" v-model="stopAsking" />
        <Label for="confirm-dialog-ask-again">
          {{ askAgainLabel ?? t("common.doNotAskAgain", "Do not ask again") }}
        </Label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel @click="emit('cancel')">
          {{ cancelLabel ?? t("common.cancel", "Cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction
          ref="confirmButton"
          variant="destructive"
          @click="emit('confirm', { askAgain: !stopAsking })"
        >
          {{ confirmLabel ?? t("common.delete", "Delete") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
