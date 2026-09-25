<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from "vue";
import { useShortcuts } from "@/composables/use-shortcuts";
import { projectFilesKey } from "@/composables/use-project-files";
import { useLayoutStore, type LayoutMode } from "@/stores/layout";
import { useProjectStore } from "@/stores/project";
import type { DiagnosticPosition } from "@/types/diagnostics";
import AppToolbar from "@/components/layout/AppToolbar.vue";
import FileMenu from "@/components/layout/FileMenu.vue";
import Breadcrumbs from "@/components/layout/Breadcrumbs.vue";
import ResizableSplit from "@/components/layout/ResizableSplit.vue";
import StatusBadge from "@/components/layout/StatusBadge.vue";
import PreviewPane from "@/components/editor/PreviewPane.vue";
import SourceEditor from "@/components/editor/SourceEditor.vue";
import WarningsPopover from "@/components/editor/WarningsPopover.vue";
import ActivityBar from "@/components/sidebar/ActivityBar.vue";
import ExplorerView from "@/components/sidebar/ExplorerView.vue";
import SearchView from "@/components/sidebar/SearchView.vue";
import MetadataForm from "@/components/metadata/MetadataForm.vue";
import CssEditor from "@/components/editor/CssEditor.vue";
import ImageView from "@/components/editor/ImageView.vue";
import SettingsView from "@/components/settings/SettingsView.vue";
import ExportDialog from "@/components/export/ExportDialog.vue";
import { createSettingsActions } from "@/composables/use-settings-actions";
import { useSettingsStore } from "@/stores/settings";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { IconAlertTriangle } from "@tabler/icons-vue";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  captureImageImportIdentity,
  imageCursorPosition,
  isImageImportIdentityCurrent,
  useImageImport,
  type ImageFile,
  type ImageImportIdentity,
} from "@/composables/use-image-import";
import { setCover } from "@/services/book/metadata";

const project = useProjectStore();
const diagnostics = useDiagnosticsStore();
const { t } = useSafeI18n();
const files = inject(projectFilesKey, null);
const layout = useLayoutStore();
const settings = files?.settings ?? useSettingsStore();
const settingsActions = files?.settingsActions ?? createSettingsActions({ settings });
const exportController = files?.exportController;
const exportOpen = ref(false);
const shell = ref<HTMLElement>();
const sourceScroller = ref<HTMLElement | null>(null);
const sourceEditor = ref<{
  focusPosition: (position: DiagnosticPosition) => void;
  focusRange: (range: { from: number; to: number }) => void;
  syncSource: (source: string, cursor: number) => void;
} | null>(null);
const pendingFocusPosition = ref<DiagnosticPosition | null>(null);
const focusRequest = ref(0);
const pendingFocusRange = ref<{ from: number; to: number } | null>(null);
const focusRangeRequest = ref(0);

function hasChapter(id: string): boolean {
  return Boolean(project.book?.chapters.some((chapter) => chapter.id === id));
}

const firstChapterId = computed(() => project.book?.chapters[0]?.id ?? "");
const selectedChapterId = computed(() => {
  const selected = layout.center.kind === "chapter" ? layout.center.id : "";
  return hasChapter(selected) ? selected : "";
});
const lastChapterId = ref("");
const previewChapterId = computed(() =>
  hasChapter(lastChapterId.value) ? lastChapterId.value : firstChapterId.value,
);
const selectedChapter = computed(() =>
  project.book?.chapters.find((chapter) => chapter.id === selectedChapterId.value),
);
const canUseModes = computed(() => ["chapter", "css"].includes(layout.center.kind));
const singlePane = computed(() => ["metadata", "image", "settings"].includes(layout.center.kind));
const activeActivity = computed(() =>
  layout.center.kind === "settings" ? "settings" : layout.activeView,
);
const wordCount = computed(
  () => selectedChapter.value?.source.trim().split(/\s+/).filter(Boolean).length ?? 0,
);
const characterCount = computed(() => selectedChapter.value?.source.length ?? 0);
const statusLabel = computed(() =>
  t("editor.status", "{words} words · {characters} characters", {
    words: wordCount.value,
    characters: characterCount.value,
  })
    .replace("{words}", String(wordCount.value))
    .replace("{characters}", String(characterCount.value)),
);
const imageImport = useImageImport({ pickFile: files?.pickImage });

async function importImage() {
  await imageImport.pickAndImport();
}

async function importImageAt(file: ImageFile, position: number, identity: ImageImportIdentity) {
  const chapter = selectedChapter.value;
  if (!chapter) return;
  const source = chapter.source;
  const result = await imageImport.importFile(file, chapter.id, position, identity);
  if (!result) return;
  const next = project.book?.chapters.find((item) => item.id === chapter.id)?.source;
  if (next) sourceEditor.value?.syncSource(next, imageCursorPosition(source, position));
}

async function importCover(file: ImageFile, identity: ImageImportIdentity) {
  const result = await imageImport.importFile(file, undefined, undefined, identity);
  if (result && isImageImportIdentityCurrent(project, identity) && project.book)
    project.applyMutation(setCover(project.book, result.path));
}

async function pickCover() {
  const identity = captureImageImportIdentity(project);
  if (!identity) return;
  const file = await files?.pickImage();
  if (file) await importCover(file, identity);
}

function setMode(mode: LayoutMode) {
  if (!canUseModes.value) return;
  layout.mode = mode;
  void layout.persist();
}

function persistLayout() {
  void layout.persist();
}

function showSidebarView(view: "explorer" | "search") {
  layout.activeView = view;
  layout.setSidebarVisible(true);
  persistLayout();
}

function selectActivity(view: "explorer" | "search" | "settings") {
  if (view === "settings") {
    layout.center = { kind: "settings" };
    layout.setSidebarVisible(false);
    persistLayout();
    return;
  }
  if (layout.activeView === view && layout.sidebarVisible) {
    layout.setSidebarVisible(false);
  } else {
    layout.activeView = view;
    layout.setSidebarVisible(true);
  }
  persistLayout();
}

async function selectWarning(item: { chapterId?: string; position?: DiagnosticPosition }) {
  const chapterId = item.chapterId ?? selectedChapterId.value;
  if (!chapterId || !hasChapter(chapterId)) return;
  layout.center = { kind: "chapter", id: chapterId };
  pendingFocusPosition.value = item.position ?? null;
  if (!item.position) return;
  focusRequest.value++;
  await nextTick();
  sourceEditor.value?.focusPosition(item.position);
}
async function selectSearchResult(chapterId: string, from: number, to: number) {
  if (!hasChapter(chapterId)) return;
  layout.center = { kind: "chapter", id: chapterId };
  pendingFocusRange.value = { from, to };
  focusRangeRequest.value++;
  await nextTick();
  if (pendingFocusRange.value) sourceEditor.value?.focusRange(pendingFocusRange.value);
}

function findSourceScroller() {
  sourceScroller.value = shell.value?.querySelector<HTMLElement>(".cm-scroller") ?? null;
}

useShortcuts({
  newBook: files ? () => void files.newBook() : undefined,
  open: files ? () => void files.open() : undefined,
  save: files ? () => void files.save() : undefined,
  saveAs: files ? () => void files.saveAs() : undefined,
  closeProject: files ? () => void files.close() : undefined,
  toggleSidebar: () => {
    layout.toggleSidebar();
    persistLayout();
  },
  explorer: () => showSidebarView("explorer"),
  searchBook: () => showSidebarView("search"),
  exportEpub: () => (exportOpen.value = true),
  textMode: () => setMode("text"),
  splitMode: () => setMode("split"),
  previewMode: () => setMode("preview"),
});

watch(
  () =>
    [
      project.bookGeneration,
      project.book?.chapters.map((chapter) => chapter.id).join("\u0000"),
      layout.center.kind,
      layout.center.kind === "chapter" ? layout.center.id : "",
    ] as const,
  async () => {
    if (layout.center.kind === "chapter") {
      if (hasChapter(layout.center.id)) lastChapterId.value = layout.center.id;
      else if (firstChapterId.value) {
        layout.center = { kind: "chapter", id: firstChapterId.value };
        return;
      }
    }
    await nextTick();
    findSourceScroller();
  },
  { immediate: true },
);

watch(
  () => focusRangeRequest.value,
  () => {
    if (pendingFocusRange.value) sourceEditor.value?.focusRange(pendingFocusRange.value);
  },
  { flush: "post" },
);

onMounted(findSourceScroller);
</script>

<template>
  <main ref="shell" class="flex h-dvh flex-col overflow-hidden" data-shell>
    <!-- The shell owns the window exactly: a `min-height` here would let tall
         chapters push it past the viewport and scroll the whole document,
         header included, instead of scrolling the pane that holds the text. -->
    <header class="flex min-h-13 items-center justify-between gap-4 border-b px-4">
      <FileMenu
        :title="project.filePath ?? t('editor.unnamedBook', 'Untitled book')"
        :dirty="project.dirty"
        @new="files?.newBook()"
        @open="files?.open()"
        @save="files?.save()"
        @save-as="files?.saveAs()"
        @close="files?.close()"
      />
      <AppToolbar @export="exportOpen = true" />
    </header>
    <!-- `shrink-0` keeps the strip from being squeezed away when a chapter is tall. -->
    <Alert
      v-if="diagnostics.read.length"
      role="status"
      class="shrink-0 rounded-none border-x-0 border-t-0 py-1.5 text-xs"
    >
      <IconAlertTriangle aria-hidden="true" />
      <AlertTitle>
        {{
          t("editor.openProblems", "{count} problems found when opening", {
            count: diagnostics.read.length,
          }).replace("{count}", String(diagnostics.read.length))
        }}
      </AlertTitle>
    </Alert>
    <!-- The body is both a flex item of the shell and the flex container that
         lets the split's `flex-1` resolve. Without it the split falls back to
         auto height and the window is left empty below the content. -->
    <div class="flex min-h-0 flex-1 flex-col" data-shell-body>
      <ResizableSplit :single-pane="singlePane">
        <template #activity>
          <ActivityBar :active="activeActivity" @select="selectActivity" />
        </template>
        <template #sidebar>
          <!-- Each view pads itself; padding here too would inset its rows twice. -->
          <div class="min-w-0 flex-1 overflow-auto text-xs">
            <ExplorerView v-if="layout.activeView === 'explorer'" @import="importImage" />
            <SearchView v-else @select="selectSearchResult" />
          </div>
        </template>
        <template #single>
          <Breadcrumbs />
          <!-- Breadcrumbs stay pinned; the view below them scrolls. Without this,
               metadata and settings taller than the window are clipped by the
               pane's overflow. -->
          <div class="flex min-h-0 flex-1 flex-col overflow-auto" data-single-pane-content>
            <MetadataForm
              v-if="layout.center.kind === 'metadata'"
              :on-pick-cover="pickCover"
              :on-import-cover="importCover"
            />
            <ImageView v-else-if="layout.center.kind === 'image'" :path="layout.center.path" />
            <SettingsView
              v-else-if="layout.center.kind === 'settings'"
              :settings="settings"
              :actions="settingsActions"
            />
            <div v-else class="grid flex-1 place-items-center text-muted-foreground">
              {{ t("editor.selectChapter", "Select a chapter") }}
            </div>
          </div>
        </template>
        <template #source>
          <div class="relative flex h-full flex-col">
            <Breadcrumbs />
            <SourceEditor
              ref="sourceEditor"
              v-if="layout.center.kind === 'chapter' && selectedChapterId"
              :chapter-id="selectedChapterId"
              :focus-position="pendingFocusPosition"
              :focus-request="focusRequest"
              :import-image="importImageAt"
            />
            <CssEditor v-else-if="layout.center.kind === 'css'" />
            <div v-else class="grid flex-1 place-items-center text-muted-foreground">
              {{ t("editor.chooseChapter", "Select a chapter") }}
            </div>
            <div class="absolute right-3 bottom-3 flex items-center gap-2">
              <WarningsPopover
                v-if="!singlePane"
                :chapter-id="selectedChapterId || previewChapterId"
                @select="selectWarning"
              />
              <StatusBadge :label="statusLabel" />
            </div>
          </div>
        </template>
        <template #preview>
          <PreviewPane
            v-if="previewChapterId"
            :chapter-id="previewChapterId"
            :source-scroller="sourceScroller"
          />
        </template>
      </ResizableSplit>
    </div>
    <ExportDialog
      v-if="exportController"
      v-model:open="exportOpen"
      :controller="exportController"
      :project="project"
      @close="exportOpen = false"
    />
  </main>
</template>
