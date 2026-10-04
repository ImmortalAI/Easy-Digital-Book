<script setup lang="ts">
import { computed } from "vue";
import { imageDimensions } from "@/services/book/image-dimensions";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import {
  captureImageImportIdentity,
  isImageImportIdentityCurrent,
  type ImageFile,
  type ImageImportIdentity,
} from "@/composables/use-image-import";
import { useProjectStore } from "@/stores/project";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
const { t } = useSafeI18n();
const project = useProjectStore();
const props = defineProps<{
  cover: string | null;
  preview?: string;
  onPick?: () => Promise<void>;
  onDropFile?: (file: ImageFile, identity: ImageImportIdentity) => Promise<void>;
}>();
const RECOMMENDED = { width: 1600, height: 2560 };
const size = computed(() => {
  const resource = props.cover ? project.book?.resources.get(props.cover) : undefined;
  return resource ? imageDimensions(resource.bytes, resource.mediaType) : null;
});
const ratio = computed(() =>
  size.value && size.value.height > 0
    ? size.value.width / size.value.height
    : RECOMMENDED.width / RECOMMENDED.height,
);
const small = computed(
  () =>
    size.value !== null &&
    (size.value.width < RECOMMENDED.width / 2 || size.value.height < RECOMMENDED.height / 2),
);
const emit = defineEmits<{ choose: []; remove: [] }>();
async function choose() {
  emit("choose");
  await props.onPick?.();
}
async function drop(event: DragEvent) {
  const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
    item.type.startsWith("image/"),
  );
  if (!file || !props.onDropFile) return;
  const identity = captureImageImportIdentity(project);
  if (!identity) return;
  event.preventDefault();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isImageImportIdentityCurrent(project, identity)) return;
  await props.onDropFile(
    {
      name: file.name || "cover.png",
      bytes,
      type: file.type,
    },
    identity,
  );
}
</script>
<template>
  <Card @dragover.prevent @drop="drop">
    <CardContent class="flex flex-col gap-3">
      <!-- Reka's AspectRatio puts classes on its inner box; the width must
           bound the outer box, or its padding-based height follows the card. -->
      <div v-if="preview" class="w-32">
        <AspectRatio :ratio="ratio" class="overflow-hidden rounded-lg bg-muted">
          <img :src="preview" :alt="cover ?? ''" class="size-full object-contain" />
        </AspectRatio>
      </div>
      <div v-if="cover" class="break-all text-sm text-muted-foreground">{{ cover }}</div>
      <p class="text-xs text-muted-foreground">
        <template v-if="size">
          {{ t("metadata.coverSize", "Size") }}: {{ size.width }}×{{ size.height }} ·
        </template>
        {{ t("metadata.coverHint", "Recommended 1600×2560") }}
      </p>
      <p v-if="small" class="text-xs text-destructive">
        {{ t("metadata.coverSmall", "The cover is small and may look blurry on Kindle") }}
      </p>
      <div class="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" @click="choose">
          {{ t("metadata.choose", "Choose…") }}
        </Button>
        <Button v-if="cover" type="button" variant="ghost" size="sm" @click="emit('remove')">
          {{ t("metadata.remove", "Remove") }}
        </Button>
      </div>
      <Empty>
        <EmptyDescription>{{ t("metadata.drop", "Drop an image here") }}</EmptyDescription>
      </Empty>
    </CardContent>
  </Card>
</template>
