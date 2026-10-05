import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCssSupport } from "../use-css-support";
import { useDiagnosticsStore } from "@/stores/diagnostics";
import { useProjectStore } from "@/stores/project";
import { createBook } from "@/services/book/create";
const book = (css: string | null) => ({
  ...createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  }),
  customCss: css,
});
describe("book CSS lifecycle", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  it("checks immediately without editor and debounces subsequent edits without revisions", async () => {
    const project = useProjectStore();
    project.setBook(book("p{mystery:x}"));
    const scope = effectScope();
    scope.run(useCssSupport);
    const diagnostics = useDiagnosticsStore();
    expect(diagnostics.css[0]?.code).toBe("unknownProperty");
    expect(diagnostics.count).toBe(1);
    project.book!.customCss = "p{color:red}";
    await nextTick();
    expect(diagnostics.css).toEqual([]);
    await vi.advanceTimersByTimeAsync(149);
    expect(diagnostics.css).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(diagnostics.css[0]?.severity).toBe("info");
    expect(project.revision).toBe(0);
    scope.stop();
  });
  it("cancels a pending edit on book replacement even with the same UUID", async () => {
    const project = useProjectStore();
    project.setBook(book("p{color:red}"));
    const scope = effectScope();
    scope.run(useCssSupport);
    project.book!.customCss = "p{mystery:x}";
    await nextTick();
    project.setBook(book(null));
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    expect(useDiagnosticsStore().css).toEqual([]);
    scope.stop();
  });
  it("clears empty/deleted CSS, cancels on dispose, and store clear resets CSS", async () => {
    const project = useProjectStore();
    project.setBook(book("p{mystery:x}"));
    const scope = effectScope();
    scope.run(useCssSupport);
    const diagnostics = useDiagnosticsStore();
    diagnostics.setBookWarnings([{ code: "book.cover", message: "cover" }]);
    expect(diagnostics.count).toBe(2);
    project.book!.customCss = "";
    await nextTick();
    await vi.advanceTimersByTimeAsync(150);
    expect(diagnostics.css).toEqual([]);
    project.book!.customCss = "p{mystery:x}";
    await nextTick();
    scope.stop();
    await vi.advanceTimersByTimeAsync(150);
    expect(diagnostics.css).toEqual([]);
    diagnostics.setCssFindings([{ from: 0, to: 1, code: "syntax", severity: "info", params: {} }]);
    diagnostics.clear();
    expect(diagnostics.count).toBe(0);
  });
});
