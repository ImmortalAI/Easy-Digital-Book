import { createPinia, setActivePinia } from "pinia";
import { cleanup, render, screen, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WelcomeView from "@/views/WelcomeView.vue";
import { createI18nPlugin } from "@/plugins/i18n";
import { createInMemoryPlatformServices } from "@/services/platform";
import { createProjectFiles, projectFilesKey } from "@/composables/use-project-files";

function createFiles() {
  return createProjectFiles({
    services: createInMemoryPlatformServices(),
    locale: "en",
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
}

function renderWelcome(files: ReturnType<typeof createFiles>) {
  return render(WelcomeView, {
    global: {
      plugins: [createI18nPlugin("en")],
      provide: { [projectFilesKey as symbol]: files },
    },
  });
}

describe("WelcomeView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(cleanup);

  it("starts a new project from the welcome action", async () => {
    const files = createFiles();
    renderWelcome(files);

    await userEvent.click(screen.getByRole("button", { name: /new project/i }));

    expect(files.project.book).not.toBeNull();
  });

  it("offers recovery sessions and recent files as named buttons", async () => {
    const files = createFiles();
    files.settings.recentFiles = ["/books/my-novel.edb"];
    files.recoverySessions.value = [
      {
        bookId: "550e8400-e29b-41d4-a716-446655440001",
        originalPath: null,
        title: "Lost draft",
        version: null,
        updatedAt: 0,
      },
    ];
    const newBook = vi.spyOn(files, "newBook").mockResolvedValue(true);
    const openPath = vi.spyOn(files, "openPath").mockResolvedValue(true);
    const restore = vi.spyOn(files, "restoreRecovery").mockResolvedValue(true);
    renderWelcome(files);

    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(newBook).toHaveBeenCalled();

    const recentList = screen.getByRole("list", { name: /recent/i });
    const recent = within(recentList).getByRole("button", { name: /my-novel\.edb/ });
    expect(recent).toBeVisible();
    await userEvent.click(recent);
    expect(openPath).toHaveBeenCalledWith("/books/my-novel.edb");

    const recoveryList = screen.getByRole("list", { name: /unsaved changes/i });
    await userEvent.click(within(recoveryList).getByRole("button", { name: "Lost draft" }));
    expect(restore).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440001");
  });

  const lostDraft = {
    bookId: "550e8400-e29b-41d4-a716-446655440001",
    originalPath: null,
    title: "Lost draft",
    version: null,
    updatedAt: 0,
  };

  it("deletes an unsaved session after confirming", async () => {
    const files = createFiles();
    files.recoverySessions.value = [lostDraft];
    const remove = vi.spyOn(files, "deleteRecovery").mockResolvedValue();
    renderWelcome(files);

    await userEvent.click(screen.getByRole("button", { name: "Delete Lost draft" }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(remove).toHaveBeenCalledWith(lostDraft.bookId);
  });

  it("deletes at once when deletions are not confirmed", async () => {
    const files = createFiles();
    files.settings.confirmDelete = false;
    files.recoverySessions.value = [lostDraft];
    const remove = vi.spyOn(files, "deleteRecovery").mockResolvedValue();
    renderWelcome(files);

    await userEvent.click(screen.getByRole("button", { name: "Delete Lost draft" }));

    expect(remove).toHaveBeenCalledWith(lostDraft.bookId);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
