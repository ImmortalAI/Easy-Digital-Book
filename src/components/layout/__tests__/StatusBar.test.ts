import { createPinia, setActivePinia } from "pinia";
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import StatusBar from "@/components/layout/StatusBar.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import { useSpellingStore } from "@/stores/spelling";

describe("StatusBar", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it.each([
    ["saved", "Saved"],
    ["unsaved", "Unsaved changes"],
    ["saving", "Saving…"],
  ] as const)("reports the %s save state", (saveState, text) => {
    render(StatusBar, { props: { saveState, counts: null } });

    expect(screen.getByRole("region", { name: "Status bar" })).toHaveTextContent(text);
  });

  it("counts the open chapter's words and characters", () => {
    render(StatusBar, { props: { saveState: "saved", counts: { words: 12, characters: 80 } } });

    expect(screen.getByRole("region", { name: "Status bar" })).toHaveTextContent(
      "12 words · 80 characters",
    );
  });

  it("leaves the counts out when no chapter is open", () => {
    render(StatusBar, { props: { saveState: "saved", counts: null } });

    expect(screen.getByRole("region", { name: "Status bar" })).not.toHaveTextContent(/words/);
  });

  it("says when the preview is styled and offers the original look", async () => {
    const { emitted } = render(StatusBar, {
      props: { saveState: "saved", counts: null, previewStyled: true },
    });

    await userEvent.click(screen.getByRole("button", { name: /styled preview/i }));

    expect(emitted("showOriginalPreview")).toHaveLength(1);
  });

  it("keeps quiet about the preview when it shows the original look", () => {
    render(StatusBar, { props: { saveState: "saved", counts: null, previewStyled: false } });

    expect(screen.queryByRole("button", { name: /styled preview/i })).toBeNull();
  });

  it("carries the warnings button", () => {
    render(StatusBar, { props: { saveState: "saved", counts: null } });

    expect(screen.getByRole("button", { name: /warning/i })).toBeInTheDocument();
  });

  it("speaks the interface language", () => {
    render(StatusBar, {
      props: { saveState: "saving", counts: { words: 1, characters: 2 } },
      global: { plugins: [createI18nPlugin("ru")] },
    });

    expect(screen.getByRole("region", { name: "Строка состояния" })).toHaveTextContent(
      "Сохранение…",
    );
  });
});

describe("StatusBar spelling badge", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it("puts the spelling badge right after the warnings and forwards its selection", async () => {
    const project = useProjectStore();
    project.setBook({
      ...createBook({
        locale: "en",
        now: new Date("2026-01-01"),
        newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
        newChapterId: () => "chapter1",
      }),
      chapters: [{ id: "chapter1", source: "превет" }],
    });
    useSpellingStore().setChapter("chapter1", "превет", [
      { word: "превет", lang: "ru", from: 0, to: 6 },
    ]);
    const { emitted } = render(StatusBar, { props: { saveState: "saved", counts: null } });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName(/warning/i);
    expect(buttons[1]).toHaveAccessibleName("1 spelling issue");

    await userEvent.click(buttons[1]!);
    await userEvent.click(screen.getByRole("button", { name: /превет/ }));

    expect(emitted("selectSpelling")).toEqual([[{ chapterId: "chapter1", from: 0, to: 6 }]]);
  });
});
