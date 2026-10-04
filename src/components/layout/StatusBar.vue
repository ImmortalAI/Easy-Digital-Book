<script setup lang="ts">
import { computed } from "vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { IconPalette } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import WarningsPopover from "@/components/editor/WarningsPopover.vue";

export type SaveState = "saved" | "unsaved" | "saving";

const props = defineProps<{
  saveState: SaveState;
  /** The open chapter's counts; `null` when no chapter is open. */
  counts: { words: number; characters: number } | null;
  /** The chapter whose parse warnings the warnings list shows first. */
  chapterId?: string;
  /** The preview is on screen with the preview-only paper look. */
  previewStyled?: boolean;
}>();
const emit = defineEmits<{
  selectWarning: [item: { chapterId?: string; position?: { line: number; column: number } }];
  showOriginalPreview: [];
}>();
const { t } = useSafeI18n();

const saveLabel = computed(() =>
  props.saveState === "saving"
    ? t("editor.saving", "Saving…")
    : props.saveState === "unsaved"
      ? t("editor.unsaved", "Unsaved changes")
      : t("editor.saved", "Saved"),
);
const countsLabel = computed(() => {
  if (!props.counts) return "";
  const { words, characters } = props.counts;
  return t("editor.status", "{words} words · {characters} characters", { words, characters })
    .replace("{words}", String(words))
    .replace("{characters}", String(characters));
});
</script>

<template>
  <!-- VS Code's status bar: spans the window under the activity bar too, so
       nothing else sits in the window's rounded bottom corners. A <footer>
       inside the shell's <main> is not the page's contentinfo landmark, so the
       bar names itself as a region; not role="status", which would read the
       word count aloud on every keystroke. -->
  <footer
    role="region"
    :aria-label="t('editor.statusBar', 'Status bar')"
    class="flex h-7 shrink-0 items-center justify-between gap-4 border-t bg-sidebar px-2 text-xs text-muted-foreground"
  >
    <div class="flex min-w-0 items-center gap-2">
      <WarningsPopover :chapter-id="chapterId" @select="emit('selectWarning', $event)" />
      <Button
        v-if="previewStyled"
        variant="ghost"
        size="xs"
        class="min-w-0 font-normal text-muted-foreground"
        :title="t('preview.showOriginal', 'Show the original look')"
        @click="emit('showOriginalPreview')"
      >
        <IconPalette aria-hidden="true" />
        <span class="truncate">{{
          t("preview.styledNotice", "Styled preview — not how the book will look")
        }}</span>
      </Button>
    </div>
    <div class="flex min-w-0 items-center gap-4">
      <span class="truncate">{{ saveLabel }}</span>
      <span v-if="counts" class="truncate">{{ countsLabel }}</span>
    </div>
  </footer>
</template>
