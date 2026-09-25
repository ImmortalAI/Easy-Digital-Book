<script setup lang="ts">
import { computed, ref } from "vue";
import { checkBook } from "@/services/checks/book-checks";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { IconAlertTriangle } from "@tabler/icons-vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const props = defineProps<{ chapterId?: string }>();
const emit = defineEmits<{
  select: [item: { chapterId?: string; position?: { line: number; column: number } }];
}>();
const diagnostics = useDiagnosticsStore();
const project = useProjectStore();
const { t } = useSafeI18n();
const open = ref(false);
const chapterItems = computed(() =>
  props.chapterId ? (diagnostics.parse.get(props.chapterId) ?? []) : [],
);
const bookItems = computed(() => {
  const items = [
    ...diagnostics.book,
    ...diagnostics.read,
    ...(project.book ? checkBook(project.book) : []),
  ];
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}|${item.message}|${item.chapterId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const parseCount = computed(() =>
  [...diagnostics.parse.values()].reduce((total, items) => total + items.length, 0),
);
const count = computed(() => parseCount.value + bookItems.value.length);
// A number as the params argument selects the plural form and fills `{count}`.
const countLabel = computed(() => t("warnings.count", `${count.value} warnings`, count.value));

const groups = computed(() => [
  {
    key: "chapter",
    title: t("warnings.currentChapter", "Current chapter"),
    items: chapterItems.value,
  },
  { key: "book", title: t("warnings.book", "Book"), items: bookItems.value },
]);

function select(item: { chapterId?: string; position?: { line: number; column: number } }) {
  emit("select", item);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="xs" :aria-label="countLabel">
        <IconAlertTriangle aria-hidden="true" />
        <Badge :variant="count ? 'destructive' : 'secondary'" aria-hidden="true">{{ count }}</Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" class="w-80 p-0">
      <!-- The viewport carries the cap: the root's height is indefinite, so a
           max-height on the root alone would clip instead of scroll. -->
      <ScrollArea class="[&>[data-slot=scroll-area-viewport]]:max-h-80">
        <div class="flex flex-col gap-3 p-3">
          <section
            v-for="group in groups"
            :key="group.key"
            class="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <h3 class="text-xs font-medium">{{ group.title }}</h3>
            <Button
              v-for="(item, index) in group.items"
              :key="`${group.key}-${index}`"
              variant="ghost"
              size="sm"
              class="h-auto justify-start whitespace-normal px-1 py-1 text-left text-xs font-normal"
              @click="select(item)"
            >
              {{ item.message }}
            </Button>
            <p v-if="group.items.length === 0" class="text-xs text-muted-foreground">
              {{ t("warnings.none", "No warnings") }}
            </p>
          </section>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
