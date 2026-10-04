<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IconPlus, IconTrash } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import ImageTile from "./ImageTile.vue";
import {
  emptySelection,
  selectAll,
  selectRange,
  toggle,
  type Selection,
} from "./gallery-selection";
import { useLongPressSelect } from "@/composables/use-long-press-select";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import { useBookSearch } from "@/composables/use-book-search";
import { useSettingsStore } from "@/stores/settings";
import { collectImageUsage, collectUsedImagePaths } from "@/services/checks/image-usage";
import { setCover } from "@/services/book/metadata";
import { useLayoutStore } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import { useResourceUrls } from "@/composables/use-resource-urls";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import type { ImageFile } from "@/composables/use-image-import";

const props = defineProps<{
  onImport: () => Promise<void>;
  onDropFiles: (files: ImageFile[]) => Promise<void>;
}>();
const project = useProjectStore();
const search = useBookSearch();
const settings = useSettingsStore();
const layout = useLayoutStore();
const { url } = useResourceUrls();
const { t } = useSafeI18n();
type Filter = "all" | "used" | "unused";
const filter = ref<Filter>("all");
const grid = ref<HTMLElement>();
const focusedIndex = ref(0);

const used = computed(() =>
  project.book ? collectUsedImagePaths(project.book) : new Set<string>(),
);
const all = computed(() => [...(project.book?.resources.keys() ?? [])].sort());
const items = computed(() =>
  all.value.filter((path) =>
    filter.value === "all"
      ? true
      : filter.value === "used"
        ? used.value.has(path)
        : !used.value.has(path),
  ),
);
const tabStop = computed(() => Math.max(0, Math.min(focusedIndex.value, items.value.length - 1)));
const unusedCount = computed(() => all.value.filter((path) => !used.value.has(path)).length);

const selection = ref<Selection>(emptySelection());
const selecting = computed(() => selection.value.order.length > 0);
// Selection only ever holds visible, existing paths (batch actions rely on it).
watch(items, (visible) => {
  const keep = new Set(visible);
  const order = selection.value.order.filter((path) => keep.has(path));
  if (order.length === selection.value.order.length) return;
  const anchor = selection.value.anchor;
  selection.value = {
    order,
    anchor: anchor && keep.has(anchor) && order.length ? anchor : null,
  };
});
const pendingDelete = ref<string[] | null>(null);
const usage = computed(() =>
  project.book ? collectImageUsage(project.book) : new Map<string, string[]>(),
);
function requestDelete(paths: string[]) {
  if (paths.length === 0) return;
  if (!settings.confirmDelete) return finishDelete(paths);
  pendingDelete.value = paths;
}
function finishDelete(paths: string[]) {
  search.deleteResources(paths);
  selection.value = emptySelection();
}
function confirmDelete(value: { askAgain: boolean }) {
  if (pendingDelete.value) finishDelete(pendingDelete.value);
  pendingDelete.value = null;
  if (!value.askAgain) {
    settings.confirmDelete = false;
    void settings.persist();
  }
}
const deleteDetails = computed(() =>
  (pendingDelete.value ?? [])
    .map((path) => {
      const chapters = usage.value.get(path) ?? [];
      const name = path.replace(/^images\//, "");
      return chapters.length
        ? `${name} — ${t("images.usedIn", "Used in")}: ${chapters.length}`
        : name;
    })
    .join("\n"),
);
let gestureBase: string[] = [];
let gestureAnchor = "";
const scroller = ref<HTMLElement>();
const press = useLongPressSelect({
  onStart(path) {
    gestureBase = selection.value.order.filter((item) => item !== path);
    gestureAnchor = path;
    selection.value = selectRange(items.value, gestureBase, path, path);
  },
  onExtend(path) {
    selection.value = selectRange(items.value, gestureBase, gestureAnchor, path);
  },
  onEnd() {},
  scroller: () => scroller.value,
});

function onTileClick(event: MouseEvent, path: string) {
  if (press.suppressClick()) return;
  if (event.shiftKey && selection.value.anchor) {
    selection.value = selectRange(items.value, selection.value.order, selection.value.anchor, path);
  } else if (event.metaKey || event.ctrlKey || selecting.value) {
    selection.value = toggle(selection.value, path);
  } else open(path);
}

function open(path: string) {
  layout.center = { kind: "image", path };
}
function columns(): number {
  if (!grid.value) return 1;
  return getComputedStyle(grid.value).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}
async function focusAt(index: number) {
  focusedIndex.value = Math.max(0, Math.min(items.value.length - 1, index));
  await nextTick();
  grid.value?.querySelectorAll<HTMLElement>('[role="gridcell"]')[focusedIndex.value]?.focus();
}
function onFocusin(event: FocusEvent) {
  const path = (event.target as HTMLElement).closest<HTMLElement>("[data-gallery-path]")?.dataset
    .galleryPath;
  const index = path ? items.value.indexOf(path) : -1;
  if (index >= 0) focusedIndex.value = index;
}
function onKeydown(event: KeyboardEvent) {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[
    event.key
  ];
  if (step !== undefined) {
    event.preventDefault();
    void focusAt(focusedIndex.value + step);
  } else if (event.key === "Home") void focusAt(0);
  else if (event.key === "End") void focusAt(items.value.length - 1);
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selection.value = selectAll(items.value);
  } else if (event.key === "Escape") selection.value = emptySelection();
  else if (event.key === " ") {
    event.preventDefault();
    const path = items.value[focusedIndex.value];
    if (path) selection.value = toggle(selection.value, path);
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    const focused = items.value[focusedIndex.value];
    requestDelete(selecting.value ? [...selection.value.order] : focused ? [focused] : []);
  } else if (event.key === "Enter") {
    const path = items.value[focusedIndex.value];
    if (path) open(path);
  }
}
function contextAction(path: string, value: "cover" | "search" | "rename" | "delete") {
  if (value === "cover" && project.book) project.applyMutation(setCover(project.book, path));
  if (value === "search") {
    layout.activeView = "search";
    layout.setSidebarVisible(true);
  }
  if (value === "delete")
    requestDelete(selection.value.order.includes(path) ? [...selection.value.order] : [path]);
  // "rename": Task 15.
}
async function drop(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
    file.type.startsWith("image/"),
  );
  if (files.length === 0) return;
  event.preventDefault();
  await props.onDropFiles(
    await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    ),
  );
}
</script>

<template>
  <section
    ref="scroller"
    class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6"
    data-image-gallery
    @dragover.prevent
    @drop="drop"
  >
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="mr-auto text-xl font-semibold">
        {{ t("explorer.images", "Images") }}
        <span class="text-muted-foreground">{{ all.length }}</span>
      </h1>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="filter"
        :aria-label="t('gallery.filter', 'Show')"
        @update:model-value="(value) => value && (filter = value as Filter)"
      >
        <ToggleGroupItem value="all">{{ t("gallery.all", "All") }}</ToggleGroupItem>
        <ToggleGroupItem value="used">{{ t("gallery.used", "Used") }}</ToggleGroupItem>
        <ToggleGroupItem value="unused">{{ t("gallery.unused", "Unused") }}</ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="sm" @click="onImport">
        <IconPlus aria-hidden="true" />{{ t("gallery.add", "Add…") }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="unusedCount === 0"
        data-delete-unused
        @click="requestDelete(all.filter((p) => !used.has(p)))"
      >
        <IconTrash aria-hidden="true" />{{ t("delete.unusedTitle", "Delete unused images") }}
      </Button>
    </div>
    <div class="flex h-8 shrink-0 items-center gap-2 text-sm" data-selection-bar-slot>
      <template v-if="selecting">
        <span class="mr-auto" data-selection-bar>{{
          t("gallery.selected", "Selected: {count}", { count: selection.order.length })
        }}</span>
        <Button
          variant="destructive"
          size="sm"
          data-selection-delete
          @click="requestDelete([...selection.order])"
        >
          <IconTrash aria-hidden="true" />{{ t("common.delete", "Delete") }}
        </Button>
        <Button variant="outline" size="sm" @click="selection = emptySelection()">{{
          t("gallery.clear", "Clear selection")
        }}</Button>
      </template>
    </div>
    <div
      ref="grid"
      role="grid"
      :aria-label="t('explorer.images', 'Images')"
      class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3"
      @keydown="onKeydown"
      @focusin="onFocusin"
    >
      <div role="row" class="contents">
        <ImageTile
          v-for="(path, index) in items"
          :key="path"
          :path="path"
          :url="url(path)"
          :cover="project.book?.metadata.cover === path"
          :unused="!used.has(path)"
          :selected="selection.order.includes(path)"
          :order="selecting ? selection.order.indexOf(path) + 1 || undefined : undefined"
          :selecting="selecting"
          :focused="index === tabStop"
          @activate="onTileClick($event, path)"
          @press="press.onPointerDown($event, path)"
          @context-action="contextAction(path, $event)"
        />
      </div>
    </div>
    <p v-if="items.length === 0" class="text-sm text-muted-foreground">
      {{ t("gallery.empty", "No images. Add them with the button above or drop files here.") }}
    </p>
    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="t('delete.imagesTitle', 'Delete images')"
      :message="t('delete.imagesMessage', 'These images will be removed from the project.')"
      :details="deleteDetails"
      :ask-again-label="t('common.doNotAskAgain', 'Do not ask again')"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </section>
</template>
