import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  selectMatches,
  setSearchQuery,
  SearchQuery as CmSearchQuery,
} from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { runScopeHandlers, type EditorView, type Panel, type ViewUpdate } from "@codemirror/view";
import {
  buildChapterQuery,
  countMatches,
  type ChapterSearchInput,
  type MatchCount,
} from "./chapter-search";

export interface ChapterSearchLabels {
  search: string;
  replace: string;
  previous: string;
  next: string;
  matchCase: string;
  wholeWord: string;
  regex: string;
  replaceOne: string;
  replaceAll: string;
  close: string;
  noResults: string;
  invalidRegex: string;
  counter(count: MatchCount): string;
}

type Translate = (key: string, fallback: string, params?: Record<string, unknown>) => string;

export function searchPanelLabels(t: Translate): ChapterSearchLabels {
  return {
    search: t("search.placeholder", "Search"),
    replace: t("search.replacePlaceholder", "Replace"),
    previous: t("search.previous", "Previous match"),
    next: t("search.next", "Next match"),
    matchCase: t("search.matchCase", "Match case"),
    wholeWord: t("search.wholeWordLabel", "Whole word"),
    regex: t("search.regexLabel", "Regular expression"),
    replaceOne: t("search.replaceOne", "Replace"),
    replaceAll: t("search.replaceAll", "Replace all"),
    close: t("search.close", "Close"),
    noResults: t("search.noResults", "No results"),
    invalidRegex: t("search.invalidRegex", "Invalid regular expression"),
    // vue-i18n fills the placeholders from params; the replace covers the
    // fallback text when no i18n plugin is installed.
    counter: ({ total, capped, current }) => {
      const shown = capped ? `${total}+` : String(total);
      return current === null
        ? t("search.counterTotal", "{total} matches", { total: shown }).replace("{total}", shown)
        : t("search.counter", "{current} of {total}", { current, total: shown })
            .replace("{current}", String(current))
            .replace("{total}", shown);
    },
  };
}

const emptyInput: ChapterSearchInput = {
  text: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  replace: "",
};
// The panel is recreated on every open; this keeps its toggles between opens.
const lastInputs = new WeakMap<EditorView, ChapterSearchInput>();

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

class ChapterSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private input: ChapterSearchInput;
  private applied: CmSearchQuery | null = null;
  private invalid = false;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly counter: HTMLElement;
  private readonly toggles: Record<"caseSensitive" | "wholeWord" | "regex", HTMLButtonElement>;

  constructor(
    private readonly view: EditorView,
    private readonly labels: ChapterSearchLabels,
  ) {
    this.input = this.adopt(getSearchQuery(view.state));
    this.searchField = element("input", {
      class: "cm-textfield",
      name: "search",
      "main-field": "true",
      placeholder: labels.search,
      "aria-label": labels.search,
    });
    this.replaceField = element("input", {
      class: "cm-textfield",
      name: "replace",
      placeholder: labels.replace,
      "aria-label": labels.replace,
    });
    this.searchField.value = this.input.text;
    this.replaceField.value = this.input.replace;
    this.counter = element("span", {
      class: "cm-search-counter",
      "data-search-counter": "",
      "aria-live": "polite",
    });
    const toggle = (key: "caseSensitive" | "wholeWord" | "regex", text: string, label: string) => {
      const button = element(
        "button",
        { type: "button", class: "cm-button", "aria-label": label, title: label },
        text,
      );
      button.addEventListener("click", () => {
        this.input = { ...this.input, [key]: !this.input[key] };
        this.commit();
      });
      return button;
    };
    this.toggles = {
      caseSensitive: toggle("caseSensitive", "Aa", labels.matchCase),
      wholeWord: toggle("wholeWord", "ab", labels.wholeWord),
      regex: toggle("regex", ".*", labels.regex),
    };
    const command = (text: string, label: string, name: string, run: () => void) => {
      const button = element(
        "button",
        { type: "button", class: "cm-button", name, "aria-label": label, title: label },
        text,
      );
      button.addEventListener("click", run);
      return button;
    };
    this.dom = element(
      "div",
      { class: "cm-search cm-chapter-search" },
      element(
        "div",
        { class: "cm-chapter-search-row" },
        this.searchField,
        this.toggles.caseSensitive,
        this.toggles.wholeWord,
        this.toggles.regex,
        this.counter,
        command("↑", labels.previous, "prev", () => findPrevious(view)),
        command("↓", labels.next, "next", () => findNext(view)),
        command("×", labels.close, "close", () => closeSearchPanel(view)),
      ),
      element(
        "div",
        { class: "cm-chapter-search-row" },
        this.replaceField,
        command(labels.replaceOne, labels.replaceOne, "replace", () => replaceNext(view)),
        command(labels.replaceAll, labels.replaceAll, "replaceAll", () => replaceAll(view)),
      ),
    );
    this.searchField.addEventListener("input", () => {
      this.input = { ...this.input, text: this.searchField.value };
      this.commit();
    });
    this.replaceField.addEventListener("input", () => {
      this.input = { ...this.input, replace: this.replaceField.value };
      this.commit();
    });
    this.dom.addEventListener("keydown", (event) => this.keydown(event));
  }

  mount() {
    // `mount` runs inside a view update, where dispatching throws; apply our
    // query (with its whole-word / case rules) right after it.
    queueMicrotask(() => {
      if (this.dom.isConnected) this.commit();
    });
  }

  update(update: ViewUpdate) {
    for (const transaction of update.transactions)
      for (const effect of transaction.effects)
        if (effect.is(setSearchQuery) && effect.value !== this.applied) {
          // Mod+F with a selection while the panel is open.
          this.input = this.adopt(effect.value);
          this.searchField.value = this.input.text;
          this.commit();
          return;
        }
    if (update.docChanged || update.selectionSet) this.renderCounter();
  }

  /** Our own query keeps its toggles; anything else (a selection) becomes plain text. */
  private adopt(query: CmSearchQuery): ChapterSearchInput {
    const last = lastInputs.get(this.view) ?? emptyInput;
    const built = buildChapterQuery(last);
    if ("query" in built && built.query.eq(query)) return { ...last };
    return { ...last, text: query.search, regex: false };
  }

  private commit() {
    const built = buildChapterQuery(this.input);
    this.invalid = "error" in built;
    this.applied = "query" in built ? built.query : new CmSearchQuery({ search: "" });
    lastInputs.set(this.view, this.input);
    for (const [key, button] of Object.entries(this.toggles))
      button.setAttribute("aria-pressed", String(this.input[key as keyof typeof this.toggles]));
    this.view.dispatch({ effects: setSearchQuery.of(this.applied) });
    this.renderCounter();
  }

  private renderCounter() {
    if (this.invalid) this.counter.textContent = this.labels.invalidRegex;
    else if (!this.input.text || !this.applied) this.counter.textContent = "";
    else {
      const count = countMatches(this.view.state, this.applied);
      this.counter.textContent = count.total ? this.labels.counter(count) : this.labels.noResults;
    }
    this.counter.classList.toggle(
      "cm-search-counter-empty",
      this.invalid || this.counter.textContent === this.labels.noResults,
    );
  }

  private keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && event.target === this.searchField) {
      event.preventDefault();
      if (event.altKey) selectMatches(this.view);
      else (event.shiftKey ? findPrevious : findNext)(this.view);
    } else if (event.key === "Enter" && event.target === this.replaceField) {
      event.preventDefault();
      replaceNext(this.view);
    } else if (runScopeHandlers(this.view, event, "search-panel")) {
      event.preventDefault();
    }
  }
}

/** CodeMirror search with our panel: live counter, book-search word rules, localized. */
export function chapterSearch(labels: () => ChapterSearchLabels): Extension {
  return search({ top: true, createPanel: (view) => new ChapterSearchPanel(view, labels()) });
}
