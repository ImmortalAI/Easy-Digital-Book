<script setup lang="ts">
import { computed } from "vue";
import { extractTitle } from "@/services/book/extract-title";
import { useLayoutStore, type CenterView } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const project = useProjectStore();
const layout = useLayoutStore();
const { t } = useSafeI18n();
interface Segment {
  label: string;
  target?: CenterView;
}
const segments = computed<Segment[]>(() => {
  const center = layout.center;
  const book = t("explorer.book", "Book");
  const images = t("explorer.images", "Images");
  if (center.kind === "metadata") return [{ label: t("breadcrumbs.metadata", "Metadata") }];
  if (center.kind === "css") return [{ label: t("explorer.styles", "Styles") }];
  if (center.kind === "images") return [{ label: book }, { label: images }];
  if (center.kind === "image")
    return [{ label: book }, { label: images, target: { kind: "images" } }, { label: center.path }];
  if (center.kind === "settings") return [{ label: t("breadcrumbs.settings", "Settings") }];
  const index = project.book?.chapters.findIndex((chapter) => chapter.id === center.id) ?? -1;
  const chapter = project.book?.chapters[index];
  if (!chapter) return [{ label: t("breadcrumbs.chapters", "Chapters") }];
  const fallback = t("breadcrumbs.fallback", "Chapter {number}", { number: index + 1 }).replace(
    "{number}",
    String(index + 1),
  );
  return [
    { label: t("breadcrumbs.chapters", "Chapters") },
    { label: `${index + 1} ${extractTitle(chapter.source) || fallback}` },
  ];
});
</script>

<template>
  <Breadcrumb :aria-label="t('breadcrumbs.aria', 'Breadcrumbs')" class="min-w-0 px-3 py-2">
    <BreadcrumbList class="flex-nowrap text-xs">
      <template v-for="(segment, index) in segments" :key="index">
        <BreadcrumbSeparator v-if="index > 0" />
        <BreadcrumbItem
          class="min-w-0"
          :aria-current="index === segments.length - 1 ? 'page' : undefined"
        >
          <button
            v-if="segment.target"
            type="button"
            class="truncate hover:underline"
            @click="layout.center = segment.target"
          >
            {{ segment.label }}
          </button>
          <span v-else class="truncate">{{ segment.label }}</span>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
