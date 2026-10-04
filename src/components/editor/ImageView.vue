<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  IconFileText,
  IconPencil,
  IconPhotoOff,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import RenameImagesDialog from "@/components/images/RenameImagesDialog.vue";
import { useImageActions } from "@/composables/use-image-actions";
import { setCover } from "@/services/book/metadata";
import type { ResourceRename } from "@/services/book/rename-resources";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import { collectImageUsage } from "@/services/checks/image-usage";
import { extractTitle } from "@/services/book/extract-title";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { imageDimensions } from "@/services/book/image-dimensions";
const { t } = useSafeI18n();
const props = defineProps<{ path: string }>();
const project = useProjectStore();
const layout = useLayoutStore();
const usedInId = useId();
const resource = computed(() => project.book?.resources.get(props.path));
const dimensions = computed(() =>
  resource.value ? imageDimensions(resource.value.bytes, resource.value.mediaType) : null,
);
const ratio = computed(() =>
  dimensions.value && dimensions.value.height > 0
    ? dimensions.value.width / dimensions.value.height
    : 4 / 3,
);
const usage = computed(() =>
  project.book ? (collectImageUsage(project.book).get(props.path) ?? []) : [],
);
const { url } = useResourceUrls();
const src = computed(() => url(props.path) ?? "");
function chapterTitle(id: string) {
  const source = project.book?.chapters.find((chapter) => chapter.id === id)?.source ?? "";
  return extractTitle(source) || id;
}
function openChapter(id: string) {
  layout.center = { kind: "chapter", id };
}
const isCover = computed(() => project.book?.metadata.cover === props.path);
function makeCover() {
  if (project.book) project.applyMutation(setCover(project.book, props.path));
}
const { renameImages } = useImageActions();
const renaming = ref(false);
function confirmRename(renames: ResourceRename[]) {
  renameImages(renames);
  renaming.value = false;
  const renamed = renames[0];
  // The page is addressed by path; follow the image to its new name.
  if (renamed) layout.center = { kind: "image", path: renamed.to };
}
</script>
<template>
  <section v-if="resource" class="max-w-2xl p-8">
    <Card>
      <CardContent>
        <div class="mx-auto w-full" data-image-frame :style="{ maxWidth: `calc(70vh * ${ratio})` }">
          <AspectRatio :ratio="ratio" class="overflow-hidden rounded-lg bg-muted">
            <img :src="src" :alt="path" class="size-full object-contain" />
          </AspectRatio>
        </div>
      </CardContent>
      <CardHeader>
        <CardTitle>
          <h2 class="break-all">{{ path }}</h2>
        </CardTitle>
        <div class="flex flex-wrap gap-2">
          <Badge v-if="dimensions" variant="secondary">
            {{ dimensions.width }}×{{ dimensions.height }} px
          </Badge>
          <Badge variant="secondary">
            {{ resource.bytes.byteLength }} {{ t("metadata.bytes", "bytes") }}
          </Badge>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Badge v-if="isCover">
            <IconStarFilled aria-hidden="true" />{{ t("gallery.cover", "Cover") }}
          </Badge>
          <Button variant="outline" size="sm" :disabled="isCover" @click="makeCover">
            <IconStar aria-hidden="true" />{{ t("images.setCover", "Set as cover") }}
          </Button>
          <Button variant="outline" size="sm" @click="renaming = true">
            <IconPencil aria-hidden="true" />{{ t("gallery.rename", "Rename…") }}
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent class="flex flex-col gap-3">
        <h3 :id="usedInId" class="font-medium">{{ t("images.usedIn", "Used in") }}</h3>
        <ItemGroup v-if="usage.length" :aria-labelledby="usedInId" class="gap-2">
          <div v-for="id in usage" :key="id" role="listitem">
            <Item
              as="button"
              type="button"
              variant="outline"
              size="sm"
              class="text-left hover:bg-muted"
              @click="openChapter(id)"
            >
              <ItemMedia variant="icon">
                <IconFileText aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{{ chapterTitle(id) }}</ItemTitle>
              </ItemContent>
            </Item>
          </div>
        </ItemGroup>
        <Empty v-else class="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconPhotoOff aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{{ t("images.unused", "not used") }}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
    <RenameImagesDialog
      :open="renaming"
      :paths="[path]"
      @cancel="renaming = false"
      @confirm="confirmRename"
    />
  </section>
</template>
