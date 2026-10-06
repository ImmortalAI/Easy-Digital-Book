<script setup lang="ts">
import { computed, ref } from "vue";
import { IconTextSpellcheck } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { useSpellingActions } from "@/composables/use-spelling-actions";
import { extractTitle } from "@/services/book/extract-title";
import { contextSnippet, summarizeMisspellings } from "@/services/spell/summary";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useSpellingStore } from "@/stores/spelling";

const emit = defineEmits<{ select: [item: { chapterId: string; from: number; to: number }] }>();
const { t } = useSafeI18n();
const project = useProjectStore();
const settings = useSettingsStore();
const spelling = useSpellingStore();
const actions = useSpellingActions();
const open = ref(false);
// `t` does not reliably interpolate `{param}` placeholders, so fill them here.
const fill = (text: string, params: Record<string, string | number>) =>
  Object.entries(params).reduce(
    (value, [key, param]) => value.replace(`{${key}}`, String(param)),
    text,
  );

const groups = computed(() =>
  (project.book?.chapters ?? []).flatMap((chapter, index) => {
    const entry = spelling.visible.get(chapter.id);
    if (!entry) return [];
    const title =
      extractTitle(chapter.source) ||
      fill(t("chapters.fallback", "Chapter {number}", { number: index + 1 }), {
        number: index + 1,
      });
    return [
      {
        chapterId: chapter.id,
        title: fill(
          t("spelling.chapterGroup", "Chapter {number} · {title} — {count}", {
            number: index + 1,
            title,
            count: entry.items.length,
          }),
          { number: index + 1, title, count: entry.items.length },
        ),
        words: summarizeMisspellings(entry.items).map((summary) => ({
          ...summary,
          snippet: contextSnippet(entry.source, summary.first.from, summary.first.to),
        })),
      },
    ];
  }),
);
const label = computed(() =>
  spelling.status === "unavailable"
    ? t("spelling.unavailable", "Spell checking is unavailable")
    : spelling.status === "checking"
      ? t("spelling.checking", "Checking spelling…")
      : fill(
          t(
            "spelling.badge",
            spelling.total === 1 ? "{count} spelling issue" : "{count} spelling issues",
            spelling.total,
          ),
          {
            count: spelling.total,
          },
        ),
);
function select(chapterId: string, from: number, to: number) {
  open.value = false;
  emit("select", { chapterId, from, to });
}
</script>

<template>
  <Popover v-if="settings.spelling.enabled" v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="xs"
        :aria-label="label"
        :title="
          spelling.status === 'unavailable'
            ? t(
                'spelling.unavailableHint',
                'The dictionaries could not be loaded. Details are in the log.',
              )
            : undefined
        "
        :class="spelling.status === 'unavailable' && 'opacity-50'"
      >
        <IconTextSpellcheck aria-hidden="true" />
        <Spinner v-if="spelling.status === 'checking'" class="size-3" aria-hidden="true" />
        <Badge
          v-else-if="spelling.status !== 'unavailable'"
          :variant="spelling.total ? 'destructive' : 'secondary'"
          aria-hidden="true"
          >{{ spelling.total }}</Badge
        >
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" class="w-96 p-0">
      <ScrollArea class="[&>[data-slot=scroll-area-viewport]]:max-h-96">
        <div class="flex flex-col gap-3 p-3 text-xs">
          <template v-if="spelling.status === 'unavailable'">
            <p>
              {{
                t(
                  "spelling.unavailableHint",
                  "The dictionaries could not be loaded. Details are in the log.",
                )
              }}
            </p>
            <Button variant="outline" size="sm" class="self-start" @click="actions.openLogs()">
              {{ t("spelling.openLogs", "Log folder") }}
            </Button>
          </template>
          <p v-else-if="groups.length === 0" class="text-muted-foreground">
            {{ t("spelling.none", "No spelling issues") }}
          </p>
          <section
            v-for="group in groups"
            :key="group.chapterId"
            class="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <h3 class="font-medium">{{ group.title }}</h3>
            <div v-for="word in group.words" :key="word.word" class="flex items-start gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="h-auto min-w-0 flex-1 flex-col items-start whitespace-normal px-1 py-1 text-left text-xs font-normal"
                @click="select(group.chapterId, word.first.from, word.first.to)"
              >
                <span
                  ><span class="font-medium text-spelling">{{ word.word }}</span>
                  <span v-if="word.count > 1" class="text-muted-foreground">
                    {{
                      fill(t("spelling.occurrences", "×{count}", { count: word.count }), {
                        count: word.count,
                      })
                    }}</span
                  ></span
                >
                <span class="text-muted-foreground"
                  >{{ word.snippet.before }}<strong>{{ word.snippet.word }}</strong
                  >{{ word.snippet.after }}</span
                >
              </Button>
              <Button variant="ghost" size="xs" @click="actions.addToDictionary(word.word)">
                {{ t("spelling.addToDictionary", "Add to book dictionary") }}
              </Button>
              <Button variant="ghost" size="xs" @click="actions.ignore(word.word)">
                {{ t("spelling.ignore", "Ignore") }}
              </Button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
