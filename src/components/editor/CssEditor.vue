<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { cssEditingExtensions } from "@/components/editor/css-language";
import { customCssTemplate } from "@/assets/epub/custom.css";
import { useProjectStore } from "@/stores/project";
import { setCustomCss } from "@/services/book/metadata";
import { preserveOpenShortcutKeymap } from "@/components/editor/editor-commands";
import { editorColorScheme, editorColorTheme } from "@/components/editor/editor-theme";
import { useResolvedTheme } from "@/composables/use-theme";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { chapterSearch, searchPanelLabels } from "@/components/editor/chapter-search-panel";
const project = useProjectStore();
const host = ref<HTMLElement>();
let view: EditorView | undefined;
// Matches SourceEditor: a definite height makes .cm-scroller the scroll container
// so the editor fills its pane instead of growing past it.
const editorTheme = EditorView.theme({ "&": { height: "100%" } });
const resolvedTheme = useResolvedTheme();
const { t } = useSafeI18n();
const contentLabel = computed(() => t("editor.cssLabel", "Custom CSS"));
// The colour scheme and the label follow the app's theme and locale live.
const liveSettings = new Compartment();
function liveExtensions() {
  return [
    editorColorScheme(resolvedTheme.value),
    EditorView.contentAttributes.of({ "aria-label": contentLabel.value }),
  ];
}
function value() {
  return project.book?.customCss ?? customCssTemplate;
}
function mount() {
  if (!host.value) return;
  view = new EditorView({
    state: EditorState.create({
      doc: value(),
      extensions: [
        lineNumbers(),
        history(),
        ...cssEditingExtensions(),
        chapterSearch(() => searchPanelLabels(t)),
        editorTheme,
        editorColorTheme,
        liveSettings.of(liveExtensions()),
        keymap.of([...preserveOpenShortcutKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || !project.book) return;
          project.applyMutation(setCustomCss(project.book, update.state.doc.toString()));
        }),
      ],
    }),
    parent: host.value,
  });
}
onMounted(mount);
watch(
  () => project.bookGeneration,
  () => {
    view?.destroy();
    view = undefined;
    mount();
  },
);
watch([resolvedTheme, contentLabel], () => {
  view?.dispatch({ effects: liveSettings.reconfigure(liveExtensions()) });
});
onBeforeUnmount(() => {
  view?.destroy();
});
</script>
<template>
  <div ref="host" class="min-h-0 flex-1 overflow-hidden">
    <!-- A host for CodeMirror. Scrolling belongs to .cm-scroller inside, so
         this only needs to be a bounded box for it to fill. -->
  </div>
</template>
