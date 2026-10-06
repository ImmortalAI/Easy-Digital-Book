<script setup lang="ts">
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { setDiagnostics } from "@codemirror/lint";
import { syntaxHighlighting } from "@codemirror/language";
import { keymap, EditorView } from "@codemirror/view";
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import {
  chapterEditorStates,
  chapterEditorTick,
  createChapterEditor,
  insertFootnote,
  preserveOpenShortcutKeymap,
  reconfigureChapterEditor,
  resetChapterEditors,
  registerChapterEditorView,
  unregisterChapterEditorView,
  toggleMarkup,
} from "./editor-commands";
import { diagnosticRange, novlangHighlightStyle, novlangLanguage } from "./novlang-language";
import { editorColorScheme, editorColorTheme } from "./editor-theme";
import { useResolvedTheme } from "@/composables/use-theme";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { chapterSearch, searchPanelLabels } from "@/components/editor/chapter-search-panel";
import { chapterParseResults, useNovlangParse } from "@/composables/use-novlang-parse";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";
import { misspellingAt, setMisspellings, spellingExtensions } from "./spelling-decorations";
import type { Misspelling } from "@/types/spelling";
import SpellingMenu from "@/components/spelling/SpellingMenu.vue";
import { useSpellingActions } from "@/composables/use-spelling-actions";
import {
  captureImageImportIdentity,
  isImageImportIdentityCurrent,
  type ImageFile,
  type ImageImportIdentity,
} from "@/composables/use-image-import";

interface FocusPosition {
  line: number;
  column: number;
}
const props = defineProps<{
  chapterId: string;
  focusPosition?: FocusPosition | null;
  focusRequest?: number;
  importImage?: (file: ImageFile, position: number, identity: ImageImportIdentity) => Promise<void>;
}>();
const host = ref<HTMLElement>();
const project = useProjectStore();
const spelling = useSpellingStore();
const parser = useNovlangParse(toRef(props, "chapterId"));
const resolvedTheme = useResolvedTheme();
const { t } = useSafeI18n();
const contentLabel = computed(() => t("editor.sourceLabel", "Chapter text"));
let view: EditorView | undefined;
const spellingActions = useSpellingActions();
const spellingMenu = ref<{
  item: Misspelling;
  anchor: { left: number; top: number; height: number };
} | null>(null);
function openSpellingMenu(editor: EditorView, pos: number): boolean {
  const item = misspellingAt(editor.state, pos);
  if (!item) return false;
  const rect = editor.coordsAtPos(item.from);
  spellingMenu.value = {
    item,
    anchor: rect
      ? { left: rect.left, top: rect.top, height: rect.bottom - rect.top }
      : { left: 0, top: 0, height: 0 },
  };
  return true;
}
function replaceMisspelling(suggestion: string) {
  const current = spellingMenu.value?.item;
  spellingMenu.value = null;
  if (!view || !current || view.state.sliceDoc(current.from, current.to) !== current.word) return;
  view.dispatch({
    changes: { from: current.from, to: current.to, insert: suggestion },
    selection: { anchor: current.from + suggestion.length },
    userEvent: "input.spelling",
  });
  view.focus();
}
function closeSpellingMenu(action?: "ignore" | "add") {
  const word = spellingMenu.value?.item.word;
  spellingMenu.value = null;
  if (word && action === "ignore") spellingActions.ignore(word);
  if (word && action === "add") spellingActions.addToDictionary(word);
  view?.focus();
}
// props.chapterId has already advanced by the time the watcher runs, so the id
// the current view was registered under has to be remembered separately.
let mountedChapterId = "";

// A definite height makes .cm-scroller the scroll container, which is what the
// preview scroll sync binds to and what lets CodeMirror virtualise long chapters.
const editorTheme = EditorView.theme({
  "&": { height: "100%", fontFamily: "system-ui, sans-serif", fontSize: "1rem" },
  ".cm-content": {
    fontFamily: "inherit",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    padding: "1rem",
  },
  ".cm-line": { padding: "0" },
});

function editorExtensions(chapterId: string) {
  const language = project.book?.metadata.language ?? "en";
  return [
    novlangLanguage,
    syntaxHighlighting(novlangHighlightStyle),
    ...spellingExtensions,
    editorTheme,
    editorColorTheme,
    editorColorScheme(resolvedTheme.value),
    EditorView.lineWrapping,
    chapterSearch(() => searchPanelLabels(t)),
    EditorView.contentAttributes.of({
      spellcheck: "false",
      lang: language,
      "aria-label": contentLabel.value,
    }),
    keymap.of([
      {
        key: "Mod-b",
        run: (editor: EditorView) => (editor.dispatch(toggleMarkup(editor.state, "**")), true),
      },
      {
        key: "Mod-i",
        run: (editor: EditorView) => (editor.dispatch(toggleMarkup(editor.state, "*")), true),
      },
      {
        key: "Mod-Alt-f",
        run: (editor: EditorView) => (editor.dispatch(insertFootnote(editor.state)), true),
      },
      {
        key: "Mod-.",
        run: (editor: EditorView) => openSpellingMenu(editor, editor.state.selection.main.head),
      },
      { key: "Mod-f", run: openSearchPanel },
      ...searchKeymap,
      ...preserveOpenShortcutKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) chapterEditorTick.value++;
      if (!update.docChanged) return;
      chapterEditorStates.set(chapterId, update.state);
      parser.updateSource(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      contextmenu: (event, editor) => {
        if (!(event.target instanceof Element && event.target.closest(".cm-misspelled")))
          return false;
        const pos =
          editor.posAtCoords({ x: event.clientX, y: event.clientY }) ??
          (event.target instanceof Node ? editor.posAtDOM(event.target) : null);
        if (pos === null || !openSpellingMenu(editor, pos)) return false;
        event.preventDefault();
        return true;
      },
      paste: (event, editor) => {
        const file = [...(event.clipboardData?.files ?? [])].find((item) =>
          item.type.startsWith("image/"),
        );
        if (!file || !props.importImage) return false;
        const identity = captureImageImportIdentity(project);
        if (!identity) return false;
        event.preventDefault();
        void file.arrayBuffer().then((bytes) => {
          if (!isImageImportIdentityCurrent(project, identity)) return;
          return props.importImage?.(
            { name: file.name || "pasted.png", bytes: new Uint8Array(bytes), type: file.type },
            editor.state.selection.main.head,
            identity,
          );
        });
        return true;
      },
      drop: (event, editor) => {
        const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
          item.type.startsWith("image/"),
        );
        if (!file || !props.importImage) return false;
        const identity = captureImageImportIdentity(project);
        if (!identity) return false;
        event.preventDefault();
        const position =
          editor.posAtCoords({ x: event.clientX, y: event.clientY }) ??
          editor.state.selection.main.head;
        void file.arrayBuffer().then((bytes) => {
          if (!isImageImportIdentityCurrent(project, identity)) return;
          return props.importImage?.(
            { name: file.name || "dropped.png", bytes: new Uint8Array(bytes), type: file.type },
            position,
            identity,
          );
        });
        return true;
      },
    }),
  ];
}

function updateDiagnostics() {
  if (!view) return;
  const parsed = chapterParseResults.get(props.chapterId);
  if (!parsed) return;
  const source = view.state.doc.toString();
  const items = parsed.diagnostics
    .filter((item) => item.position)
    .map((item) => {
      const range = diagnosticRange(source, item.position!);
      return {
        ...range,
        severity: item.severity,
        message: item.message,
        source: "NovLang",
      };
    });
  view.dispatch(setDiagnostics(view.state, items));
}

function updateMisspellings() {
  if (!view) return;
  const entry = spelling.visible.get(props.chapterId);
  // Offsets belong to the text that was checked; a newer text waits for its own result
  // and meanwhile keeps the mapped underlines from misspellingField.
  if (entry && entry.source !== view.state.doc.toString()) return;
  view.dispatch({ effects: setMisspellings.of(entry?.items ?? []) });
}

function mountEditor(chapterId: string) {
  const chapter = project.book?.chapters.find((item) => item.id === chapterId);
  if (!chapter || !host.value) return;
  const state = createChapterEditor(chapterId, chapter.source, editorExtensions(chapterId));
  view = new EditorView({ state, parent: host.value });
  mountedChapterId = chapterId;
  registerChapterEditorView(chapterId, view);
  const effect = reconfigureChapterEditor(chapterId, editorExtensions(chapterId));
  if (effect) view.dispatch({ effects: effect });
  updateDiagnostics();
  updateMisspellings();
}

function disposeEditor() {
  if (view) unregisterChapterEditorView(mountedChapterId, view);
  view?.destroy();
  view = undefined;
  mountedChapterId = "";
}

function remountEditor(chapterId: string) {
  spellingMenu.value = null;
  disposeEditor();
  mountEditor(chapterId);
}

function focusAtPosition(position: FocusPosition | null | undefined) {
  if (!view || !position) return;
  const source = view.state.doc.toString();
  const range = diagnosticRange(source, position);
  view.dispatch({ selection: { anchor: range.from, head: range.to } });
  view.focus();
}
function focusRange(range: { from: number; to: number } | null | undefined) {
  if (!view || !range) return;
  const from = Math.max(0, Math.min(range.from, view.state.doc.length));
  const to = Math.max(from, Math.min(range.to, view.state.doc.length));
  view.dispatch({ selection: { anchor: from, head: to } });
  view.focus();
}

onMounted(() => mountEditor(props.chapterId));

watch(() => props.chapterId, remountEditor);

watch(
  () => project.bookGeneration,
  () => {
    resetChapterEditors();
    remountEditor(props.chapterId);
  },
);

watch(() => [props.chapterId, chapterParseResults.get(props.chapterId)], updateDiagnostics);
watch(() => [props.chapterId, spelling.visible.get(props.chapterId)], updateMisspellings);

watch(
  () => props.focusRequest,
  () => focusAtPosition(props.focusPosition),
  { flush: "post" },
);

watch(
  () => [project.book?.metadata.language, resolvedTheme.value, contentLabel.value],
  () => {
    if (!view) return;
    const effect = reconfigureChapterEditor(props.chapterId, editorExtensions(props.chapterId));
    if (effect) view.dispatch({ effects: effect });
  },
);

onBeforeUnmount(() => {
  parser.dispose();
  disposeEditor();
});

function syncSource(source: string, cursor: number) {
  if (!view || view.state.doc.toString() === source) {
    view?.dispatch({ selection: { anchor: cursor } });
    return;
  }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: source },
    selection: { anchor: cursor },
  });
}

defineExpose({ focusPosition: focusAtPosition, focusRange, syncSource });
</script>

<template>
  <div ref="host" class="min-h-0 flex-1 overflow-hidden">
    <!-- A host for CodeMirror. Scrolling belongs to .cm-scroller inside, so
         this only needs to be a bounded box for it to fill. -->
  </div>
  <SpellingMenu
    v-if="spellingMenu"
    :open="true"
    :word="spellingMenu.item.word"
    :lang="spellingMenu.item.lang"
    :anchor="spellingMenu.anchor"
    @update:open="(open) => !open && closeSpellingMenu()"
    @replace="replaceMisspelling"
    @ignore="closeSpellingMenu('ignore')"
    @add="closeSpellingMenu('add')"
  />
</template>
