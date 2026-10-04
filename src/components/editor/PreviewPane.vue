<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { IconBrightnessDown, IconPalette } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings";
import { useResolvedTheme } from "@/composables/use-theme";
import { chapterParseResults } from "@/composables/use-novlang-parse";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { previewCss } from "@/assets/epub/preview.css";
import { themeCss } from "@/assets/epub/theme.css";
import { firstNoteNumber, renderPreviewHtml } from "./preview-notes";
import { createResourceUrlCache, rewriteResourcePaths } from "./preview-resources";
import { paperBackground, previewLookCss, readAppTokens } from "./preview-theme";

const props = defineProps<{ chapterId: string; sourceScroller?: HTMLElement | null }>();
const project = useProjectStore();
const { t } = useSafeI18n();
const frame = ref<HTMLIFrameElement>();
const cache = createResourceUrlCache();
const currentResult = computed(() => chapterParseResults.get(props.chapterId));
const settings = useSettingsStore();
const resolvedTheme = useResolvedTheme();
const dark = computed(() => resolvedTheme.value === "dark");
const paper = computed(() => dark.value && settings.preview.paperStyle);
const tokens = shallowRef(readAppTokens());
// useTheme toggles `.dark` on <html> in its own effect; read the tokens after it.
watch(resolvedTheme, async () => {
  await nextTick();
  tokens.value = readAppTokens();
});
const frameStyle = computed(() =>
  paper.value ? { background: paperBackground(tokens.value) } : undefined,
);
function togglePaper() {
  void settings.setPreview({ paperStyle: !settings.preview.paperStyle });
}
function toggleDim() {
  void settings.setPreview({ dimImages: !settings.preview.dimImages });
}
let boundSourceScroller: HTMLElement | null = null;
let boundDocument: Document | null = null;

function previewHtml() {
  if (!currentResult.value) return "";
  const ids = project.book?.chapters.map((chapter) => chapter.id) ?? [];
  return renderPreviewHtml(
    currentResult.value.document,
    firstNoteNumber(ids, props.chapterId, chapterParseResults),
  );
}

// Order matters: the paper layer sits before custom.css (appended by the
// callers), so the author's rules still win and the preview shows them.
function styles() {
  const look = paper.value
    ? previewLookCss({ dimImages: settings.preview.dimImages, tokens: tokens.value })
    : "";
  return `${themeCss}\nsection.preview-notes { margin-top: 2em; padding-top: 0.75em; border-top: 1px solid #ddd; }\n${previewCss}\nbody { font-family: Georgia, 'Times New Roman', serif; }\n${look}`;
}

function documentMarkup(html: string, css: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'"><style data-preview>${css}</style></head><body>${html}</body></html>`;
}

function initialDocument() {
  const book = project.book;
  if (!book) return documentMarkup("", styles());
  cache.sync(book.resources);
  const css = rewriteResourcePaths(
    `${styles()}\n${book.customCss ?? ""}`,
    book.resources,
    cache.resolve,
  );
  const html = previewHtml();
  return documentMarkup(rewriteResourcePaths(html, book.resources, cache.resolve), css);
}

const initialPreviewDocument = initialDocument();

// The frame's document once its srcdoc has loaded. A browser loads srcdoc
// asynchronously, so until then the frame holds an empty about:blank.
const loadedDocument = shallowRef<Document | null>(null);

// Runs inside watchEffect. Every reactive input (the look, custom.css, the
// chapter) is read before any DOM check: an early return would leave the
// effect subscribed to nothing, and the toggles and custom.css edits would
// stop updating the preview until the chapter text changed.
function renderPreview() {
  const book = project.book;
  const css = book ? `${styles()}\n${book.customCss ?? ""}` : "";
  const html = previewHtml();
  const document = loadedDocument.value;
  if (!document?.body || !book) return;
  cache.sync(book.resources);
  const style = document.head?.querySelector<HTMLStyleElement>("style[data-preview]");
  if (style) style.textContent = rewriteResourcePaths(css, book.resources, cache.resolve);
  document.body.innerHTML = rewriteResourcePaths(html, book.resources, cache.resolve);
}

// In a srcdoc frame `#fn-1` resolves against the parent's URL, so following a
// note link would navigate the frame away from the preview document. In-page
// links scroll to their target instead.
function followInPageLink(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest?.("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  const id = decodeURIComponent(link.getAttribute("href")!.slice(1));
  boundDocument?.getElementById(id)?.scrollIntoView();
}

function bindDocument() {
  const document = frame.value?.contentDocument ?? null;
  if (document === boundDocument) return;
  boundDocument?.removeEventListener("click", followInPageLink);
  boundDocument = document;
  boundDocument?.addEventListener("click", followInPageLink);
}

function onFrameLoad() {
  bindDocument();
  // Setting the ref re-runs the render effect, now with the loaded document.
  loadedDocument.value = frame.value?.contentDocument ?? null;
}

function syncScroll() {
  const preview = frame.value?.contentDocument?.documentElement;
  if (!boundSourceScroller || !preview) return;
  const sourceMax = boundSourceScroller.scrollHeight - boundSourceScroller.clientHeight;
  const previewMax = preview.scrollHeight - preview.clientHeight;
  if (sourceMax > 0 && previewMax > 0)
    preview.scrollTop = (boundSourceScroller.scrollTop / sourceMax) * previewMax;
}

function bindSourceScroller(next: HTMLElement | null | undefined) {
  boundSourceScroller?.removeEventListener("scroll", syncScroll);
  boundSourceScroller = next ?? null;
  boundSourceScroller?.addEventListener("scroll", syncScroll, { passive: true });
}

watchEffect(renderPreview);
watchEffect(() => bindSourceScroller(props.sourceScroller));

onMounted(() => {
  frame.value?.addEventListener("load", onFrameLoad);
  onFrameLoad();
});

onBeforeUnmount(() => {
  frame.value?.removeEventListener("load", onFrameLoad);
  boundDocument?.removeEventListener("click", followInPageLink);
  boundDocument = null;
  loadedDocument.value = null;
  boundSourceScroller?.removeEventListener("scroll", syncScroll);
  cache.releaseAll();
});
</script>

<template>
  <div class="preview-pane relative">
    <!-- Under the light theme the preview is the book's own look, so the
         toggles only exist under the dark theme. -->
    <div
      v-if="dark"
      class="absolute top-2 right-3 z-10 flex gap-1 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100"
      data-preview-look
    >
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-pressed="settings.preview.paperStyle"
        :aria-label="t('preview.paperStyle', 'Paper style')"
        :title="t('preview.paperStyleHint', 'Paper style (Mod+Alt+P). Off shows the original look')"
        @click="togglePaper"
      >
        <IconPalette aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="!settings.preview.paperStyle"
        :aria-pressed="settings.preview.dimImages"
        :aria-label="t('preview.dimImages', 'Dim images')"
        :title="t('preview.dimImages', 'Dim images')"
        @click="toggleDim"
      >
        <IconBrightnessDown aria-hidden="true" />
      </Button>
    </div>
    <!-- Paper-white under the light theme; the paper colour under the dark
         one, set on the element too so no white flashes before the frame loads. -->
    <iframe
      :class="paper ? undefined : 'bg-white'"
      :style="frameStyle"
      ref="frame"
      :srcdoc="initialPreviewDocument"
      sandbox="allow-same-origin"
      :title="t('toolbar.preview', 'Preview')"
    />
  </div>
</template>
