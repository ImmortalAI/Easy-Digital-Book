import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import ResizableSplit from "@/components/layout/ResizableSplit.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { useLayoutStore } from "@/stores/layout";

describe("ResizableSplit", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("collapses the preview in text mode instead of unmounting it", async () => {
    const wrapper = mount(ResizableSplit, {
      slots: { preview: '<div data-testid="preview-body" />' },
    });
    useLayoutStore().mode = "text";
    await nextTick();
    // The iframe is built once and owns a blob cache; unmounting it loses both.
    expect(wrapper.find('[data-testid="preview-body"]').exists()).toBe(true);
    expect(wrapper.find('[data-pane="preview"]').attributes("data-state")).toBe("collapsed");
  });

  it("makes the collapsed pane inert so Tab cannot reach its content", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit, {
      slots: {
        source: '<textarea aria-label="source body" />',
        preview: '<button type="button">preview body</button>',
      },
    });
    const source = () => wrapper.get('[data-pane="source"]').element as HTMLElement;
    const preview = () => wrapper.get('[data-pane="preview"]').element as HTMLElement;
    await nextTick();
    expect(source().inert).toBe(false);
    expect(preview().inert).toBe(false);

    layout.mode = "preview";
    await nextTick();
    // A 0-width editor that still takes focus would let typing edit the chapter unseen.
    expect(source().hasAttribute("inert")).toBe(true);
    expect(preview().hasAttribute("inert")).toBe(false);

    layout.mode = "text";
    await nextTick();
    expect(source().hasAttribute("inert")).toBe(false);
    expect(preview().hasAttribute("inert")).toBe(true);
    // Collapsed and inert, but still mounted: the preview iframe must survive.
    expect(wrapper.find("button").exists()).toBe(true);
  });

  it("keeps the split ratio as a ratio when the group reports a layout", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit);
    // The inner group and handle (source/preview) come last; the outer ones hold the sidebar.
    const groups = wrapper.findAllComponents({ name: "SplitterGroup" });
    const handles = wrapper.findAllComponents({ name: "SplitterResizeHandle" });
    const handle = handles[handles.length - 1]!;
    // A user drag on the handle is what makes a reported layout worth storing.
    await handle.vm.$emit("dragging", true);
    await groups[groups.length - 1]!.vm.$emit("layout", [30, 70]);
    await handle.vm.$emit("dragging", false);
    expect(layout.splitRatio).toBeCloseTo(0.3, 5);
  });

  it("stores a ratio chosen with the keyboard once the key is released", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit);
    await nextTick();
    const groups = wrapper.findAllComponents({ name: "SplitterGroup" });
    const handle = wrapper.get('[aria-label="Resize editor and preview"]');

    await handle.trigger("keydown", { key: "ArrowLeft" });
    await groups[groups.length - 1]!.vm.$emit("layout", [40, 60]);
    expect(layout.splitRatio).toBe(0.5);

    await handle.trigger("keyup", { key: "ArrowLeft" });
    expect(layout.splitRatio).toBeCloseTo(0.4, 5);
  });

  it("does not store a layout the group clamps on its own", async () => {
    const layout = useLayoutStore();
    layout.splitRatio = 0.3;
    const wrapper = mount(ResizableSplit);
    await nextTick();
    // Mounting derived the first layout (clamped to 50/50 here, where the
    // group measures 0 px wide); the stored ratio survives it.
    expect(layout.splitRatio).toBe(0.3);

    // A window resize raising the pane minimum clamps the layout without a drag.
    const groups = wrapper.findAllComponents({ name: "SplitterGroup" });
    await groups[groups.length - 1]!.vm.$emit("layout", [45, 55]);
    expect(layout.splitRatio).toBe(0.3);
  });

  it("keeps the stored ratio while a pane is hidden", async () => {
    const layout = useLayoutStore();
    layout.splitRatio = 0.35;
    const wrapper = mount(ResizableSplit);
    layout.mode = "text";
    await nextTick();

    const groups = wrapper.findAllComponents({ name: "SplitterGroup" });
    await groups[groups.length - 1]!.vm.$emit("layout", [100, 0]);

    expect(layout.splitRatio).toBe(0.35);
    expect(wrapper.get('[aria-label="Resize editor and preview"]').attributes("style")).toContain(
      "display: none",
    );
  });

  it("persists a dragged sidebar width in pixels within its limits", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit);
    const outer = wrapper.findAllComponents({ name: "SplitterGroup" })[0]!;
    const handle = wrapper.findAllComponents({ name: "SplitterResizeHandle" })[0]!;

    await outer.vm.$emit("layout", [310, 900]);
    expect(layout.sidebarWidth).toBe(250);

    await handle.vm.$emit("dragging", true);
    await outer.vm.$emit("layout", [310, 900]);
    await handle.vm.$emit("dragging", false);
    expect(layout.sidebarWidth).toBe(310);

    await handle.vm.$emit("dragging", true);
    await outer.vm.$emit("layout", [900, 300]);
    await handle.vm.$emit("dragging", false);
    expect(layout.sidebarWidth).toBe(400);
  });

  it("resets the persisted content ratio to 50/50 on double click", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit, { slots: { source: "source", preview: "preview" } });
    await nextTick();
    layout.splitRatio = 0.7;

    await wrapper.get('[aria-label="Resize editor and preview"]').trigger("dblclick");

    expect(layout.splitRatio).toBeCloseTo(0.5, 5);
  });

  it("puts the single pane in place of the source and preview panes", () => {
    const wrapper = mount(ResizableSplit, {
      props: { singlePane: true },
      slots: { single: '<div data-testid="single-body" />' },
    });

    expect(wrapper.find("[data-single-pane] [data-testid=single-body]").exists()).toBe(true);
    expect(wrapper.find('[data-pane="source"]').exists()).toBe(false);
  });

  it("retains pane slot elements while changing modes", async () => {
    const layout = useLayoutStore();
    const wrapper = mount(ResizableSplit, {
      slots: { source: "source", preview: '<iframe title="Preview" />' },
    });
    const frame = wrapper.get("iframe").element;

    layout.mode = "text";
    await wrapper.vm.$nextTick();
    layout.mode = "preview";
    await wrapper.vm.$nextTick();

    expect(wrapper.get("iframe").element).toBe(frame);
    expect(wrapper.find('[data-pane="source"]').exists()).toBe(true);
  });

  it("names its resize handles in the interface language", () => {
    const wrapper = mount(ResizableSplit, { global: { plugins: [createI18nPlugin("ru")] } });
    const names = wrapper
      .findAllComponents({ name: "SplitterResizeHandle" })
      .map((handle) => handle.attributes("aria-label"));
    expect(names).toEqual([
      "Изменить ширину боковой панели",
      "Изменить соотношение редактора и превью",
    ]);
  });

  it("renders the header once above the panes in split and single modes", async () => {
    const wrapper = mount(ResizableSplit, { slots: { header: "<div data-test-header />" } });
    expect(wrapper.findAll("[data-test-header]")).toHaveLength(1);
    const header = wrapper.get("[data-test-header]").element;
    const source = wrapper.get('[data-pane="source"]').element;
    expect(header.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await wrapper.setProps({ singlePane: true });
    expect(wrapper.findAll("[data-test-header]")).toHaveLength(1);
  });
});
