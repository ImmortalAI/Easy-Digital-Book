<script setup lang="ts">
import { computed, ref } from "vue";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import type { EditorState, Transaction } from "@codemirror/state";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconDots,
  IconH1,
  IconItalic,
  IconPhoto,
  IconSearch,
  IconSeparatorHorizontal,
  IconSuperscript,
} from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/components/ui/toolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import ImagePickerPopover from "./ImagePickerPopover.vue";
import {
  activeMarkup,
  chapterEditorTick,
  chapterEditorViews,
  insertFootnote,
  insertImageReference,
  insertSceneBreak,
  toggleBlockquote,
  toggleHeading,
  toggleMarkup,
} from "./editor-commands";

const props = defineProps<{ chapterId: string; disabled: boolean }>();
const emit = defineEmits<{ "insert-image-from-file": [position: number] }>();
const { t } = useSafeI18n();
const pickerOpen = ref(false);

const view = () => chapterEditorViews.get(props.chapterId);
const state = computed(() => {
  void chapterEditorTick.value;
  return view()?.state;
});
const markup = computed(() =>
  state.value ? activeMarkup(state.value) : { bold: false, italic: false },
);

function run(command: (state: EditorState) => Transaction) {
  const editor = view();
  if (!editor || props.disabled) return;
  editor.dispatch(command(editor.state));
  editor.focus();
}
function history(step: typeof undo) {
  const editor = view();
  if (!editor || props.disabled) return;
  step(editor);
  editor.focus();
}
function search() {
  const editor = view();
  if (editor && !props.disabled) openSearchPanel(editor);
}
function fromFile() {
  const editor = view();
  if (editor) emit("insert-image-from-file", editor.state.selection.main.head);
}
// The menu hands focus back to its trigger when it closes; that focus lands
// outside the picker and would dismiss it at once. So the item only records the
// request, and the picker opens once the menu has finished closing.
let pickerRequested = false;
function requestPicker() {
  pickerRequested = true;
}
function onMenuCloseAutoFocus(event: Event) {
  if (!pickerRequested) return;
  pickerRequested = false;
  event.preventDefault();
  pickerOpen.value = true;
}
function fromBook(path: string) {
  pickerOpen.value = false;
  run((s) => insertImageReference(s, path));
}

const primary = computed(() => [
  {
    id: "bold",
    icon: IconBold,
    label: t("format.bold", "Bold"),
    keys: "Mod+B",
    pressed: markup.value.bold,
    action: () => run((s) => toggleMarkup(s, "**")),
  },
  {
    id: "italic",
    icon: IconItalic,
    label: t("format.italic", "Italic"),
    keys: "Mod+I",
    pressed: markup.value.italic,
    action: () => run((s) => toggleMarkup(s, "*")),
  },
  {
    id: "footnote",
    icon: IconSuperscript,
    label: t("format.footnote", "Footnote"),
    keys: "Mod+Alt+F",
    action: () => run(insertFootnote),
  },
]);
const secondary = computed(() => [
  {
    id: "heading",
    icon: IconH1,
    label: t("format.heading", "Chapter heading"),
    action: () => run(toggleHeading),
  },
  {
    id: "quote",
    icon: IconBlockquote,
    label: t("format.quote", "Quote"),
    action: () => run(toggleBlockquote),
  },
  {
    id: "scene",
    icon: IconSeparatorHorizontal,
    label: t("format.sceneBreak", "Scene break"),
    action: () => run(insertSceneBreak),
  },
]);
const historyItems = computed(() => [
  {
    id: "undo",
    icon: IconArrowBackUp,
    label: t("format.undo", "Undo"),
    keys: "Mod+Z",
    enabled: state.value ? undoDepth(state.value) > 0 : false,
    action: () => history(undo),
  },
  {
    id: "redo",
    icon: IconArrowForwardUp,
    label: t("format.redo", "Redo"),
    keys: "Mod+Shift+Z",
    enabled: state.value ? redoDepth(state.value) > 0 : false,
    action: () => history(redo),
  },
  {
    id: "search",
    icon: IconSearch,
    label: t("format.search", "Find in chapter"),
    keys: "Mod+F",
    enabled: true,
    action: search,
  },
]);
</script>

<template>
  <TooltipProvider>
    <!-- One anchor around the whole toolbar: the image button is hidden below
         @2xl, and the picker opened from "More" must still have a visible anchor. -->
    <Popover v-model:open="pickerOpen">
      <PopoverAnchor as-child>
        <div class="shrink-0" data-format-toolbar-anchor>
          <Toolbar :aria-label="t('format.toolbar', 'Formatting')" class="gap-0.5">
            <Tooltip v-for="item in primary" :key="item.id">
              <TooltipTrigger as-child>
                <ToolbarButton as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="item.label"
                    :aria-pressed="item.pressed === undefined ? undefined : item.pressed"
                    :disabled="disabled"
                    :class="{ 'bg-accent': item.pressed }"
                    @click="item.action"
                  >
                    <component :is="item.icon" aria-hidden="true" />
                  </Button>
                </ToolbarButton>
              </TooltipTrigger>
              <TooltipContent
                >{{ item.label }} <Kbd>{{ item.keys }}</Kbd></TooltipContent
              >
            </Tooltip>

            <div class="hidden items-center gap-0.5 @2xl:flex">
              <ToolbarSeparator class="mx-1 h-5" />
              <Tooltip v-for="item in secondary" :key="item.id">
                <TooltipTrigger as-child>
                  <ToolbarButton as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="item.label"
                      :disabled="disabled"
                      @click="item.action"
                    >
                      <component :is="item.icon" aria-hidden="true" />
                    </Button>
                  </ToolbarButton>
                </TooltipTrigger>
                <TooltipContent>{{ item.label }}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <ToolbarButton as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="t('format.image', 'Insert image')"
                      :disabled="disabled"
                    >
                      <IconPhoto aria-hidden="true" />
                    </Button>
                  </ToolbarButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent @close-auto-focus="onMenuCloseAutoFocus">
                  <DropdownMenuItem @select="fromFile">{{
                    t("format.imageFromFile", "From file…")
                  }}</DropdownMenuItem>
                  <DropdownMenuItem @select="requestPicker">{{
                    t("format.imageFromBook", "From the book…")
                  }}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ToolbarSeparator class="mx-1 h-5" />
              <Tooltip v-for="item in historyItems" :key="item.id">
                <TooltipTrigger as-child>
                  <ToolbarButton as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="item.label"
                      :disabled="disabled || !item.enabled"
                      @click="item.action"
                    >
                      <component :is="item.icon" aria-hidden="true" />
                    </Button>
                  </ToolbarButton>
                </TooltipTrigger>
                <TooltipContent
                  >{{ item.label }} <Kbd>{{ item.keys }}</Kbd></TooltipContent
                >
              </Tooltip>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <ToolbarButton as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="@2xl:hidden"
                    :aria-label="t('format.more', 'More formatting')"
                    :disabled="disabled"
                  >
                    <IconDots aria-hidden="true" />
                  </Button>
                </ToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" @close-auto-focus="onMenuCloseAutoFocus">
                <DropdownMenuItem v-for="item in secondary" :key="item.id" @select="item.action">
                  <component :is="item.icon" aria-hidden="true" />{{ item.label }}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    ><IconPhoto aria-hidden="true" />{{
                      t("format.image", "Insert image")
                    }}</DropdownMenuSubTrigger
                  >
                  <DropdownMenuSubContent>
                    <DropdownMenuItem @select="fromFile">{{
                      t("format.imageFromFile", "From file…")
                    }}</DropdownMenuItem>
                    <DropdownMenuItem @select="requestPicker">{{
                      t("format.imageFromBook", "From the book…")
                    }}</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  v-for="item in historyItems"
                  :key="item.id"
                  :disabled="!item.enabled"
                  @select="item.action"
                >
                  <component :is="item.icon" aria-hidden="true" />{{ item.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Toolbar>
        </div>
      </PopoverAnchor>
      <PopoverContent class="w-auto p-2">
        <ImagePickerPopover @pick="fromBook" />
      </PopoverContent>
    </Popover>
  </TooltipProvider>
</template>
