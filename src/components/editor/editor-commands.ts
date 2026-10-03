import { history } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  Compartment,
  type Extension,
  type SelectionRange,
  type StateEffect,
  type Transaction,
} from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { ref } from "vue";

/**
 * `@codemirror/commands`' `defaultKeymap` includes the Emacs-style `Ctrl-o`
 * binding (`splitLine`), which on macOS collides with this app's global
 * "open a book" shortcut (`Mod-o`/`Ctrl-o`, see `use-shortcuts.ts`): the
 * editor's own keydown handling runs before that `window`-level listener, so
 * without this override, opening a book while the editor is focused would
 * first split the current line — mutating and dirtying the document — before
 * the app's shortcut ever ran, sending the "open" flow straight into an
 * unwanted unsaved-changes prompt. Spread this ahead of `defaultKeymap` in
 * every CodeMirror instance so `Mod-o`/`Ctrl-o` is a no-op for CodeMirror
 * (`preventDefault` only, no document change) and the keydown still bubbles
 * to `window` for the app's own shortcut to handle.
 */
export const preserveOpenShortcutKeymap: KeyBinding[] = [
  { key: "Mod-o", run: () => true },
  { key: "Ctrl-o", run: () => true },
];

/** Editor states are deliberately kept outside Pinia's reactive book model. */
export const chapterEditorStates = new Map<string, EditorState>();
const chapterEditorCompartments = new Map<string, Compartment>();
/** Backwards-compatible descriptive alias for consumers that own the editor lifecycle. */
export const editorStates = chapterEditorStates;
/** Mounted views, kept alongside the states so edits can reach a live editor. */
export const chapterEditorViews = new Map<string, EditorView>();

export function registerChapterEditorView(chapterId: string, view: EditorView): void {
  chapterEditorViews.set(chapterId, view);
  chapterEditorTick.value++;
}

export function unregisterChapterEditorView(chapterId: string, view: EditorView): void {
  if (chapterEditorViews.get(chapterId) !== view) return;
  chapterEditorViews.delete(chapterId);
  chapterEditorTick.value++;
}

/**
 * A mounted view is the source of truth: only doc changes are mirrored back
 * into chapterEditorStates, so the map lags behind after any other transaction
 * and building on it would dispatch a transaction that does not start from the
 * view's current state.
 */
function currentChapterEditorState(chapterId: string): EditorState | undefined {
  return chapterEditorViews.get(chapterId)?.state ?? chapterEditorStates.get(chapterId);
}

function applyChapterEditorChanges(
  chapterId: string,
  changes:
    | Array<{ from: number; to: number; insert: string }>
    | { from: number; to: number; insert: string },
): EditorState | null {
  const state = currentChapterEditorState(chapterId);
  if (!state) return null;
  const transaction = state.update({ changes });
  chapterEditorViews.get(chapterId)?.dispatch(transaction);
  chapterEditorStates.set(chapterId, transaction.state);
  return transaction.state;
}

export function replaceChapterEditorText(
  chapterId: string,
  changes: Array<{ from: number; to: number; insert: string }>,
): string {
  const state = applyChapterEditorChanges(chapterId, changes);
  if (!state) throw new Error(`Editor state not found for ${chapterId}`);
  return state.doc.toString();
}

/**
 * Push a model-side edit into the chapter's editor. Without it the editor keeps
 * showing the old text and writes it back over the model on the next keystroke.
 * A chapter with no editor yet needs nothing: it mounts from the model.
 */
export function syncChapterEditorText(chapterId: string, source: string): void {
  const state = currentChapterEditorState(chapterId);
  if (!state || state.doc.toString() === source) return;
  applyChapterEditorChanges(chapterId, { from: 0, to: state.doc.length, insert: source });
}

export function resetChapterEditors(): void {
  chapterEditorStates.clear();
  chapterEditorCompartments.clear();
  chapterEditorViews.clear();
}

export function createChapterEditor(
  chapterId: string,
  source: string,
  extensions: Extension[] = [],
): EditorState {
  const existing = chapterEditorStates.get(chapterId);
  if (existing) return existing;
  const compartment = new Compartment();
  chapterEditorCompartments.set(chapterId, compartment);
  const state = EditorState.create({
    doc: source,
    extensions: [history(), compartment.of(extensions)],
  });
  chapterEditorStates.set(chapterId, state);
  return state;
}

/** Rebind view-specific listeners while retaining the chapter's undo history. */
export function reconfigureChapterEditor(
  chapterId: string,
  extensions: Extension[],
): StateEffect<unknown> | null {
  return chapterEditorCompartments.get(chapterId)?.reconfigure(extensions) ?? null;
}

function markerFor(value: "*" | "**" | "bold" | "italic"): "*" | "**" {
  return value === "bold" ? "**" : value === "italic" ? "*" : value;
}

function selectedRange(state: EditorState, range?: Pick<SelectionRange, "from" | "to">) {
  return range ?? state.selection.main;
}

/** Return a transaction that toggles NovLang emphasis around the selected text. */
export function toggleMarkup(
  state: EditorState,
  markup: "*" | "**" | "bold" | "italic",
  range?: Pick<SelectionRange, "from" | "to">,
): Transaction {
  const marker = markerFor(markup);
  const { from, to } = selectedRange(state, range);
  const selected = state.sliceDoc(from, to);
  const before = state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));

  if (before === marker && after === marker) {
    return state.update({
      changes: [
        { from: from - marker.length, to: from, insert: "" },
        { from: to, to: to + marker.length, insert: "" },
      ],
      selection: EditorSelection.range(from - marker.length, to - marker.length),
    });
  }

  if (
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length >= marker.length * 2
  ) {
    return state.update({
      changes: { from, to, insert: selected.slice(marker.length, -marker.length) },
      selection: EditorSelection.range(from, to - marker.length * 2),
    });
  }

  if (from === to) {
    return state.update({
      changes: { from, to, insert: marker + marker },
      selection: EditorSelection.cursor(from + marker.length),
    });
  }

  return state.update({
    changes: { from, to, insert: marker + selected + marker },
    selection: EditorSelection.range(from + marker.length, to + marker.length),
  });
}

function nextFootnoteNumber(source: string): number {
  const used = new Set<number>();
  for (const match of source.matchAll(/\[\^(\d+)\]/g)) used.add(Number(match[1]));
  let number = 1;
  while (used.has(number)) number++;
  return number;
}

/** Insert a reference at the cursor and an empty definition at the end of the chapter. */
export function insertFootnote(state: EditorState): Transaction {
  const source = state.doc.toString();
  const number = nextFootnoteNumber(source);
  const reference = `[^${number}]`;
  const { from, to } = state.selection.main;
  const suffix = source.length === 0 ? "" : source.endsWith("\n\n") ? "" : "\n";
  const definition = `${suffix}[^${number}]: `;
  const finalLength = source.length - (to - from) + reference.length + definition.length;
  return state.update({
    changes: [
      { from, to, insert: reference },
      { from: source.length, to: source.length, insert: definition },
    ],
    selection: EditorSelection.cursor(finalLength),
  });
}

/** Bumped by SourceEditor on selection or text changes, so toolbars can recompute. */
export const chapterEditorTick = ref(0);

/** NovLang allows `# ` only on a chapter's first line. */
export function toggleHeading(state: EditorState): Transaction {
  const first = state.doc.line(1);
  return first.text.startsWith("# ")
    ? state.update({ changes: { from: 0, to: 2, insert: "" } })
    : state.update({ changes: { from: 0, insert: "# " } });
}

export function toggleBlockquote(state: EditorState): Transaction {
  const { from, to } = state.selection.main;
  const lines = [];
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++)
    lines.push(state.doc.line(n));
  const filled = lines.filter((line) => line.text.trim() !== "");
  const quoted = filled.length > 0 && filled.every((line) => line.text.startsWith(">"));
  const changes = filled.map((line) =>
    quoted
      ? { from: line.from, to: line.from + (line.text.startsWith("> ") ? 2 : 1), insert: "" }
      : { from: line.from, insert: "> " },
  );
  return state.update({ changes });
}

function paragraphAt(state: EditorState, block: string, cursorOffset: number): Transaction {
  const { from, to } = state.selection.main;
  const before = state.sliceDoc(0, from);
  const after = state.sliceDoc(to);
  const prefix =
    before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insert = `${prefix}${block}${suffix}`;
  return state.update({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + prefix.length + cursorOffset),
  });
}

export function insertSceneBreak(state: EditorState): Transaction {
  const tr = paragraphAt(state, "***", 3);
  const end = tr.state.selection.main.head;
  const after = tr.state.sliceDoc(end, end + 2);
  // Continue typing in the paragraph after the break.
  return state.update({
    changes: tr.changes,
    selection: EditorSelection.cursor(after === "\n\n" ? end + 2 : end),
  });
}

/** The cursor lands inside `[]` so the author can type the alt text. */
export function insertImageReference(state: EditorState, path: string): Transaction {
  return paragraphAt(state, `![](${path})`, 2);
}

export function activeMarkup(state: EditorState): { bold: boolean; italic: boolean } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const offset = head - line.from;
  const result = { bold: false, italic: false };
  for (const match of line.text.matchAll(/\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g)) {
    const start = match.index!;
    if (offset <= start || offset >= start + match[0].length) continue;
    if (match[1] !== undefined) return { bold: true, italic: true };
    if (match[2] !== undefined) result.bold = true;
    if (match[3] !== undefined) result.italic = true;
  }
  return result;
}
