<script setup lang="ts">
import { computed } from "vue";
import { useProjectStore } from "@/stores/project";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { useSafeI18n } from "@/composables/use-safe-i18n";

withDefaults(defineProps<{ selected?: string; variant?: "square" | "cover" }>(), {
  variant: "square",
});
const emit = defineEmits<{ pick: [path: string] }>();
const project = useProjectStore();
const { url } = useResourceUrls();
const { t } = useSafeI18n();
const paths = computed(() => [...(project.book?.resources.keys() ?? [])]);
</script>

<template>
  <div class="grid max-h-80 w-72 grid-cols-3 gap-2 overflow-auto p-1">
    <button
      v-for="path in paths"
      :key="path"
      type="button"
      :class="[
        variant === 'cover' ? 'aspect-[5/8]' : 'aspect-square',
        'overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        path === selected && 'ring-2 ring-primary',
      ]"
      :aria-label="path"
      :aria-pressed="selected === undefined ? undefined : path === selected"
      @click="emit('pick', path)"
    >
      <img
        :src="url(path)"
        alt=""
        loading="lazy"
        :class="variant === 'cover' ? 'size-full object-contain' : 'size-full object-cover'"
      />
    </button>
    <p v-if="paths.length === 0" class="col-span-3 p-2 text-sm text-muted-foreground">
      {{ t("format.noImages", "The book has no images yet") }}
    </p>
  </div>
</template>
