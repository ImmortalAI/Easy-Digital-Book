<script setup lang="ts">
import { computed } from "vue";
import { IconFiles, IconSearch, IconSettings } from "@tabler/icons-vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Activity = "explorer" | "search" | "settings";

const props = defineProps<{ active: Activity }>();
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
  else emit("select", props.active);
}
</script>

<template>
  <TooltipProvider>
    <!-- A non-zero spacing keeps these separate buttons: at 0 the group joins
         its items into one segmented control, rounding only the outer ends. -->
    <ToggleGroup
      type="single"
      orientation="vertical"
      :model-value="active"
      :aria-label="t('activity.label', 'Activity')"
      :spacing="3"
      class="h-full w-full items-center rounded-none bg-transparent py-3 data-vertical:items-center"
      @update:model-value="onUpdate"
    >
      <Tooltip v-for="item in items" :key="item.value">
        <TooltipTrigger as-child>
          <ToggleGroupItem
            :value="item.value"
            :data-activity="item.value"
            :aria-label="item.label"
            :class="['size-9 rounded-md', item.value === 'settings' ? 'mt-auto' : '']"
          >
            <component :is="item.icon" class="size-5" aria-hidden="true" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="right">{{ item.label }}</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  </TooltipProvider>
</template>
