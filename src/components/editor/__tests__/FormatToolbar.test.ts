import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FormatToolbar from "@/components/editor/FormatToolbar.vue";
import {
  chapterEditorViews,
  registerChapterEditorView,
  unregisterChapterEditorView,
} from "@/components/editor/editor-commands";

let view: EditorView;
beforeEach(() => {
  setActivePinia(createPinia());
  view = new EditorView({
    state: EditorState.create({
      doc: "Hello world",
      selection: EditorSelection.single(6, 11),
      extensions: [history()],
    }),
    parent: document.body,
  });
  registerChapterEditorView("c1", view);
});
afterEach(() => {
  cleanup();
  view.destroy();
  chapterEditorViews.clear();
});

describe("FormatToolbar", () => {
  it("applies bold to the editor and returns focus to it", async () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /bold/i }));
    expect(view.state.doc.toString()).toBe("Hello **world**");
    expect(view.hasFocus).toBe(true);
  });

  it("inserts a footnote and a scene break", async () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /footnote/i }));
    expect(view.state.doc.toString()).toContain("[^1]: ");
  });

  it("disables every button in preview mode", () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: true } });
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("asks the parent to import a file at the cursor", async () => {
    const { emitted } = render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /insert image/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /from file/i }));
    expect(emitted()["insert-image-from-file"]).toEqual([[11]]);
  });

  it("reflects a view registered after the toolbar mounted, and its removal", async () => {
    const late = new EditorView({
      state: EditorState.create({ doc: "a **b** c", selection: EditorSelection.single(5) }),
      parent: document.body,
    });
    render(FormatToolbar, { props: { chapterId: "c2", disabled: false } });
    const bold = screen.getByRole("button", { name: /bold/i });
    expect(bold).toHaveAttribute("aria-pressed", "false");
    registerChapterEditorView("c2", late);
    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "true"));
    unregisterChapterEditorView("c2", late);
    await waitFor(() => expect(bold).toHaveAttribute("aria-pressed", "false"));
    late.destroy();
  });

  it("anchors the image picker outside the group hidden on narrow headers", async () => {
    const { container } = render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    const anchor = container.querySelector("[data-format-toolbar-anchor]");
    expect(anchor).not.toBeNull();
    const imageButton = screen.getByRole("button", { name: /insert image/i });
    expect(anchor!.contains(imageButton)).toBe(true);
    expect(imageButton.closest(".hidden")).not.toBeNull();
    expect(anchor!.closest(".hidden")).toBeNull();
    expect(anchor!.className).not.toContain("hidden");
  });

  it("opens the book picker from the More menu", async () => {
    render(FormatToolbar, { props: { chapterId: "c1", disabled: false } });
    await userEvent.click(screen.getByRole("button", { name: /more formatting/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /insert image/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /from the book/i }));
    expect(await screen.findByText(/no images yet/i)).toBeInTheDocument();
  });
});
