<script setup lang="ts">
import { IconCheck, IconStarFilled } from "@tabler/icons-vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { useSafeI18n } from "@/composables/use-safe-i18n";

const props = defineProps<{
  path: string;
  url?: string;
  cover: boolean;
  unused: boolean;
  selected: boolean;
  /** 1-based position in the selection order, shown while selecting. */
  order?: number;
  focused: boolean;
}>();
const emit = defineEmits<{
  open: [];
  "context-action": [value: "cover" | "search" | "rename" | "delete"];
}>();
const { t } = useSafeI18n();
const name = () => props.path.replace(/^images\//, "");
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        role="gridcell"
        :aria-label="name()"
        :aria-selected="selected"
        :tabindex="focused ? 0 : -1"
        :data-gallery-path="path"
        @click="emit('open')"
        class="group relative flex cursor-default select-none flex-col gap-1 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="{ 'bg-accent ring-2 ring-primary': selected, 'opacity-60': unused && !selected }"
      >
        <div class="aspect-square overflow-hidden rounded-md bg-muted">
          <img
            v-if="url"
            :src="url"
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
            class="size-full object-cover"
          />
        </div>
        <span class="truncate text-xs text-muted-foreground">{{ name() }}</span>
        <div class="absolute left-2 top-2 flex gap-1">
          <Badge v-if="cover" variant="secondary">
            <IconStarFilled aria-hidden="true" />{{ t("gallery.cover", "Cover") }}
          </Badge>
          <Badge v-if="unused" variant="outline" class="bg-background/80">
            {{ t("images.unused", "not used") }}
          </Badge>
        </div>
        <span
          v-if="selected"
          class="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
          data-selection-order
        >
          <template v-if="order">{{ order }}</template>
          <IconCheck v-else class="size-4" aria-hidden="true" />
        </span>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="emit('context-action', 'cover')">{{
        t("images.setCover", "Set as cover")
      }}</ContextMenuItem>
      <ContextMenuItem @select="emit('context-action', 'search')">{{
        t("images.findUsage", "Find usages")
      }}</ContextMenuItem>
      <ContextMenuItem @select="emit('context-action', 'rename')">{{
        t("gallery.rename", "Rename…")
      }}</ContextMenuItem>
      <ContextMenuItem variant="destructive" @select="emit('context-action', 'delete')">{{
        t("common.delete", "Delete")
      }}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
