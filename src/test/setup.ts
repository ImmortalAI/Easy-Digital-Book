import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// happy-dom fires `selectionchange` synchronously on every Selection call, while
// browsers queue one event per actual change. CodeMirror (6.43.14+) re-enters
// EditorView.update when the event arrives while it writes the DOM selection,
// so queue the event, coalesce repeats and skip it when nothing changed.
const dispatchDocumentEvent = document.dispatchEvent.bind(document);
let selectionChangeQueued = false;
let lastSelection: unknown[] = [];
document.dispatchEvent = (event: Event): boolean => {
  if (event.type !== "selectionchange") return dispatchDocumentEvent(event);
  if (selectionChangeQueued) return true;
  selectionChangeQueued = true;
  queueMicrotask(() => {
    selectionChangeQueued = false;
    const sel = document.getSelection();
    const current = [sel?.anchorNode, sel?.anchorOffset, sel?.focusNode, sel?.focusOffset];
    if (current.every((value, i) => value === lastSelection[i])) return;
    lastSelection = current;
    dispatchDocumentEvent(event);
  });
  return true;
};
