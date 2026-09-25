<script setup lang="ts">
import { computed } from "vue";
import { IconFiles, IconSearch, IconSettings } from "@tabler/icons-vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Activity = "explorer" | "search" | "settings";

// `null` when no sidebar view is showing and Settings is not open.
const props = defineProps<{ active: Activity | null }>();
const emit = defineEmits<{ select: [value: Activity] }>();
const { t } = useSafeI18n();

// Computed so the labels follow a live locale switch from Settings.
const items = computed<Array<{ value: Activity; icon: typeof IconFiles; label: string }>>(() => [
  { value: "explorer", icon: IconFiles, label: t("activity.explorer", "Explorer") },
  { value: "search", icon: IconSearch, label: t("activity.search", "Search") },
  { value: "settings", icon: IconSettings, label: t("activity.settings", "Settings") },
]);

// ToggleGroup type="single" lets the user click the active item to deselect
// it, which would report an empty model value. Re-report the active value
// instead: the caller (EditorView) still needs the click to reach it — a
// re-click on the current activity toggles sidebar visibility there — but
// the selection itself must never go empty, and the item stays pressed.
function onUpdate(value: unknown) {
  if (value === "explorer" || value === "search" || value === "settings") emit("select", value);
  else if (props.active) emit("select", props.active);
}
</script>

<template>
  <TooltipProvider>
    <!-- VS Code's activity bar: square tiles as wide as the bar, touching each
         other. The active one is marked by a bar on its left edge and a
         brighter icon, not by a filled background. -->
    <ToggleGroup
      type="single"
      orientation="vertical"
      :model-value="active"
      :aria-label="t('activity.label', 'Activity')"
      class="h-full w-full rounded-none bg-transparent"
      @update:model-value="onUpdate"
    >
      <Tooltip v-for="item in items" :key="item.value">
        <TooltipTrigger as-child>
          <ToggleGroupItem
            :value="item.value"
            :data-activity="item.value"
            :aria-label="item.label"
            :class="[
              // `!` beats the joined-group rounding the toggle group gives its
              // first and last items.
              'relative aspect-square h-auto w-full rounded-none! text-muted-foreground',
              'hover:bg-transparent hover:text-foreground focus-visible:ring-inset',
              // The tooltip trigger shares this element and overwrites its
              // `data-state`, so the pressed state is read from aria-pressed.
              'aria-pressed:bg-transparent aria-pressed:text-foreground',
              'before:absolute before:inset-y-0 before:left-0 before:w-0.5',
              'aria-pressed:before:bg-foreground',
              item.value === 'settings' ? 'mt-auto' : '',
            ]"
          >
            <component :is="item.icon" class="size-6" aria-hidden="true" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="right">{{ item.label }}</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  </TooltipProvider>
</template>
