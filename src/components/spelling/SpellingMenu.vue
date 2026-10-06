<script setup lang="ts">
import { ref, watch } from "vue";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { useSpellingActions } from "@/composables/use-spelling-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SpellLanguage } from "@/types/spelling";

const props = defineProps<{
  open: boolean;
  word: string;
  lang: SpellLanguage;
  anchor: { left: number; top: number; height: number } | null;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  replace: [value: string];
  ignore: [];
  add: [];
}>();
const { t } = useSafeI18n();
const actions = useSpellingActions();
const suggestions = ref<string[] | null>(null);

watch(
  () => [props.open, props.word, props.lang] as const,
  async ([open, word, lang]) => {
    if (!open) return;
    suggestions.value = null;
    let result: string[] = [];
    try {
      result = await actions.suggest(lang, word);
    } catch {
      result = [];
    }
    if (props.open && props.word === word) suggestions.value = result;
  },
  { immediate: true },
);
</script>

<template>
  <DropdownMenu :open="open" :modal="false" @update:open="emit('update:open', $event)">
    <!-- An invisible trigger over the word gives the menu its position. -->
    <DropdownMenuTrigger as-child>
      <span
        aria-hidden="true"
        class="pointer-events-none fixed w-px"
        :style="
          anchor
            ? { left: `${anchor.left}px`, top: `${anchor.top}px`, height: `${anchor.height}px` }
            : { display: 'none' }
        "
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="start"
      :aria-label="t('spelling.menuLabel', 'Spelling: {word}', { word }).replace('{word}', word)"
    >
      <DropdownMenuLabel
        v-if="suggestions === null"
        class="text-xs font-normal text-muted-foreground"
      >
        {{ t("spelling.loadingSuggestions", "Looking for suggestions…") }}
      </DropdownMenuLabel>
      <DropdownMenuLabel
        v-else-if="suggestions.length === 0"
        class="text-xs font-normal text-muted-foreground"
      >
        {{ t("spelling.noSuggestions", "No suggestions") }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="item in suggestions ?? []"
        :key="item"
        class="font-medium"
        @select="emit('replace', item)"
      >
        {{ item }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="emit('ignore')">{{
        t("spelling.ignore", "Ignore")
      }}</DropdownMenuItem>
      <DropdownMenuItem @select="emit('add')">
        {{ t("spelling.addToDictionary", "Add to book dictionary") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
