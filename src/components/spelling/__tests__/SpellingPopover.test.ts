import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpellingPopover from "../SpellingPopover.vue";
import { createBook } from "@/services/book/create";
import { createInMemoryPlatformServices, setRuntimePlatformServices } from "@/services/platform";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";

const bookOptions = {
  locale: "en",
  now: new Date("2026-01-01"),
  newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
  newChapterId: () => "chapter1",
};

describe("SpellingPopover", () => {
  let openLogs: ReturnType<typeof vi.spyOn>;
  afterEach(cleanup);
  beforeEach(() => {
    setActivePinia(createPinia());
    const services = createInMemoryPlatformServices();
    setRuntimePlatformServices(services);
    openLogs = vi.spyOn(services.logs, "openDirectory");
  });

  it("shows the book total, groups by chapter with counts and context, and jumps to the word", async () => {
    const project = useProjectStore();
    project.setBook({
      ...createBook(bookOptions),
      chapters: [
        { id: "chapter1", source: "# Начало\nтекст" },
        { id: "chapter2", source: "# Встреча\nсказал Минжуи и вышел. Минжуи ушёл." },
      ],
    });
    const source = project.book!.chapters[1]!.source;
    const first = source.indexOf("Минжуи");
    const second = source.lastIndexOf("Минжуи");
    useSpellingStore().setChapter("chapter2", source, [
      { word: "Минжуи", lang: "ru", from: first, to: first + 6 },
      { word: "Минжуи", lang: "ru", from: second, to: second + 6 },
    ]);
    const { emitted } = render(SpellingPopover);
    await userEvent.click(screen.getByRole("button", { name: "2 spelling issues" }));
    expect(screen.getByText("Chapter 2 · Встреча — 2")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText(/сказал/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Минжуи/ }));
    expect(emitted().select).toEqual([[{ chapterId: "chapter2", from: first, to: first + 6 }]]);
  });

  it("clears all occurrences with Add to dictionary and Ignore", async () => {
    const project = useProjectStore();
    const source = "Минжуи превет Минжуи превет";
    project.setBook({ ...createBook(bookOptions), chapters: [{ id: "chapter1", source }] });
    const spelling = useSpellingStore();
    spelling.setChapter("chapter1", source, [
      { word: "Минжуи", lang: "ru", from: 0, to: 6 },
      { word: "превет", lang: "ru", from: 7, to: 13 },
      { word: "Минжуи", lang: "ru", from: 14, to: 20 },
      { word: "превет", lang: "ru", from: 21, to: 27 },
    ]);
    render(SpellingPopover);
    await userEvent.click(screen.getByRole("button", { name: "4 spelling issues" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Add to book dictionary" })[0]!);
    expect(project.book!.dictionary).toEqual(["Минжуи"]);
    expect(spelling.total).toBe(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Ignore" })[0]!);
    expect(spelling.total).toBe(0);
    expect(project.book!.dictionary).toEqual(["Минжуи"]);
  });

  it("is grey with a hint and a log button when unavailable", async () => {
    useSpellingStore().status = "unavailable";
    render(SpellingPopover);
    const button = screen.getByRole("button", { name: "Spell checking is unavailable" });
    expect(button).toHaveAttribute(
      "title",
      "The dictionaries could not be loaded. Details are in the log.",
    );
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Log folder" }));
    expect(openLogs).toHaveBeenCalled();
  });

  it("shows a spinner while the first pass runs", () => {
    useSpellingStore().status = "checking";
    render(SpellingPopover);
    expect(screen.getByRole("button", { name: "Checking spelling…" })).toBeInTheDocument();
  });
});
