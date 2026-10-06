import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DictionaryView from "../DictionaryView.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";

const bookOptions = {
  locale: "en",
  now: new Date(),
  newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
  newChapterId: () => "chapter1",
};

function renderView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return { project: useProjectStore(), pinia };
}

describe("DictionaryView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it("lists, filters, adds and removes words", async () => {
    const { project, pinia } = renderView();
    project.setBook({ ...createBook(bookOptions), dictionary: ["Минжуй", "дао"] });
    render(DictionaryView, { global: { plugins: [pinia, createI18nPlugin("en")] } });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "Минжуй",
      "дао",
    ]);
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter words" }), "мин");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(screen.getByRole("searchbox", { name: "Filter words" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New word" }), "Алёна{Enter}");
    expect(project.book!.dictionary).toEqual(["Алёна", "Минжуй", "дао"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove дао" }));
    expect(project.book!.dictionary).toEqual(["Алёна", "Минжуй"]);
    expect(project.dirty).toBe(true);
  });

  it("rejects text with spaces and shows the empty state", async () => {
    const { project, pinia } = renderView();
    project.setBook(createBook(bookOptions));
    render(DictionaryView, { global: { plugins: [pinia, createI18nPlugin("en")] } });
    expect(screen.getByText("The book dictionary is empty")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "New word" }), "два слова{Enter}");
    expect(screen.getByText("Enter one word without spaces")).toBeInTheDocument();
    expect(project.book!.dictionary).toEqual([]);
  });
});
