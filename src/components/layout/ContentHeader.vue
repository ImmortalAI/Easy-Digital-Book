<script setup lang="ts">
import { computed } from "vue";
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
import FormatToolbar from "@/components/editor/FormatToolbar.vue";
import { useLayoutStore } from "@/stores/layout";

defineProps<{ chapterId: string }>();
const emit = defineEmits<{ "insert-image-from-file": [position: number] }>();
const layout = useLayoutStore();
const showToolbar = computed(() => layout.center.kind === "chapter");
</script>

<template>
  <!-- A size container: the toolbar inside hides buttons by this row's width,
       not the window's, because the sidebar takes part of the window. -->
  <div
    class="@container flex min-h-9 shrink-0 items-center gap-2 border-b pr-2"
    data-content-header
  >
    <Breadcrumbs class="min-w-0 flex-1" />
    <FormatToolbar
      v-if="showToolbar && chapterId"
      :chapter-id="chapterId"
      :disabled="layout.mode === 'preview'"
      @insert-image-from-file="emit('insert-image-from-file', $event)"
    />
  </div>
</template>
