import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import FileMenu from "@/components/layout/FileMenu.vue";
import { createI18nPlugin } from "@/plugins/i18n";

describe("FileMenu", () => {
  afterEach(cleanup);

  it("opens from the book title and lists the file commands with their shortcuts", async () => {
    render(FileMenu, { props: { title: "saga.edb", dirty: false, canReveal: true } });

    await userEvent.click(screen.getByRole("button", { name: /saga\.edb/ }));

    const items = (await screen.findAllByRole("menuitem")).map((item) => item.textContent?.trim());
    expect(items).toEqual([
      "New project Mod+N",
      "Open… Mod+O",
      "Save Mod+S",
      "Save as… Mod+Shift+S",
      "Show in folder",
      "Close project Mod+W",
    ]);
  });

  it("marks unsaved changes on the title", () => {
    render(FileMenu, { props: { title: "saga.edb", dirty: true, canReveal: true } });

    expect(screen.getByRole("img", { name: "Unsaved changes" })).toBeInTheDocument();
  });

  it.each([
    ["New project", "new"],
    ["Open…", "open"],
    ["Save", "save"],
    ["Save as…", "saveAs"],
    ["Close project", "close"],
  ])("runs %s", async (label, event) => {
    const { emitted } = render(FileMenu, {
      props: { title: "saga.edb", dirty: false, canReveal: true },
    });

    await userEvent.click(screen.getByRole("button", { name: /saga\.edb/ }));
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(`^${escaped} Mod`) }),
    );

    expect(emitted(event)).toHaveLength(1);
  });

  it("shows the project in its folder, once it has been saved", async () => {
    const { emitted } = render(FileMenu, {
      props: { title: "Saga", dirty: false, canReveal: true },
    });
    await userEvent.click(screen.getByRole("button", { name: /Saga/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Show in folder" }));
    expect(emitted("reveal")).toHaveLength(1);
  });

  it("can't show a never-saved project in a folder", async () => {
    render(FileMenu, { props: { title: "Saga", dirty: false, canReveal: false } });
    await userEvent.click(screen.getByRole("button", { name: /Saga/ }));
    expect(await screen.findByRole("menuitem", { name: "Show in folder" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("speaks the interface language", async () => {
    render(FileMenu, {
      props: { title: "saga.edb", dirty: false, canReveal: true },
      global: { plugins: [createI18nPlugin("ru")] },
    });

    await userEvent.click(screen.getByRole("button", { name: /saga\.edb/ }));

    expect(await screen.findByRole("menuitem", { name: /^Закрыть проект/ })).toBeInTheDocument();
  });
});
