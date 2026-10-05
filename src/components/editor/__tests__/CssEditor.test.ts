import { forEachDiagnostic, diagnosticCount } from "@codemirror/lint";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { effectScope, nextTick } from "vue";
import { useCssSupport } from "@/composables/use-css-support";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import CssEditor from "@/components/editor/CssEditor.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { useSettingsStore } from "@/stores/settings";

function book(id: string, css: string | null = null) {
  return {
    ...createBook({
      locale: "en",
      now: new Date("2026-01-01"),
      newUuid: () => `550e8400-e29b-41d4-a716-44665544000${id}`,
      newChapterId: () => "chapter1",
    }),
    customCss: css,
  };
}

afterEach(() => vi.useRealTimers());

describe("CssEditor lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });

  it("mutates the active project synchronously and never writes a later project", async () => {
    const project = useProjectStore();
    project.setBook(book("1"));
    const wrapper = mount(CssEditor);
    const editor = wrapper.get(".cm-editor");
    const view = CodeMirrorView.findFromDOM(editor.element as HTMLElement);
    expect(view).toBeDefined();
    view!.dispatch({ changes: { from: 0, insert: "h1 {}" } });
    expect(project.book?.customCss).toContain("h1 {}");

    project.setBook(book("2"));
    vi.advanceTimersByTime(200);
    expect(project.book?.metadata.id).toContain("2");
    expect(project.book?.customCss).toBeNull();
    wrapper.unmount();
  });

  it("names its text box in the interface language and follows the app theme", async () => {
    useProjectStore().setBook(book("1"));
    const settings = useSettingsStore();
    settings.theme = "light";
    const i18n = createI18nPlugin("ru");
    const wrapper = mount(CssEditor, { attachTo: document.body, global: { plugins: [i18n] } });
    const content = () => wrapper.get(".cm-content");
    const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(content().attributes("aria-label")).toBe("Пользовательский CSS");
    expect(view.state.facet(CodeMirrorView.darkTheme)).toBe(false);

    i18n.global.locale.value = "en";
    settings.theme = "dark";
    await wrapper.vm.$nextTick();
    expect(content().attributes("aria-label")).toBe("Custom CSS");
    expect(view.state.facet(CodeMirrorView.darkTheme)).toBe(true);
    wrapper.unmount();
  });
});

describe("CssEditor diagnostics", () => {
  it("displays and clears diagnostics and updates translated messages", async () => {
    setActivePinia(createPinia());
    const project = useProjectStore();
    project.setBook(book("1", "p { mystery:x; color:red; }"));
    const diagnostics = useDiagnosticsStore();
    diagnostics.setCssFindings([
      {
        from: 4,
        to: 11,
        severity: "warning",
        code: "unknownProperty",
        params: { property: "mystery" },
      },
      { from: 15, to: 20, severity: "info", code: "property", params: { property: "color" } },
    ]);
    const i18n = createI18nPlugin("en");
    const wrapper = mount(CssEditor, { attachTo: document.body, global: { plugins: [i18n] } });
    const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    expect(diagnosticCount(view.state)).toBe(2);
    expect(wrapper.find(".cm-lintRange-warning").exists()).toBe(true);
    expect(wrapper.find(".cm-lintRange-info").exists()).toBe(true);
    expect(getComputedStyle(wrapper.get(".cm-lintRange-info").element).textDecorationStyle).toBe(
      "dotted",
    );
    const messages = () => {
      const result: string[] = [];
      forEachDiagnostic(view.state, (d) => result.push(d.message));
      return result;
    };
    expect(messages()[0]).toContain("Kindle support table");
    i18n.global.locale.value = "ru";
    await wrapper.vm.$nextTick();
    expect(messages()[0]).toContain("таблице поддержки Kindle");
    expect(project.revision).toBe(0);
    diagnostics.clearCss();
    await wrapper.vm.$nextTick();
    expect(diagnosticCount(view.state)).toBe(0);
    wrapper.unmount();
  });
  it("focuses a range clamped to the current document", () => {
    setActivePinia(createPinia());
    useProjectStore().setBook(book("1", "p {}"));
    const wrapper = mount(CssEditor, { attachTo: document.body });
    const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
    (wrapper.vm as unknown as { focusRange(range: { from: number; to: number }): void }).focusRange(
      { from: 999, to: 1000 },
    );
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(4);
    expect(view.hasFocus).toBe(true);
    wrapper.unmount();
  });
});

it("updates lint after CSS edits and clears it when the rule is removed", async () => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  const project = useProjectStore();
  project.setBook(book("1", ""));
  const scope = effectScope();
  scope.run(useCssSupport);
  const wrapper = mount(CssEditor);
  const view = CodeMirrorView.findFromDOM(wrapper.get(".cm-editor").element as HTMLElement)!;
  view.dispatch({ changes: { from: 0, insert: "p{mystery:x}" } });
  await nextTick();
  await vi.advanceTimersByTimeAsync(150);
  await nextTick();
  expect(diagnosticCount(view.state)).toBe(1);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
  await nextTick();
  expect(diagnosticCount(view.state)).toBe(0);
  expect(project.book?.customCss).toBe("");
  wrapper.unmount();
  scope.stop();
});
