import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import { useLayoutStore } from "@/stores/layout";
import { useImageImport } from "@/composables/use-image-import";

const makeBook = (id: string) => ({
  ...createBook({
    locale: "en",
    now: new Date(),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  }),
  metadata: {
    ...createBook({
      locale: "en",
      now: new Date(),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    }).metadata,
    id,
  },
});

describe("image import project generation", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("does not apply deferred import results after switching projects", async () => {
    let release!: () => void;
    const hash = () =>
      new Promise<string>((resolve) => {
        release = () => resolve("hash");
      });
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const layout = useLayoutStore();
    const callback = { called: false };
    const importer = useImageImport({
      sha256: hash,
      onInserted: () => {
        callback.called = true;
      },
    });
    const pending = importer.importFile(
      { name: "a.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
      "chapter1",
      0,
    );
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));
    await Promise.resolve();
    release();
    await expect(pending).resolves.toBeNull();
    expect(project.book?.resources.size).toBe(0);
    expect(layout.center).toEqual({ kind: "chapter", id: "" });
    expect(callback.called).toBe(false);
  });

  it("discards a stale cover import result for callers", async () => {
    let release!: () => void;
    const hash = () =>
      new Promise<string>((resolve) => {
        release = () => resolve("hash");
      });
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const importer = useImageImport({ sha256: hash });
    const pending = importer.importFile({
      name: "cover.png",
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));
    await Promise.resolve();
    release();
    await expect(pending).resolves.toBeNull();
  });

  it("discards a clipboard file whose byte read outlives the captured project", async () => {
    let resolve!: (bytes: ArrayBuffer) => void;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([png], "pasted.png", {
      type: "image/png",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => new Promise<ArrayBuffer>((done) => (resolve = done)),
    });
    const hash = vi.fn<(bytes: Uint8Array) => Promise<string>>(async () => "hash");
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const importer = useImageImport({ sha256: hash });
    const pending = importer.importClipboardImage({ files: [file] } as unknown as DataTransfer);

    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));
    resolve(png.buffer);

    await expect(pending).resolves.toBeNull();
    expect(hash).not.toHaveBeenCalled();
    expect(project.book?.resources.size).toBe(0);
  });

  it("does not hash a picked file after its picker switches projects", async () => {
    let resolve!: (file: { name: string; bytes: Uint8Array }) => void;
    const pickFile = () =>
      new Promise<{ name: string; bytes: Uint8Array }>((done) => {
        resolve = done;
      });
    const hash = vi.fn<(bytes: Uint8Array) => Promise<string>>(async () => "hash");
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const importer = useImageImport({ pickFile, sha256: hash });
    const pending = importer.pickAndImport();

    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440002"));
    resolve({
      name: "picked.png",
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });

    await expect(pending).resolves.toBeNull();
    expect(hash).not.toHaveBeenCalled();
    expect(project.book?.resources.size).toBe(0);
  });

  it("shows an imported image unless the caller keeps the current view", async () => {
    const project = useProjectStore();
    project.setBook(makeBook("urn:uuid:550e8400-e29b-41d4-a716-446655440001"));
    const layout = useLayoutStore();
    layout.center = { kind: "images" };
    const importer = useImageImport({ sha256: async (bytes) => String(bytes.length) });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await importer.importFile({ name: "a.png", bytes: png }, undefined, undefined, null, {
      navigate: false,
    });
    expect(project.book?.resources.has("images/a.png")).toBe(true);
    expect(layout.center).toEqual({ kind: "images" });

    await importer.importFile({ name: "b.png", bytes: new Uint8Array([...png, 0]) });
    expect(layout.center).toEqual({ kind: "image", path: "images/b.png" });
  });
});
