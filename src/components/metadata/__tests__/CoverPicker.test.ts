import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoverPicker from "@/components/metadata/CoverPicker.vue";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import type { ImageFile, ImageImportIdentity } from "@/composables/use-image-import";

function makeBook() {
  return createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
}

describe("CoverPicker", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useProjectStore().setBook(makeBook());
  });

  it("delegates native choose and dropped image files to import callbacks", async () => {
    const pick = vi.fn<() => Promise<void>>(async () => undefined);
    const onDropFile = vi.fn<
      (file: { name: string; bytes: Uint8Array; type?: string }) => Promise<void>
    >(async () => undefined);
    const wrapper = mount(CoverPicker, { props: { cover: null, onPick: pick, onDropFile } });
    await wrapper.get("button").trigger("click");
    const file = new File([new Uint8Array([1, 2])], "cover.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    await wrapper.get('[data-slot="empty"]').trigger("drop", { dataTransfer });
    expect(pick).toHaveBeenCalledOnce();
    expect(onDropFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "cover.png" }),
      expect.objectContaining({ bookId: expect.any(String), generation: expect.any(Number) }),
    );
  });

  it("discards a dropped cover when its byte read outlives the project", async () => {
    let resolve!: (bytes: ArrayBuffer) => void;
    const file = new File([new Uint8Array([1, 2])], "cover.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => new Promise<ArrayBuffer>((done) => (resolve = done)),
    });
    const onDropFile = vi.fn<(file: ImageFile, identity: ImageImportIdentity) => Promise<void>>(
      async () => undefined,
    );
    const wrapper = mount(CoverPicker, { props: { cover: null, onDropFile } });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });

    wrapper.get('[data-slot="empty"]').element.dispatchEvent(event);
    useProjectStore().setBook(makeBook());
    resolve(new Uint8Array([1, 2]).buffer);
    await Promise.resolve();
    await Promise.resolve();

    expect(onDropFile).not.toHaveBeenCalled();
  });
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("CoverPicker thumbnail", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("bounds the thumbnail width outside the aspect box and keeps the real ratio", () => {
    const project = useProjectStore();
    const book = makeBook();
    book.resources.set("images/c.png", { mediaType: "image/png", bytes: png(1000, 1500) });
    project.setBook(book);
    const wrapper = mount(CoverPicker, { props: { cover: "images/c.png", preview: "blob:x" } });
    const inner = wrapper.get('[data-slot="aspect-ratio"]');
    const outer = inner.element.parentElement!;
    expect(outer.parentElement!.className).toContain("w-32");
    expect(inner.classes()).not.toContain("w-32");
    expect(outer.getAttribute("style")).toContain("padding-bottom: 150%");
    expect(wrapper.get("img").classes()).toContain("object-contain");
    expect(wrapper.text()).toContain("1000×1500");
  });
});
