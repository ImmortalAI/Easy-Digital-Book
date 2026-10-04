import { describe, expect, it, vi } from "vitest";
import { handleGlobalShortcut } from "@/composables/use-shortcuts";

function eventFor(target: HTMLElement, key: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, ...extra });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("global shortcut filtering", () => {
  it("toggles the paper preview with Mod+Alt+P whatever character Alt types", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    document.body.append(editor);
    const togglePaperStyle = vi.fn<() => void>();

    // macOS turns Alt+P into "π", so the binding goes by the physical key.
    const event = eventFor(editor, "π", { code: "KeyP", altKey: true, cancelable: true });
    expect(handleGlobalShortcut(event, { togglePaperStyle })).toBe(true);
    expect(togglePaperStyle).toHaveBeenCalledOnce();
    expect(
      handleGlobalShortcut(eventFor(editor, "p", { code: "KeyP" }), { togglePaperStyle }),
    ).toBe(false);
  });

  it("allows global save from CodeMirror but leaves markup keys to CodeMirror", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    document.body.append(editor);
    const save = vi.fn<() => void>();

    expect(handleGlobalShortcut(eventFor(editor, "s"), { save })).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(handleGlobalShortcut(eventFor(editor, "b"), { save })).toBe(false);
  });

  it("closes the project with Mod+W, from the editor too", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    document.body.append(editor);
    const closeProject = vi.fn<() => void>();

    const event = eventFor(editor, "w", { cancelable: true });
    expect(handleGlobalShortcut(event, { closeProject })).toBe(true);
    expect(closeProject).toHaveBeenCalledOnce();
    // The browser's own Mod+W would close the tab or window instead.
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores global commands from ordinary editable controls", () => {
    const input = document.createElement("input");
    const save = vi.fn<() => void>();

    expect(handleGlobalShortcut(eventFor(input, "s"), { save })).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("allows replace-all from the search view input", () => {
    const search = document.createElement("section");
    search.className = "search-view";
    const input = document.createElement("input");
    search.append(input);
    document.body.append(search);
    const replaceAll = vi.fn<() => void>();

    expect(handleGlobalShortcut(eventFor(input, "Enter", { altKey: true }), { replaceAll })).toBe(
      true,
    );
    expect(replaceAll).toHaveBeenCalledOnce();
  });
});
