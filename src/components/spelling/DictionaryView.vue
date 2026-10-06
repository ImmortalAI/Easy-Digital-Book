<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconTrash } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import {
  addToDictionary,
  isDictionaryWord,
  removeFromDictionary,
} from "@/services/book/dictionary";
import { useProjectStore } from "@/stores/project";
import type { BookMutation } from "@/types/book";

const { t } = useSafeI18n();
const project = useProjectStore();
const filter = ref("");
const draft = ref("");
const invalid = ref(false);
watch(draft, () => (invalid.value = false));
const words = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase();
  return (project.book?.dictionary ?? []).filter((word) =>
    word.toLocaleLowerCase().includes(query),
  );
});
function apply(mutation: BookMutation) {
  if (mutation.book !== project.book) project.applyMutation(mutation);
}
function add() {
  if (!project.book) return;
  invalid.value = !isDictionaryWord(draft.value);
  if (invalid.value) return;
  apply(addToDictionary(project.book, draft.value));
  draft.value = "";
}
</script>

<template>
  <section class="flex max-w-xl flex-col gap-4 p-8" aria-labelledby="dictionary-title">
    <h1 id="dictionary-title" class="text-xl font-semibold">
      {{ t("dictionary.title", "Book dictionary") }}
    </h1>
    <form class="flex gap-2" @submit.prevent="add">
      <Input
        v-model="draft"
        :aria-label="t('dictionary.newWord', 'New word')"
        :aria-invalid="invalid"
        :aria-describedby="invalid ? 'dictionary-error' : undefined"
        class="flex-1"
      />
      <Button type="submit">{{ t("dictionary.add", "Add word") }}</Button>
    </form>
    <p v-if="invalid" id="dictionary-error" class="text-xs text-destructive">
      {{ t("dictionary.invalid", "Enter one word without spaces") }}
    </p>
    <Input
      v-model="filter"
      type="search"
      :aria-label="t('dictionary.filter', 'Filter words')"
      :placeholder="t('dictionary.filter', 'Filter words')"
    />
    <p v-if="!project.book?.dictionary.length" class="text-sm text-muted-foreground">
      {{ t("dictionary.empty", "The book dictionary is empty") }}
    </p>
    <p v-else-if="!words.length" class="text-sm text-muted-foreground">
      {{ t("dictionary.noMatches", "No matching words") }}
    </p>
    <ul v-else class="flex flex-col divide-y rounded-md border">
      <li
        v-for="word in words"
        :key="word"
        class="flex items-center justify-between px-3 py-1.5 text-sm"
      >
        <span>{{ word }}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="t('dictionary.remove', 'Remove {word}', { word }).replace('{word}', word)"
          @click="project.book && apply(removeFromDictionary(project.book, word))"
        >
          <IconTrash aria-hidden="true" />
        </Button>
      </li>
    </ul>
  </section>
</template>
