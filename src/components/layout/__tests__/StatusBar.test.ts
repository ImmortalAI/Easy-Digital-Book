import { createPinia, setActivePinia } from "pinia";
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import StatusBar from "@/components/layout/StatusBar.vue";
import { createI18nPlugin } from "@/plugins/i18n";

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
