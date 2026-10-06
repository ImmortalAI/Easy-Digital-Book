import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { AppWarning, Diagnostic } from "@/types/diagnostics";
import type { CssFinding } from "@/services/css-support/types";
export const useDiagnosticsStore = defineStore("diagnostics", () => {
  const parse = ref(new Map<string, Diagnostic[]>()),
    book = ref<AppWarning[]>([]),
    read = ref<AppWarning[]>([]),
    css = ref<CssFinding[]>([]);
  const all = computed(() => [
    ...book.value,
    ...read.value,
    ...css.value,
    ...[...parse.value.entries()].flatMap(([chapterId, items]) =>
      items.map((item) => ({ ...item, chapterId })),
    ),
  ]);
  const count = computed(() => all.value.length);
  function setChapterDiagnostics(id: string, diagnostics: Diagnostic[]) {
    const next = new Map(parse.value);
    next.set(id, diagnostics);
    parse.value = next;
  }
  function clearChapter(id: string) {
    const next = new Map(parse.value);
    next.delete(id);
    parse.value = next;
  }
  function clearParse() {
    parse.value = new Map();
  }
  function setBookWarnings(value: AppWarning[]) {
    book.value = value;
  }
  function setReadWarnings(value: AppWarning[]) {
    read.value = value;
  }
  function setCssFindings(value: CssFinding[]) {
    css.value = value;
  }
  function clearCss() {
    css.value = [];
  }
  function clear() {
    clearCss();
    parse.value = new Map();
    book.value = [];
    read.value = [];
  }
  return {
    css,
    setCssFindings,
    clearCss,
    parse,
    diagnostics: parse,
    book,
    bookWarnings: book,
    read,
    readWarnings: read,
    all,
    count,
    setChapterDiagnostics,
    clearChapter,
    clearParse,
    setBookWarnings,
    setReadWarnings,
    clear,
  };
});
