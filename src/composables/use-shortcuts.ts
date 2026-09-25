import { useEventListener } from "@vueuse/core";

export interface GlobalShortcutHandlers {
  newBook?: () => void;
  open?: () => void;
  save?: () => void;
  saveAs?: () => void;
  closeProject?: () => void;
  exportEpub?: () => void;
  toggleSidebar?: () => void;
  explorer?: () => void;
  searchBook?: () => void;
  textMode?: () => void;
  splitMode?: () => void;
  previewMode?: () => void;
  replaceAll?: () => void;
}

const editableTagNames = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    editableTagNames.has(target.tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

function isCodeMirrorTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(".cm-editor"));
}

function isSearchTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(".search-view"));
}

export function handleGlobalShortcut(
  event: KeyboardEvent,
  handlers: GlobalShortcutHandlers,
): boolean {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return false;
  const key = event.key.toLowerCase();
  const shortcut =
    event.altKey && key === "enter"
      ? handlers.replaceAll
      : event.shiftKey && key === "s"
        ? handlers.saveAs
        : event.shiftKey && key === "e"
          ? handlers.explorer
          : event.shiftKey && key === "f"
            ? handlers.searchBook
            : key === "n"
              ? handlers.newBook
              : key === "o"
                ? handlers.open
                : key === "w"
                  ? handlers.closeProject
                  : key === "s"
                    ? handlers.save
                    : key === "e"
                      ? handlers.exportEpub
                      : key === "\\"
                        ? handlers.toggleSidebar
                        : key === "1"
                          ? handlers.textMode
                          : key === "2"
                            ? handlers.splitMode
                            : key === "3"
                              ? handlers.previewMode
                              : undefined;
  if (!shortcut) {
    return false;
  }
  const replaceAllInSearch = key === "enter" && event.altKey && isSearchTarget(event.target);
  if (isEditableTarget(event.target) && !isCodeMirrorTarget(event.target) && !replaceAllInSearch)
    return false;
  event.preventDefault();
  shortcut();
  return true;
}

export function useShortcuts(handlers: GlobalShortcutHandlers) {
  return useEventListener(window, "keydown", (event) => handleGlobalShortcut(event, handlers));
}
