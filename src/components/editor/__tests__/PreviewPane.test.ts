import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { chapterParseResults, resetChapterParseResults } from "@/composables/use-novlang-parse";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import PreviewPane from "@/components/editor/PreviewPane.vue";

function fakeFrame(iframe: HTMLIFrameElement) {
  const style = { textContent: "" };
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    value: {
      body: { innerHTML: "" },
      head: { querySelector: () => style },
      documentElement: { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  iframe.dispatchEvent(new Event("load"));
  return style;
}

describe("PreviewPane security and rendering", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetChapterParseResults();
    useProjectStore().setBook(
      createBook({
        locale: "en",
        now: new Date("2026-01-01"),
        newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
        newChapterId: () => "chapter1",
      }),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates one sandboxed iframe with a restrictive CSP", async () => {
    chapterParseResults.set("chapter1", {
      document: {
        type: "document",
        children: [{ type: "paragraph", children: [{ type: "text", value: "Hello" }] }],
      },
      diagnostics: [],
    });
    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    await wrapper.vm.$nextTick();
    const iframe = wrapper.get("iframe");

    expect(wrapper.findAll("iframe")).toHaveLength(1);
    expect(iframe.attributes("sandbox")).toBe("allow-same-origin");
    expect(iframe.attributes("srcdoc")).toContain("default-src 'none'");
    expect(iframe.attributes("srcdoc")).toContain("img-src blob:");
    expect(iframe.attributes("srcdoc")).toContain("style-src 'unsafe-inline'");
    wrapper.unmount();
  });

  it("keeps the text off the pane edges", async () => {
    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("iframe").attributes("srcdoc")).toContain(
      "body { max-width: 36em; margin: 0 auto; padding: 1.5em 1.5em 4em; }",
    );
    wrapper.unmount();
  });

  it("paints the paper look under the dark theme and switches it off in place", async () => {
    useSettingsStore().theme = "dark";
    const wrapper = mount(PreviewPane, {
      props: { chapterId: "chapter1" },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("iframe").attributes("srcdoc")).toContain("--paper-bg");
    const style = fakeFrame(wrapper.get("iframe").element as HTMLIFrameElement);

    await wrapper.get('button[aria-label="Paper style"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(style.textContent).not.toContain("--paper-bg");
    expect(wrapper.findAll("iframe")).toHaveLength(1);
    expect(wrapper.get('button[aria-label="Dim images"]').attributes()).toHaveProperty("disabled");
    wrapper.unmount();
  });

  it("puts the user's custom.css after the paper layer", () => {
    useSettingsStore().theme = "dark";
    useProjectStore().book!.customCss = "body { color: #000; }";
    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    const srcdoc = wrapper.get("iframe").attributes("srcdoc")!;
    expect(srcdoc.indexOf("--paper-bg")).toBeGreaterThan(-1);
    expect(srcdoc.indexOf("--paper-bg")).toBeLessThan(srcdoc.indexOf("body { color: #000; }"));
    wrapper.unmount();
  });

  it("shows neither the paper look nor its toggles under the light theme", () => {
    useSettingsStore().theme = "light";
    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    expect(wrapper.get("iframe").attributes("srcdoc")).not.toContain("--paper-bg");
    expect(wrapper.find('button[aria-label="Paper style"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("uses the shared parse result and rewrites image URLs", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover");
    const book = useProjectStore().book!;
    book.customCss = '.cover { background: url("images/cover.png"); }';
    book.resources.set("images/cover.png", {
      mediaType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });
    chapterParseResults.set("chapter1", {
      document: {
        type: "document",
        children: [
          {
            type: "paragraph",
            children: [{ type: "image", alt: "cover", src: "images/cover.png" }],
          },
        ],
      },
      diagnostics: [],
    });

    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    await wrapper.vm.$nextTick();

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(wrapper.get("iframe").attributes("srcdoc")).toContain("body { max-width: 36em");
    expect(wrapper.get("iframe").attributes("srcdoc")).not.toContain(
      "https://fonts.googleapis.com",
    );
    wrapper.unmount();
  });

  it("updates the retained iframe body after load and revokes its blob on unmount", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const book = useProjectStore().book!;
    book.resources.set("images/cover.png", {
      mediaType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });
    chapterParseResults.set("chapter1", {
      document: {
        type: "document",
        children: [
          {
            type: "paragraph",
            children: [{ type: "image", alt: "cover", src: "images/cover.png" }],
          },
        ],
      },
      diagnostics: [],
    });
    const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
    const iframe = wrapper.get("iframe").element;
    const body = { innerHTML: "" };
    const style = { textContent: "" };
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: {
        body,
        head: { querySelector: () => style },
        documentElement: { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 },
        addEventListener() {},
        removeEventListener() {},
      },
    });

    const initialSrcdoc = iframe.getAttribute("srcdoc");
    iframe.dispatchEvent(new Event("load"));
    await wrapper.vm.$nextTick();
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(body.innerHTML).toContain("blob:cover");

    chapterParseResults.set("chapter1", {
      document: {
        type: "document",
        children: [{ type: "paragraph", children: [{ type: "text", value: "Updated" }] }],
      },
      diagnostics: [],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("iframe").element).toBe(iframe);
    expect(body.innerHTML).toContain("Updated");
    expect(iframe.getAttribute("srcdoc")).toBe(initialSrcdoc);

    wrapper.unmount();
    expect(revokeUrl).toHaveBeenCalledWith("blob:cover");
  });
});
