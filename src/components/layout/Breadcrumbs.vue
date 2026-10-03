<script setup lang="ts">
import { computed } from "vue";
import { extractTitle } from "@/services/book/extract-title";
import { useLayoutStore } from "@/stores/layout";
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
const segments = computed<string[]>(() => {
  const center = layout.center;
  if (center.kind === "metadata") return [t("breadcrumbs.metadata", "Metadata")];
  if (center.kind === "css") return [t("explorer.styles", "Styles")];
  if (center.kind === "image") return [center.path];
  if (center.kind === "settings") return [t("breadcrumbs.settings", "Settings")];
  const index = project.book?.chapters.findIndex((chapter) => chapter.id === center.id) ?? -1;
  const chapter = project.book?.chapters[index];
  if (!chapter) return [t("breadcrumbs.chapters", "Chapters")];
  const fallback = t("breadcrumbs.fallback", "Chapter {number}", { number: index + 1 }).replace(
    "{number}",
    String(index + 1),
  );
  return [
    t("breadcrumbs.chapters", "Chapters"),
    `${index + 1} ${extractTitle(chapter.source) || fallback}`,
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
          <span class="truncate">{{ segment }}</span>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
