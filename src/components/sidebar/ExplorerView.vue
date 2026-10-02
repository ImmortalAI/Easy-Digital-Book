<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import { addChapter, moveChapter } from "@/services/book/chapters";
import { setCover, setCustomCss } from "@/services/book/metadata";
import { collectImageUsage, collectUsedImagePaths } from "@/services/checks/image-usage";
import { customCssTemplate } from "@/assets/epub/custom.css";
import { uniqueRandomId } from "@/utils/random-id";
import { extractTitle } from "@/services/book/extract-title";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import type { Chapter } from "@/types/book";
import { IconChevronRight, IconPlus, IconX } from "@tabler/icons-vue";
import { Tree, TreeItem } from "@/components/ui/tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ChapterItem from "./ChapterItem.vue";
import ImageItem from "./ImageItem.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import { useSettingsStore } from "@/stores/settings";
import { useBookSearch } from "@/composables/use-book-search";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { checkBook } from "@/services/checks/book-checks";
import { syncChapterEditorText } from "@/components/editor/editor-commands";
const project = useProjectStore();
const { t } = useSafeI18n();
const layout = useLayoutStore();
const settings = useSettingsStore();
const diagnostics = useDiagnosticsStore();
const search = useBookSearch();
type DeleteTarget = { kind: "chapter" | "image"; id: string } | { kind: "unused"; paths: string[] };
const pendingDelete = ref<DeleteTarget | null>(null);
type Section = "book" | "chapters" | "images";
type ExplorerNode =
  | { id: string; kind: "section"; section: Section; children: ExplorerNode[] }
  | { id: "metadata"; kind: "metadata" }
  | { id: "css"; kind: "css" }
  | { id: string; kind: "chapter"; chapter: Chapter; index: number }
  | { id: string; kind: "image"; path: string };
const labelPrefix = useId();
const expanded = ref<string[]>(["section:book", "section:chapters", "section:images"]);
const draggedChapter = ref<number | null>(null);
const book = computed(() => project.book);
const usage = computed(() =>
  book.value ? collectImageUsage(book.value) : new Map<string, string[]>(),
);
/** Chapter references alone are not usage: the cover and custom.css count too. */
const usedImages = computed(() =>
  book.value ? collectUsedImagePaths(book.value) : new Set<string>(),
);
const warningCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const [chapterId, items] of diagnostics.parse) counts.set(chapterId, items.length);
  const warnings = [
    ...diagnostics.book,
    ...diagnostics.read,
    ...(book.value ? checkBook(book.value) : []),
  ];
  for (const warning of warnings)
    if (warning.chapterId) counts.set(warning.chapterId, (counts.get(warning.chapterId) ?? 0) + 1);
  return counts;
});
function unusedResourcePaths(): string[] {
  return book.value
    ? [...book.value.resources.keys()].filter((path) => !usedImages.value.has(path))
    : [];
}
function chapterDisplayName(id: string): string {
  const index = book.value?.chapters.findIndex((chapter) => chapter.id === id) ?? -1;
  const chapter = index >= 0 ? book.value?.chapters[index] : undefined;
  return (
    (chapter && extractTitle(chapter.source)) ||
    t("chapters.fallback", "Chapter {number}", { number: index + 1 }).replace(
      "{number}",
      String(index + 1),
    )
  );
}
function imageUsageDetails(path: string): string {
  const chapters = usage.value.get(path) ?? [];
  if (chapters.length)
    return `${t("images.usedIn", "Used in")}: ${chapters.map(chapterDisplayName).join(", ")}`;
  if (book.value?.metadata.cover === path) return t("images.usedAsCover", "Used as the cover");
  if (usedImages.value.has(path)) return t("images.usedInStyles", "Used in styles");
  return t("images.unused", "not used");
}
const deleteTitle = computed(() => {
  const target = pendingDelete.value;
  if (target?.kind === "unused") return t("delete.unusedTitle", "Delete unused images");
  if (target?.kind === "image")
    return `${t("delete.imageTitle", "Delete image")} “${target.id.replace(/^images\//, "") ?? ""}”`;
  return `${t("delete.chapterTitle", "Delete chapter")} “${target ? chapterDisplayName(target.id) : ""}”`;
});
const deleteMessage = computed(() =>
  pendingDelete.value?.kind === "unused"
    ? t("delete.unusedMessage", "These unused images will be removed from the project.")
    : pendingDelete.value?.kind === "image"
      ? t("delete.imageMessage", "This image will be removed from the project.")
      : t("delete.chapterMessage", "This chapter will be removed from the book."),
);
const deleteDetails = computed(() => {
  const target = pendingDelete.value;
  if (target?.kind === "unused")
    return target.paths.map((path) => path.replace(/^images\//, "")).join(", ");
  if (target?.kind === "image") {
    return imageUsageDetails(target.id);
  }
  const chapter = book.value?.chapters.find((item) => item.id === target?.id);
  const words = chapter?.source.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return `${t("delete.words", "Words")}: ${words}`;
});
/** The whole explorer as one tree: Book, Chapters and Images, each with its rows. */
const nodes = computed<ExplorerNode[]>(() => {
  if (!book.value) return [];
  return [
    {
      id: "section:book",
      kind: "section",
      section: "book",
      children: [
        { id: "metadata", kind: "metadata" },
        { id: "css", kind: "css" },
      ],
    },
    {
      id: "section:chapters",
      kind: "section",
      section: "chapters",
      children: book.value.chapters.map((chapter, index) => ({
        id: `chapter:${chapter.id}`,
        kind: "chapter",
        chapter,
        index,
      })),
    },
    {
      id: "section:images",
      kind: "section",
      section: "images",
      children: [...book.value.resources.keys()].map((path) => ({
        id: `image:${path}`,
        kind: "image",
        path,
      })),
    },
  ];
});
const nodeKey = (node: ExplorerNode) => node.id;
const nodeChildren = (node: ExplorerNode) => (node.kind === "section" ? node.children : undefined);
/** The tree's selection mirrors whatever the center pane shows. */
const selectedNode = computed(() => {
  const center = layout.center;
  if (center.kind === "chapter") return { id: `chapter:${center.id}` };
  if (center.kind === "image") return { id: `image:${center.path}` };
  if (center.kind === "metadata" || center.kind === "css") return { id: center.kind };
  return undefined;
});
function sectionTitle(section: Section): string {
  if (section === "book") return t("explorer.book", "Book");
  if (section === "chapters") return t("explorer.chapters", "Chapters");
  return t("explorer.images", "Images");
}
function sectionCount(section: Section): number | undefined {
  if (section === "chapters") return book.value?.chapters.length;
  if (section === "images") return book.value?.resources.size;
  return undefined;
}
/**
 * Leaf rows act on select; selection itself is driven by layout.center, so
 * the tree's own model is never written.
 */
function selectLeaf(event: Event, kind: "metadata" | "css") {
  event.preventDefault();
  if (kind === "metadata") layout.center = { kind: "metadata" };
  else openCss();
}
function selectChapter(id: string) {
  layout.center = { kind: "chapter", id };
}
function add(index = book.value?.chapters.length ?? 0) {
  if (book.value) {
    const result = addChapter(
      book.value,
      {
        newId: () => uniqueRandomId(book.value!.chapters.map((chapter) => chapter.id)),
        locale: book.value.metadata.language,
      },
      index,
    );
    project.applyMutation(result);
    selectChapter(
      result.book.chapters[index]?.id ?? result.book.chapters[result.book.chapters.length - 1]!.id,
    );
  }
}
function move(index: number, direction: -1 | 1) {
  if (book.value) {
    const mutation = moveChapter(book.value, index, index + direction);
    if (mutation.book !== book.value) project.applyMutation(mutation);
  }
}
function navigate(index: number, direction: -1 | 1) {
  const target = book.value?.chapters[index + direction];
  if (target) selectChapter(target.id);
}
function removeChapterAt(id: string) {
  if (!book.value) return;
  if (!settings.confirmDelete) {
    search.deleteChapter(id);
    return;
  }
  pendingDelete.value = { kind: "chapter", id };
}
function confirmDelete(value: { askAgain: boolean }) {
  const target = pendingDelete.value;
  if (target?.kind === "chapter" && target.id) search.deleteChapter(target.id);
  if (target?.kind === "image" && target.id) search.deleteResource(target.id);
  if (target?.kind === "unused") for (const path of target.paths) search.deleteResource(path);
  pendingDelete.value = null;
  if (!value.askAgain) {
    settings.confirmDelete = false;
    void settings.persist();
  }
}
function requestDelete(target: { kind: "chapter" | "image" | "unused"; id?: string }) {
  if (!settings.confirmDelete) {
    if (target.kind === "chapter" && target.id) search.deleteChapter(target.id);
    if (target.kind === "image" && target.id) search.deleteResource(target.id);
    if (target.kind === "unused")
      for (const path of unusedResourcePaths()) search.deleteResource(path);
    return;
  }
  pendingDelete.value =
    target.kind === "unused"
      ? { kind: "unused", paths: unusedResourcePaths() }
      : { kind: target.kind, id: target.id! };
}
/**
 * The single dispatcher for every row's context menu. Each row's ContextMenu
 * owns its own trigger and content now (no more shared coordinate state), so
 * the target comes straight from the item that invoked this — the v-for scope
 * that owns the menu the action was picked from.
 */
function selectContextAction(value: string, target: { kind: "chapter" | "image"; id: string }) {
  if (target.kind === "chapter" && value === "new-after") {
    const index = book.value?.chapters.findIndex((chapter) => chapter.id === target.id) ?? -1;
    if (index >= 0) add(index + 1);
  }
  if (target.kind === "chapter" && value === "delete")
    requestDelete({ kind: "chapter", id: target.id });
  if (target.kind === "image" && value === "cover" && book.value)
    project.applyMutation(setCover(book.value, target.id));
  if (target.kind === "image" && value === "insert") insertImage(target.id);
  if (target.kind === "image" && value === "search") {
    layout.activeView = "search";
    layout.setSidebarVisible(true);
  }
  if (target.kind === "image" && value === "delete")
    requestDelete({ kind: "image", id: target.id });
}
function insertImage(path: string) {
  // layout.center starts as { kind: "chapter", id: "" }, so matching on the id
  // alone silently finds nothing until a chapter has been opened.
  const selected = layout.center.kind === "chapter" ? layout.center.id : "";
  const chapter =
    book.value?.chapters.find((item) => item.id === selected) ?? book.value?.chapters[0];
  if (!chapter) return;
  const source = `${chapter.source}\n\n![](${path})`;
  project.updateChapterSource(chapter.id, source);
  syncChapterEditorText(chapter.id, source);
  layout.center = { kind: "chapter", id: chapter.id };
}
function openCss() {
  if (!book.value) return;
  if (book.value.customCss === null)
    project.applyMutation(setCustomCss(book.value, customCssTemplate));
  layout.center = { kind: "css" };
}
function startDrag(index: number) {
  draggedChapter.value = index;
}
function dropChapter(index: number) {
  if (draggedChapter.value !== null && draggedChapter.value !== index && book.value)
    project.applyMutation(moveChapter(book.value, draggedChapter.value, index));
  draggedChapter.value = null;
}
function requestImport() {
  emit("import");
}
/**
 * A section row is never selected; activating it folds it. A click already
 * toggles on its own (Reka fires select and toggle for it), but Enter and
 * Space only select, so for those the row toggles here.
 */
function selectSection(event: CustomEvent<{ originalEvent: Event }>, key: string) {
  event.preventDefault();
  if (!(event.detail.originalEvent instanceof KeyboardEvent)) return;
  expanded.value = expanded.value.includes(key)
    ? expanded.value.filter((item) => item !== key)
    : [...expanded.value, key];
}
/**
 * Forwards the raw contextmenu event alongside the row's own ContextMenu —
 * consumers outside this component (e.g. a later task) still get to observe
 * the right click. This must not interfere with the menu opening: it never
 * calls preventDefault, so ImageItem's ContextMenuTrigger still does.
 */
function imageContextMenu(path: string, event: MouseEvent) {
  emit("image-context-menu", path, event);
}
const emit = defineEmits<{ import: []; "image-context-menu": [path: string, event: MouseEvent] }>();
</script>
<template>
  <div v-if="book" class="flex flex-col gap-1 p-2">
    <h2 class="px-2 text-xs font-semibold uppercase text-muted-foreground">
      {{ t("explorer.title", "Explorer") }}
    </h2>
    <Tree
      v-slot="{ flattenItems }"
      v-model:expanded="expanded"
      :items="nodes"
      :get-key="nodeKey"
      :get-children="nodeChildren"
      :model-value="selectedNode"
      :aria-label="t('explorer.title', 'Explorer')"
    >
      <template v-for="item in flattenItems" :key="item._id">
        <TreeItem
          v-if="item.value.kind === 'section'"
          v-slot="{ isExpanded }"
          v-bind="item.bind"
          :aria-labelledby="`${labelPrefix}-${item.value.section}`"
          class="font-medium"
          @select="selectSection($event, nodeKey(item.value))"
        >
          <IconChevronRight
            class="size-3.5 shrink-0 transition-transform"
            :class="{ 'rotate-90': isExpanded }"
            aria-hidden="true"
          />
          <span :id="`${labelPrefix}-${item.value.section}`" class="min-w-0 flex-1 truncate">{{
            sectionTitle(item.value.section)
          }}</span>
          <Badge v-if="sectionCount(item.value.section) !== undefined" variant="secondary">{{
            sectionCount(item.value.section)
          }}</Badge>
          <span
            v-if="item.value.section === 'chapters'"
            class="flex shrink-0 text-muted-foreground"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="t('explorer.newChapter', 'New chapter')"
              @click.stop="add()"
            >
              <IconPlus aria-hidden="true" />
            </Button>
          </span>
          <span
            v-else-if="item.value.section === 'images'"
            class="flex shrink-0 text-muted-foreground"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="t('files.importImage', 'Import image')"
              @click.stop="requestImport"
            >
              <IconPlus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="t('delete.unusedTitle', 'Delete unused images')"
              @click.stop="requestDelete({ kind: 'unused' })"
            >
              <IconX aria-hidden="true" />
            </Button>
          </span>
        </TreeItem>
        <TreeItem
          v-else-if="item.value.kind === 'metadata' || item.value.kind === 'css'"
          v-bind="item.bind"
          @select="selectLeaf($event, item.value.kind)"
        >
          <span v-if="item.value.kind === 'metadata'" class="truncate">{{
            t("explorer.metadata", "Metadata")
          }}</span>
          <span v-else class="truncate">{{
            book.customCss === null
              ? t("explorer.createCss", "Styles (create)")
              : t("explorer.styles", "Styles")
          }}</span>
        </TreeItem>
        <ChapterItem
          v-else-if="item.value.kind === 'chapter'"
          :bind="item.bind"
          :chapter="item.value.chapter"
          :index="item.value.index"
          :warning-count="warningCounts.get(item.value.chapter.id) ?? 0"
          :fallback-title="
            t('chapters.fallback', 'Chapter {number}', { number: item.value.index + 1 }).replace(
              '{number}',
              String(item.value.index + 1),
            )
          "
          @select="selectChapter(item.value.chapter.id)"
          @move="move(item.value.index, $event)"
          @navigate="navigate(item.value.index, $event)"
          @remove="removeChapterAt(item.value.chapter.id)"
          @context-action="
            selectContextAction($event, { kind: 'chapter', id: item.value.chapter.id })
          "
          @new-after="add(item.value.index + 1)"
          @drag-start="startDrag(item.value.index)"
          @drop="dropChapter(item.value.index)"
        />
        <ImageItem
          v-else-if="item.value.kind === 'image'"
          :bind="item.bind"
          :path="item.value.path"
          :cover="book.metadata.cover === item.value.path"
          :unused="!usedImages.has(item.value.path)"
          @select="layout.center = { kind: 'image', path: item.value.path }"
          @contextmenu="imageContextMenu(item.value.path, $event)"
          @context-action="selectContextAction($event, { kind: 'image', id: item.value.path })"
        />
      </template>
    </Tree>
    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="deleteTitle"
      :message="deleteMessage"
      :details="deleteDetails"
      :ask-again-label="t('common.doNotAskAgain', 'Do not ask again')"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
