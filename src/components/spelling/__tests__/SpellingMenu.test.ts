import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpellingMenu from "../SpellingMenu.vue";

const suggest = vi.fn<(lang: string, word: string) => Promise<string[]>>();
vi.mock("@/composables/use-spelling-actions", () => ({
  useSpellingActions: () => ({
    suggest,
    addToDictionary: vi.fn<(word: string) => void>(),
    ignore: vi.fn<(word: string) => void>(),
    openLogs: vi.fn<() => Promise<void>>(),
  }),
}));
const props = {
  open: true,
  word: "превет",
  lang: "ru" as const,
  anchor: { left: 10, top: 10, height: 16 },
};

describe("SpellingMenu", () => {
  afterEach(cleanup);
  beforeEach(() => {
    setActivePinia(createPinia());
    suggest.mockReset();
  });
  it("asks for suggestions only when opened and lists them", async () => {
    suggest.mockResolvedValue(["привет", "превед"]);
    const { emitted } = render(SpellingMenu, { props });
    expect(suggest).toHaveBeenCalledWith("ru", "превет");
    await userEvent.click(await screen.findByRole("menuitem", { name: "привет" }));
    expect(emitted().replace).toEqual([["привет"]]);
  });
  it("shows No suggestions, Ignore and Add", async () => {
    suggest.mockResolvedValue([]);
    const { emitted } = render(SpellingMenu, { props });
    expect(await screen.findByText("No suggestions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Ignore" }));
    expect(emitted().ignore).toHaveLength(1);
  });
  it("treats a failed suggestion request as no suggestions", async () => {
    suggest.mockRejectedValue(new Error("x"));
    render(SpellingMenu, { props });
    expect(await screen.findByText("No suggestions")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add to book dictionary" })).toBeInTheDocument();
  });
});
