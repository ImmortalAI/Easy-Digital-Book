<script setup lang="ts">
import { computed } from "vue";
import { useProjectStore } from "@/stores/project";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { useSafeI18n } from "@/composables/use-safe-i18n";

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
      class="aspect-square overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="path"
      @click="emit('pick', path)"
    >
      <img :src="url(path)" alt="" loading="lazy" class="size-full object-cover" />
    </button>
    <p v-if="paths.length === 0" class="col-span-3 p-2 text-sm text-muted-foreground">
      {{ t("format.noImages", "The book has no images yet") }}
    </p>
  </div>
</template>
