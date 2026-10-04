<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { chapterParseResults } from "@/composables/use-novlang-parse";
import { useProjectStore } from "@/stores/project";
import { useSafeI18n } from "@/composables/use-safe-i18n";
import { previewCss } from "@/assets/epub/preview.css";
import { themeCss } from "@/assets/epub/theme.css";
import { firstNoteNumber, renderPreviewHtml } from "./preview-notes";
import { createResourceUrlCache, rewriteResourcePaths } from "./preview-resources";

const props = defineProps<{ chapterId: string; sourceScroller?: HTMLElement | null }>();
const project = useProjectStore();
const { t } = useSafeI18n();
const frame = ref<HTMLIFrameElement>();
const cache = createResourceUrlCache();
const currentResult = computed(() => chapterParseResults.get(props.chapterId));
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

function styles() {
  return `${themeCss}\nsection.preview-notes { margin-top: 2em; padding-top: 0.75em; border-top: 1px solid #ddd; }\n${previewCss}\nbody { font-family: Georgia, 'Times New Roman', serif; }`;
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

function renderPreview() {
  const document = frame.value?.contentDocument;
  const book = project.book;
  if (!document?.body || !book) return;
  cache.sync(book.resources);
  const style = document.head?.querySelector<HTMLStyleElement>("style[data-preview]");
  if (style)
    style.textContent = rewriteResourcePaths(
      `${styles()}\n${book.customCss ?? ""}`,
      book.resources,
      cache.resolve,
    );
  const html = previewHtml();
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
  renderPreview();
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
  boundSourceScroller?.removeEventListener("scroll", syncScroll);
  cache.releaseAll();
});
</script>

<template>
  <div class="preview-pane">
    <!-- The preview is a page of the book: the EPUB styles assume a light page,
         so it stays paper-white under the dark theme instead of showing the
         window through a transparent frame. -->
    <iframe
      class="bg-white"
      ref="frame"
      :srcdoc="initialPreviewDocument"
      sandbox="allow-same-origin"
      :title="t('toolbar.preview', 'Preview')"
    />
  </div>
</template>
