import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { computed, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExportDialog from "@/components/export/ExportDialog.vue";
import { useProjectStore } from "@/stores/project";
import type { ExportController } from "@/composables/use-export";

function bookMetadata(version: string | null) {
  return {
    id: "book",
    title: "Novel",
    version,
    created: "",
    modified: "",
    language: "en",
    authors: [],
    translators: [],
    series: null,
    description: null,
    cover: null,
  };
}

function makeController(format: "epub" | "azw3" = "epub") {
  const selectedFormat = ref(format);
  return {
    options: ref({
      imagePreset: "kindle-paperwhite",
      grayscale: false,
      titlePage: true,
      versionInTitle: false,
    }),
    format: selectedFormat,
    fileName: computed(() => `Novel.${selectedFormat.value}`),
    warnings: ref([]),
    progress: ref(null),
    exporting: ref(false),
    error: ref(null),
    lastOutput: ref(null),
    exportBook: vi.fn<ExportController["exportBook"]>().mockResolvedValue("Novel.epub"),
    revealOutput: vi.fn<ExportController["revealOutput"]>(),
  } as unknown as ExportController;
}

describe("ExportDialog", () => {
  beforeEach(() => setActivePinia(createPinia()));
  // Dialog teleports its content to document.body and this file renders it
  // more than once; without cleanup the next render's query could match a
  // still-mounted node left over from the previous test.
  afterEach(() => cleanup());

  it("disables adding a version to the filename when the book has no version", async () => {
    const project = useProjectStore();
    project.setBook({
      metadata: bookMetadata(null),
      chapters: [{ id: "chapter1", source: "# Chapter" }],
      resources: new Map(),
      customCss: null,
    });
    const controller = makeController();
    controller.options.value.versionInTitle = true;

    render(ExportDialog, { props: { controller, project } });

    // ExportDialog now teleports its content to document.body (Dialog's
    // portal), so it is queried through testing-library's document-wide screen
    // rather than a mounted wrapper's tree.
    const versionCheckbox = await screen.findByRole("checkbox", { name: /add version to title/i });
    expect(versionCheckbox.hasAttribute("disabled")).toBe(true);
  });

  it("exports with the chosen preset and reports success", async () => {
    const project = useProjectStore();
    project.setBook({
      metadata: bookMetadata("1.0.0"),
      chapters: [{ id: "chapter1", source: "# Chapter" }],
      resources: new Map(),
      customCss: null,
    });
    const controller = makeController();

    render(ExportDialog, { props: { controller, project } });
    // The preset control is a shadcn-vue Select (a Reka listbox), not a native
    // <select>, so it is driven by opening the combobox and clicking an option
    // rather than userEvent.selectOptions. findByRole (rather than getByRole)
    // waits out Dialog's initial teleport-mount tick.
    await userEvent.click(await screen.findByRole("combobox", { name: /image preset/i }));
    await userEvent.click(await screen.findByRole("option", { name: /without changes/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /grayscale/i }));
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("EPUB saved");
    expect(controller.exportBook).toHaveBeenCalledWith(
      expect.objectContaining({ dialogFilterName: "EPUB book" }),
    );
  });

  it("selects AZW3, updates its output name and filters, and reveals the written file", async () => {
    const controller = makeController();
    controller.lastOutput.value = "/exports/previous.epub";
    controller.exportBook = vi.fn<ExportController["exportBook"]>().mockResolvedValue("Novel.azw3");
    const { rerender } = render(ExportDialog, { props: { controller } });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("combobox", { name: /format/i }));
    await user.click(await screen.findByRole("option", { name: "AZW3" }));
    expect(controller.format.value).toBe("azw3");
    expect(controller.lastOutput.value).toBeNull();
    expect(await screen.findByText("Novel.azw3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Export AZW3" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(controller.exportBook).toHaveBeenCalledWith(
      expect.objectContaining({
        dialogTitle: "Export AZW3",
        dialogFilterName: "AZW3 book",
      }),
    );
    expect((await screen.findByRole("status")).textContent).toContain("AZW3 saved");
    await user.click(screen.getByRole("button", { name: /show in folder/i }));
    expect(controller.revealOutput).toHaveBeenCalledOnce();

    await rerender({ controller, open: false });
    await rerender({ controller, open: true });
    expect(screen.getByRole("combobox", { name: /format/i })).toBeTruthy();
  });

  it("restores the AZW3 format supplied by saved settings", async () => {
    const controller = makeController("azw3");
    render(ExportDialog, { props: { controller } });

    expect(await screen.findByRole("heading", { name: "Export AZW3" })).toBeTruthy();
    expect(await screen.findByText("Novel.azw3")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /format/i }).textContent).toContain("AZW3");
  });

  it("disables all export choices while an export is running", async () => {
    const controller = makeController();
    controller.exporting.value = true;
    render(ExportDialog, { props: { controller } });

    expect(
      (await screen.findByRole("combobox", { name: /format/i })).hasAttribute("data-disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("combobox", { name: /image preset/i }).hasAttribute("data-disabled"),
    ).toBe(true);
    expect(screen.getByRole("checkbox", { name: /grayscale/i }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("checkbox", { name: /title page/i }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen.getByRole("checkbox", { name: /version to title/i }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows AZW3 progress instead of ZIP progress", async () => {
    const controller = makeController("azw3");
    controller.progress.value = { stage: "azw3", done: 1, total: 3 };
    render(ExportDialog, { props: { controller } });

    expect(await screen.findByText("Creating AZW3…")).toBeTruthy();
    expect(screen.queryByText("Creating EPUB…")).toBeNull();
  });

  it("aborts an active export when Escape dismisses the dialog", async () => {
    const controller = makeController();
    let signal: AbortSignal | undefined;
    controller.exportBook = vi.fn<ExportController["exportBook"]>(
      ({ signal: requestSignal } = {}) => {
        signal = requestSignal;
        controller.exporting.value = true;
        return new Promise<string | null>((resolve) => {
          requestSignal?.addEventListener("abort", () => {
            controller.exporting.value = false;
            resolve(null);
          });
        });
      },
    );
    render(ExportDialog, { props: { controller } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /export/i }));
    await user.keyboard("{Escape}");

    expect(signal?.aborted).toBe(true);
  });

  it.each(["cancel button", "outside click"] as const)(
    "aborts an active export when dismissed by %s",
    async (dismissal) => {
      const controller = makeController();
      let signal: AbortSignal | undefined;
      controller.exportBook = vi.fn<ExportController["exportBook"]>(
        ({ signal: requestSignal } = {}) => {
          signal = requestSignal;
          controller.exporting.value = true;
          return new Promise<string | null>((resolve) => {
            requestSignal?.addEventListener("abort", () => {
              controller.exporting.value = false;
              resolve(null);
            });
          });
        },
      );
      render(ExportDialog, { props: { controller } });
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /export/i }));
      if (dismissal === "cancel button") {
        await user.click(await screen.findByRole("button", { name: /cancel/i }));
      } else {
        await user.click(document.querySelector('[data-slot="dialog-overlay"]')!);
      }

      expect(signal?.aborted).toBe(true);
    },
  );

  it("starts fresh after closing and reopening, not stuck on the last success", async () => {
    // EditorView keeps ExportDialog mounted permanently and only toggles its
    // `open` model (it no longer remounts the component per open), so a
    // successful export must not leave the dialog stuck on the "EPUB saved"
    // screen the next time it's opened.
    const project = useProjectStore();
    project.setBook({
      metadata: bookMetadata("1.0.0"),
      chapters: [{ id: "chapter1", source: "# Chapter" }],
      resources: new Map(),
      customCss: null,
    });
    const controller = makeController();

    const { rerender } = render(ExportDialog, { props: { controller, project, open: true } });
    await userEvent.click(await screen.findByRole("button", { name: /export/i }));
    expect((await screen.findByRole("status")).textContent).toContain("EPUB saved");

    await rerender({ controller, project, open: false });
    await rerender({ controller, project, open: true });

    expect(screen.queryByRole("status")).toBeNull();
    expect(await screen.findByRole("button", { name: /export/i })).not.toBeNull();
  });
});
