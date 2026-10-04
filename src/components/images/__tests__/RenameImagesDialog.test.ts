import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it } from "vitest";
import RenameImagesDialog from "@/components/images/RenameImagesDialog.vue";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";

const png = { mediaType: "image/png" as const, bytes: new Uint8Array([1]) };
afterEach(cleanup);

describe("RenameImagesDialog", () => {
  it("previews old → new names and blocks a conflicting name", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = createBook({
      locale: "en",
      now: new Date("2026-01-01"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    useProjectStore().setBook({
      ...book,
      resources: new Map([
        ["images/a.png", png],
        ["images/b.jpg", png],
        ["images/x_1.png", png],
      ]),
    });
    render(RenameImagesDialog, {
      props: { open: true, paths: ["images/a.png", "images/b.jpg"] },
      global: { plugins: [pinia] },
    });
    const field = () => screen.getByRole("textbox", { name: /new name/i });
    await screen.findByRole("textbox", { name: /new name/i });
    await userEvent.type(field(), "Ш-x");
    expect(field()).toHaveValue("-x");
    await userEvent.clear(field());
    await userEvent.type(field(), "y");
    expect(screen.getByText("a.png")).toBeTruthy();
    expect(screen.getByText("y_1.png")).toBeTruthy();
    expect(screen.getByText("y_2.jpg")).toBeTruthy();
    await userEvent.clear(field());
    await userEvent.type(field(), "x");
    expect(screen.getByRole("button", { name: /rename/i })).toBeDisabled();
    expect(screen.getByText(/already exists/i)).toBeTruthy();
  });

  it("renames one image without a number, starting from its current name", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const book = createBook({
      locale: "en",
      now: new Date("2026-01-01"),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    useProjectStore().setBook({ ...book, resources: new Map([["images/a.png", png]]) });
    const { emitted } = render(RenameImagesDialog, {
      props: { open: true, paths: ["images/a.png"] },
      global: { plugins: [pinia] },
    });
    const field = await screen.findByRole("textbox", { name: /new name/i });
    expect(screen.getByRole("heading", { name: "Rename image" })).toBeTruthy();
    expect(field).toHaveValue("a");
    expect(screen.getByRole("button", { name: /^rename$/i })).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "cover");
    expect(screen.getByText("cover.png")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^rename$/i }));
    expect(emitted("confirm")?.[0]).toEqual([[{ from: "images/a.png", to: "images/cover.png" }]]);
  });
});
