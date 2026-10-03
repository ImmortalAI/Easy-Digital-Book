import { createPinia, setActivePinia } from "pinia";
import { within } from "@testing-library/vue";
import { DOMWrapper, mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import ExplorerView from "@/components/sidebar/ExplorerView.vue";

// ConfirmDialog now teleports its content to document.body (AlertDialog's
// portal), so it is no longer reachable through the mounted wrapper's tree.
function confirmDialog(): DOMWrapper<HTMLElement> {
  const el = document.body.querySelector<HTMLElement>('[role="alertdialog"]');
  if (!el) throw new Error("Expected the confirm dialog to be open");
  return new DOMWrapper(el);
}

/** The dialog's destructive action, by role and name. */
function confirmButton(): DOMWrapper<HTMLElement> {
  return new DOMWrapper(within(confirmDialog().element).getByRole("button", { name: "Delete" }));
}

/** The explorer's tree row whose text contains `text`. */
function treeItem(wrapper: VueWrapper, text: string): DOMWrapper<Element> {
  const item = wrapper.findAll('[role="treeitem"]').find((row) => row.text().includes(text));
  if (!item) throw new Error(`Expected a tree item containing “${text}”`);
  return item;
}

describe("ExplorerView destructive actions", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("persists the do-not-ask-again choice from chapter confirmation", async () => {
    const project = useProjectStore();
    const book = createBook({
      locale: "en",
      now: new Date(),
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters.push({ id: "chapter2", source: "# Two" });
    project.setBook(book);
    const settings = useSettingsStore();
    const wrapper = mount(ExplorerView);
    await treeItem(wrapper, "Two").get('button[aria-label="Delete"]').trigger("click");
    expect(wrapper.findComponent({ name: "ConfirmDialog" }).exists()).toBe(true);
    const dialog = confirmDialog();
    await dialog.get('[role="checkbox"]').trigger("click");
    await confirmButton().trigger("click");
    expect(settings.confirmDelete).toBe(false);
    expect(project.book?.chapters).toHaveLength(1);
    wrapper.unmount();
  });
});
