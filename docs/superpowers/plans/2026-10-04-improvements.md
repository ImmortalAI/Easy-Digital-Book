# Improvements (2026-10-04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight problems the user found on 2026-10-04: dark "paper" preview with an original-look toggle, Tab in the CSS editor, a chapter search panel with a match counter, the preview's bottom gutter, choosing a cover from the book's images, single-image rename without a number, a block-quote style in the book theme, and the book title (not the file path) in the top-left corner with "Show in folder".

**Architecture:** Each item is a small change inside the existing structure. Preview look is a preview-only CSS layer built from the app's theme tokens (`components/editor/preview-theme.ts`), switched by two app settings. The chapter search panel replaces CodeMirror's stock panel through `search({ createPanel })` and builds its regexp with the same `querySource()` as the book search. Book changes stay pure `BookMutation` builders in `services/book/`.

**Tech Stack:** Vue 3, TypeScript, Pinia, CodeMirror 6 (`@codemirror/search` 6.7, `@codemirror/autocomplete`, `@codemirror/commands`), Tailwind CSS 4, shadcn-vue on Reka UI, `@tabler/icons-vue`, Vitest + @testing-library/vue + happy-dom, Playwright, Oxfmt, Oxlint.

**Spec:** `docs/superpowers/notes/2026-10-04-issues.md` (items 1–8 with the user's decisions). Base spec: `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`. The spell checker spec (`docs/superpowers/specs/2026-10-04-spell-checker-design.md`) is roadmap and **not** part of this plan.

## Global Constraints

- Branch: `feat/improvements-2026-10-04` (already exists, holds the notes and the spell checker spec). Every task commits on it.
- Every task ends with `pnpm check` passing (vue-tsc, Oxlint, `oxfmt --check`, Vitest). Tasks 3, 6 and 11 also run `pnpm test:e2e`. No task commits red.
- `services/**` and `utils/**` import nothing from `vue`, `pinia` or `@tauri-apps/*` (Oxlint `no-restricted-imports`).
- Every user-visible string exists in `src/locales/{ru,en,zh-CN}.json`; `src/plugins/__tests__/i18n.test.ts` fails on a missing key. Translations to use are given in each task.
- `theme.css` (goes into the EPUB) gets **no colours**. Paper colours, image dimming and the preview gutter are preview-only.
- Icons come from `@tabler/icons-vue`; icon-only controls have an accessible name; decorative icons carry `aria-hidden="true"`.
- `src/assets/style.css` keeps its shape: `@import`s, `@theme inline`, `:root`, `.dark`, `@layer base` only.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A user `custom.css` that sets `body { color: #000 }` under the dark theme.** Expected: the user's rule still wins (paper layer comes before `custom.css`), and the "original look" toggle shows it readable on white. Task 2 pins the order with a test.
- **Switching the app theme while the preview is open.** Expected: paper colours follow the new theme without reloading the frame and without a white flash; under the light theme the toggles disappear and the status-bar notice hides. Tasks 2 and 3 pin this.
- **Search text with regexp metacharacters or `$` in the replacement while regex mode is off** (`a.b`, `(x)`, replace `$1`). Expected: matched and replaced literally. Task 5 pins this.
- **Renaming a single image to the name it already has** (opened with its name prefilled, user presses Enter). Expected: nothing happens, the Rename button is disabled, no undo toast. Task 7 pins this.
- **First save of an untitled book when the dialog is cancelled or the write fails.** Expected: cancel leaves the title untouched; a failed write keeps the new title as an unsaved change (dirty), no data loss. Task 11 pins the cancel case.

## File Structure

| Area           | Files                                                                                                                         | Responsibility                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Preview CSS    | `src/assets/epub/preview.css.ts`, `src/assets/epub/preview-paper.css.ts` (new)                                                | preview gutter; paper and dim-images layers         |
| Preview look   | `src/components/editor/preview-theme.ts` (new), `src/components/editor/PreviewPane.vue`                                       | app tokens → paper variables; frame styles, toggles |
| Settings       | `src/stores/settings.ts`                                                                                                      | `preview: { paperStyle, dimImages }`                |
| Status/keys    | `src/components/layout/StatusBar.vue`, `src/composables/use-shortcuts.ts`, `src/views/EditorView.vue`                         | styled-preview notice, Mod+Alt+P                    |
| CSS editor     | `src/components/editor/css-language.ts`                                                                                       | Tab accepts completion / indents                    |
| Search         | `src/services/search/query.ts`, `src/components/editor/{chapter-search.ts,chapter-search-panel.ts}` (new), `editor-theme.ts`  | shared regexp source, counter, own panel            |
| Rename         | `src/services/book/rename-resources.ts`, `src/components/images/RenameImagesDialog.vue`                                       | single vs batch naming, dialog                      |
| Cover          | `src/components/editor/ImagePickerPopover.vue`, `src/components/metadata/CoverPicker.vue`                                     | pick a cover from book images                       |
| Image actions  | `src/components/editor/ImageView.vue`, `src/components/images/ImageGallery.vue`                                               | Set as cover, Rename… in the image page and bar     |
| Theme          | `src/assets/epub/theme.css.ts`, `src/assets/epub/custom.css.ts`                                                               | block-quote rule, template hint                     |
| Title / reveal | `src/services/book/create.ts`, `src/composables/use-project-files.ts`, `src/components/layout/FileMenu.vue`, `EditorView.vue` | title in corner, title from file name, reveal       |
| Docs           | notes, `AGENTS.md`, base spec, `README.md`                                                                                    | record decisions                                    |

---

### Task 1: Preview gutter

**Files:**

- Modify: `src/assets/epub/preview.css.ts`
- Test: `src/components/editor/__tests__/PreviewPane.test.ts`

**Interfaces:**

- Produces: `previewCss` = `body { max-width: 36em; margin: 0 auto; padding: 1.5em 1.5em 4em; }`.

- [ ] **Step 1: Write the failing test** — add to `describe("PreviewPane security and rendering")`:

```ts
it("keeps the text off the pane edges", async () => {
  const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
  await wrapper.vm.$nextTick();
  expect(wrapper.get("iframe").attributes("srcdoc")).toContain(
    "body { max-width: 36em; margin: 0 auto; padding: 1.5em 1.5em 4em; }",
  );
  wrapper.unmount();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/components/editor/__tests__/PreviewPane.test.ts -t "pane edges"`
Expected: FAIL (srcdoc has `margin: auto; }`).

- [ ] **Step 3: Implement** — `src/assets/epub/preview.css.ts`:

```ts
// `margin: auto` would also zero the vertical margins (auto resolves to 0 in
// block flow), leaving the last line on the pane's bottom edge.
export const previewCss = `body { max-width: 36em; margin: 0 auto; padding: 1.5em 1.5em 4em; }`;
```

- [ ] **Step 4: Run the file's tests** — `pnpm vitest run src/components/editor/__tests__/PreviewPane.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assets/epub/preview.css.ts src/components/editor/__tests__/PreviewPane.test.ts
git commit -m "fix(preview): add a gutter around the preview text"
```

---

### Task 2: Dark paper preview with toggles

**Files:**

- Modify: `src/stores/settings.ts`
- Create: `src/assets/epub/preview-paper.css.ts`
- Create: `src/components/editor/preview-theme.ts`
- Modify: `src/components/editor/PreviewPane.vue`
- Modify: `src/locales/{ru,en,zh-CN}.json`
- Test: `src/stores/__tests__/stores.test.ts`, `src/components/editor/__tests__/preview-theme.test.ts` (new), `src/components/editor/__tests__/PreviewPane.test.ts`

**Interfaces:**

- Produces (settings store): `interface PreviewSettings { paperStyle: boolean; dimImages: boolean }`; `settings.preview: Ref<PreviewSettings>` (default both `true`); `settings.setPreview(patch: Partial<PreviewSettings>): Promise<void>` (updates and persists key `"preview"`).
- Produces (`preview-theme.ts`): `interface AppTokens { background; foreground; mutedForeground; border; ring: string }`; `readAppTokens(root?: Element): AppTokens`; `paperBackground(tokens): string`; `previewLookCss(look: { dimImages: boolean; tokens: AppTokens } | null): string`.
- Produces (`preview-paper.css.ts`): `previewPaperCss`, `previewDimImagesCss`.

- [ ] **Step 1: Settings store test** — add to `src/stores/__tests__/stores.test.ts` (adapt imports to the file's existing ones: `createPinia`, `setActivePinia`, `useSettingsStore`, `createInMemoryPlatformServices`):

```ts
it("remembers the preview look across loads", async () => {
  const services = createInMemoryPlatformServices();
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  settings.configure(services.settings);
  await settings.load();
  expect(settings.preview).toEqual({ paperStyle: true, dimImages: true });

  await settings.setPreview({ paperStyle: false });

  setActivePinia(createPinia());
  const reloaded = useSettingsStore();
  reloaded.configure(services.settings);
  await reloaded.load();
  expect(reloaded.preview).toEqual({ paperStyle: false, dimImages: true });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/stores/__tests__/stores.test.ts -t "preview look"` → FAIL (`preview` undefined).

- [ ] **Step 3: Implement in `src/stores/settings.ts`**

```ts
export interface PreviewSettings {
  /** Dark "old paper" look of the preview under the dark theme. */
  paperStyle: boolean;
  /** Dim images in the paper look so white illustrations don't glare. */
  dimImages: boolean;
}
const defaultPreview: PreviewSettings = { paperStyle: true, dimImages: true };
```

Inside the store: `preview = ref<PreviewSettings>({ ...defaultPreview })` next to the other refs; in `load()`:

```ts
preview.value = {
  ...defaultPreview,
  ...(await repository?.get<Partial<PreviewSettings>>("preview", {})),
};
```

in `persist()`: `await repository?.set("preview", preview.value);`; new action:

```ts
async function setPreview(patch: Partial<PreviewSettings>) {
  preview.value = { ...preview.value, ...patch };
  await repository?.set("preview", preview.value);
}
```

Return `preview` and `setPreview` from the store.

- [ ] **Step 4: Run** the stores test → PASS.

- [ ] **Step 5: preview-theme tests** — create `src/components/editor/__tests__/preview-theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { themeCss } from "@/assets/epub/theme.css";
import { paperBackground, previewLookCss, readAppTokens } from "@/components/editor/preview-theme";

const tokens = {
  background: "oklch(0.1 0 0)",
  foreground: "oklch(0.9 0 0)",
  mutedForeground: "oklch(0.7 0 0)",
  border: "oklch(1 0 0 / 10%)",
  ring: "oklch(0.5 0 0)",
};

describe("preview look", () => {
  it("is empty when the paper style is off", () => {
    expect(previewLookCss(null)).toBe("");
  });

  it("derives the paper colours from the app tokens", () => {
    const css = previewLookCss({ dimImages: false, tokens });
    expect(css).toContain(`--paper-bg: ${paperBackground(tokens)}`);
    expect(paperBackground(tokens)).toContain("oklch(0.1 0 0)");
    expect(css).toContain("--paper-muted: oklch(0.7 0 0)");
    expect(css).toContain("color-scheme: dark");
    expect(css).not.toContain("filter:");
  });

  it("dims images only when asked", () => {
    expect(previewLookCss({ dimImages: true, tokens })).toContain("img { filter:");
  });

  it("falls back to the dark palette when the tokens can't be read", () => {
    expect(readAppTokens(document.createElement("div")).background).toMatch(/^oklch\(/);
  });

  it("never leaks into the EPUB theme", () => {
    expect(themeCss).not.toContain("--paper");
    expect(themeCss).not.toContain("filter");
  });
});
```

- [ ] **Step 6: Run** `pnpm vitest run src/components/editor/__tests__/preview-theme.test.ts` → FAIL (module missing).

- [ ] **Step 7: Create `src/assets/epub/preview-paper.css.ts`**

```ts
/**
 * Preview-only "dark old paper" layer. Never added to the EPUB: readers set
 * their own colours. Values come from the --paper-* variables that
 * components/editor/preview-theme.ts derives from the app's theme tokens.
 */
export const previewPaperCss = `:root { color-scheme: dark; }
html { background: var(--paper-bg); }
body { color: var(--paper-fg); }
h1, section.endnotes-chapter h2 { color: var(--paper-accent); }
a, a.noteref, a.endnote-backlink { color: var(--paper-link); }
blockquote, p.novlang-scene-break { color: var(--paper-muted); }
section.preview-notes { border-top-color: var(--paper-border); }
::selection { background: var(--paper-selection); }`;

export const previewDimImagesCss = `img { filter: brightness(0.8) sepia(0.15); }`;
```

- [ ] **Step 8: Create `src/components/editor/preview-theme.ts`**

```ts
import { previewDimImagesCss, previewPaperCss } from "@/assets/epub/preview-paper.css";

/** The app theme colours the preview borrows; the iframe can't see the parent's variables. */
export interface AppTokens {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  ring: string;
}

// The `.dark` values from src/assets/style.css, for when they can't be read.
const fallbackDark: AppTokens = {
  background: "oklch(0.148 0.004 228.8)",
  foreground: "oklch(0.987 0.002 197.1)",
  mutedForeground: "oklch(0.723 0.014 214.4)",
  border: "oklch(1 0 0 / 10%)",
  ring: "oklch(0.56 0.021 213.5)",
};

/** A faint warm tint that turns the app background into "old paper". */
const PAPER_TINT = "#8a6a3a";
const INK_TINT = "#e8d9b5";

export function readAppTokens(root: Element = document.documentElement): AppTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--background", fallbackDark.background),
    foreground: read("--foreground", fallbackDark.foreground),
    mutedForeground: read("--muted-foreground", fallbackDark.mutedForeground),
    border: read("--border", fallbackDark.border),
    ring: read("--ring", fallbackDark.ring),
  };
}

export function paperBackground(tokens: AppTokens): string {
  return `color-mix(in oklch, ${tokens.background} 90%, ${PAPER_TINT})`;
}

function paperVariables(tokens: AppTokens): string {
  return `:root { --paper-bg: ${paperBackground(tokens)}; --paper-fg: color-mix(in oklch, ${tokens.foreground} 88%, ${INK_TINT}); --paper-accent: oklch(0.8 0.06 80); --paper-link: oklch(0.72 0.08 70); --paper-muted: ${tokens.mutedForeground}; --paper-border: ${tokens.border}; --paper-selection: color-mix(in oklch, ${tokens.ring} 45%, transparent); }`;
}

/** The preview-only look layer; empty when the paper style is off. */
export function previewLookCss(look: { dimImages: boolean; tokens: AppTokens } | null): string {
  if (!look) return "";
  return [paperVariables(look.tokens), previewPaperCss, look.dimImages ? previewDimImagesCss : ""]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 9: Run** the preview-theme tests → PASS.

- [ ] **Step 10: PreviewPane tests** — add to `PreviewPane.test.ts` (import `useSettingsStore` from `@/stores/settings`; `fakeFrame` mirrors the existing fake `contentDocument` in the "updates the retained iframe body" test):

```ts
function fakeFrame(iframe: HTMLIFrameElement) {
  const style = { textContent: "" };
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    value: {
      body: { innerHTML: "" },
      head: { querySelector: () => style },
      documentElement: { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  iframe.dispatchEvent(new Event("load"));
  return style;
}

it("paints the paper look under the dark theme and switches it off in place", async () => {
  useSettingsStore().theme = "dark";
  const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" }, attachTo: document.body });
  await wrapper.vm.$nextTick();
  expect(wrapper.get("iframe").attributes("srcdoc")).toContain("--paper-bg");
  const style = fakeFrame(wrapper.get("iframe").element as HTMLIFrameElement);

  await wrapper.get('button[aria-label="Paper style"]').trigger("click");
  await wrapper.vm.$nextTick();

  expect(style.textContent).not.toContain("--paper-bg");
  expect(wrapper.findAll("iframe")).toHaveLength(1);
  expect(wrapper.get('button[aria-label="Dim images"]').attributes()).toHaveProperty("disabled");
  wrapper.unmount();
});

it("puts the user's custom.css after the paper layer", async () => {
  useSettingsStore().theme = "dark";
  useProjectStore().book!.customCss = "body { color: #000; }";
  const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
  const srcdoc = wrapper.get("iframe").attributes("srcdoc")!;
  expect(srcdoc.indexOf("--paper-bg")).toBeLessThan(srcdoc.indexOf("body { color: #000; }"));
  wrapper.unmount();
});

it("shows neither the paper look nor its toggles under the light theme", async () => {
  useSettingsStore().theme = "light";
  const wrapper = mount(PreviewPane, { props: { chapterId: "chapter1" } });
  expect(wrapper.get("iframe").attributes("srcdoc")).not.toContain("--paper-bg");
  expect(wrapper.find('button[aria-label="Paper style"]').exists()).toBe(false);
  wrapper.unmount();
});
```

- [ ] **Step 11: Run** `pnpm vitest run src/components/editor/__tests__/PreviewPane.test.ts` → the three new tests FAIL.

- [ ] **Step 12: Implement in `PreviewPane.vue`.** Script additions:

```ts
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { IconBrightnessDown, IconPalette } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings";
import { useResolvedTheme } from "@/composables/use-theme";
import { paperBackground, previewLookCss, readAppTokens } from "./preview-theme";

const settings = useSettingsStore();
const resolvedTheme = useResolvedTheme();
const dark = computed(() => resolvedTheme.value === "dark");
const paper = computed(() => dark.value && settings.preview.paperStyle);
const tokens = shallowRef(readAppTokens());
// useTheme toggles `.dark` on <html> in its own effect; read the tokens after it.
watch(resolvedTheme, async () => {
  await nextTick();
  tokens.value = readAppTokens();
});
const frameStyle = computed(() =>
  paper.value ? { background: paperBackground(tokens.value) } : undefined,
);
function togglePaper() {
  void settings.setPreview({ paperStyle: !settings.preview.paperStyle });
}
function toggleDim() {
  void settings.setPreview({ dimImages: !settings.preview.dimImages });
}
```

Replace `styles()`:

```ts
// Order matters: the paper layer sits before custom.css (appended by the
// callers), so the author's rules still win and the preview shows them.
function styles() {
  const look = paper.value
    ? previewLookCss({ dimImages: settings.preview.dimImages, tokens: tokens.value })
    : "";
  return `${themeCss}\nsection.preview-notes { margin-top: 2em; padding-top: 0.75em; border-top: 1px solid #ddd; }\n${previewCss}\nbody { font-family: Georgia, 'Times New Roman', serif; }\n${look}`;
}
```

`renderPreview()` already calls `styles()` inside `watchEffect`, so it re-runs on `paper`, `settings.preview.dimImages` and `tokens` changes without reloading the frame. Template:

```vue
<template>
  <div class="preview-pane relative">
    <!-- Under the light theme the preview is the book's own look, so the
         toggles only exist under the dark theme. -->
    <div
      v-if="dark"
      class="absolute top-2 right-3 z-10 flex gap-1 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100"
      data-preview-look
    >
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-pressed="settings.preview.paperStyle"
        :aria-label="t('preview.paperStyle', 'Paper style')"
        :title="t('preview.paperStyleHint', 'Paper style (Mod+Alt+P). Off shows the original look')"
        @click="togglePaper"
      >
        <IconPalette aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="!settings.preview.paperStyle"
        :aria-pressed="settings.preview.dimImages"
        :aria-label="t('preview.dimImages', 'Dim images')"
        :title="t('preview.dimImages', 'Dim images')"
        @click="toggleDim"
      >
        <IconBrightnessDown aria-hidden="true" />
      </Button>
    </div>
    <!-- Paper-white under the light theme; the paper colour under the dark
         one, set on the element too so no white flashes before the frame loads. -->
    <iframe
      :class="paper ? undefined : 'bg-white'"
      :style="frameStyle"
      ref="frame"
      :srcdoc="initialPreviewDocument"
      sandbox="allow-same-origin"
      :title="t('toolbar.preview', 'Preview')"
    />
  </div>
</template>
```

Locale keys (new top-level group `preview` in each file):

| key                      | en                                                   | ru                                                                  | zh-CN                                     |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `preview.paperStyle`     | Paper style                                          | Стиль бумаги                                                        | 纸张样式                                  |
| `preview.paperStyleHint` | Paper style (Mod+Alt+P). Off shows the original look | Стиль бумаги (Mod+Alt+P). Выключите, чтобы увидеть оригинальный вид | 纸张样式（Mod+Alt+P）。关闭后显示原始外观 |
| `preview.dimImages`      | Dim images                                           | Приглушить изображения                                              | 调暗图片                                  |

- [ ] **Step 13: Run** `pnpm vitest run src/components/editor src/stores src/plugins` → PASS.

- [ ] **Step 14: `pnpm check`**, then commit:

```bash
git add src/stores/settings.ts src/assets/epub/preview-paper.css.ts src/components/editor/preview-theme.ts src/components/editor/PreviewPane.vue src/locales src/stores/__tests__/stores.test.ts src/components/editor/__tests__/preview-theme.test.ts src/components/editor/__tests__/PreviewPane.test.ts
git commit -m "feat(preview): dark paper look derived from the app theme, with toggles"
```

---

### Task 3: Styled-preview notice and Mod+Alt+P

**Files:**

- Modify: `src/components/layout/StatusBar.vue`, `src/composables/use-shortcuts.ts`, `src/views/EditorView.vue`, `src/assets/epub/custom.css.ts`, `README.md`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/components/layout/__tests__/StatusBar.test.ts`, `src/composables/__tests__/use-shortcuts.test.ts`

**Interfaces:**

- Consumes: `settings.preview`, `settings.setPreview` (Task 2); `useResolvedTheme()`.
- Produces: `StatusBar` prop `previewStyled?: boolean`, event `showOriginalPreview`; `GlobalShortcutHandlers.togglePaperStyle?: () => void`.

- [ ] **Step 1: Shortcut tests** — add to `use-shortcuts.test.ts`:

```ts
it("toggles the paper preview with Mod+Alt+P whatever character Alt types", () => {
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  document.body.append(editor);
  const togglePaperStyle = vi.fn<() => void>();

  // macOS turns Alt+P into "π", so the binding goes by the physical key.
  const event = eventFor(editor, "π", { code: "KeyP", altKey: true, cancelable: true });
  expect(handleGlobalShortcut(event, { togglePaperStyle })).toBe(true);
  expect(togglePaperStyle).toHaveBeenCalledOnce();
  expect(handleGlobalShortcut(eventFor(editor, "p", { code: "KeyP" }), { togglePaperStyle })).toBe(
    false,
  );
});
```

- [ ] **Step 2: StatusBar tests** — add to `StatusBar.test.ts` (add `import userEvent from "@testing-library/user-event";`):

```ts
it("says when the preview is styled and offers the original look", async () => {
  const { emitted } = render(StatusBar, {
    props: { saveState: "saved", counts: null, previewStyled: true },
  });

  await userEvent.click(screen.getByRole("button", { name: /styled preview/i }));

  expect(emitted("showOriginalPreview")).toHaveLength(1);
});

it("keeps quiet about the preview when it shows the original look", () => {
  render(StatusBar, { props: { saveState: "saved", counts: null, previewStyled: false } });

  expect(screen.queryByRole("button", { name: /styled preview/i })).toBeNull();
});
```

- [ ] **Step 3: Run** both files → new tests FAIL.

- [ ] **Step 4: Implement the shortcut** in `use-shortcuts.ts`: add `togglePaperStyle?: () => void;` to `GlobalShortcutHandlers`, and make the first branch of the chain:

```ts
  const shortcut =
    event.altKey && event.code === "KeyP"
      ? handlers.togglePaperStyle
      : event.altKey && key === "enter"
        ? handlers.replaceAll
        : // …the rest of the existing chain, unchanged
```

- [ ] **Step 5: Implement the notice** in `StatusBar.vue`. Props: add `previewStyled?: boolean;`. Emits: add `showOriginalPreview: [];`. Import `IconPalette` from `@tabler/icons-vue` and `Button` from `@/components/ui/button`. Replace the `<WarningsPopover …/>` line with:

```vue
<div class="flex min-w-0 items-center gap-2">
  <WarningsPopover :chapter-id="chapterId" @select="emit('selectWarning', $event)" />
  <Button
    v-if="previewStyled"
    variant="ghost"
    size="xs"
    class="min-w-0 font-normal text-muted-foreground"
    :title="t('preview.showOriginal', 'Show the original look')"
    @click="emit('showOriginalPreview')"
  >
    <IconPalette aria-hidden="true" />
    <span class="truncate">{{
      t("preview.styledNotice", "Styled preview — not how the book will look")
    }}</span>
  </Button>
</div>
```

- [ ] **Step 6: Wire `EditorView.vue`.** Import `useResolvedTheme` from `@/composables/use-theme`. Add:

```ts
const resolvedTheme = useResolvedTheme();
// The preview is on screen in Split and Preview modes of a chapter or custom.css.
const previewStyled = computed(
  () =>
    resolvedTheme.value === "dark" &&
    settings.preview.paperStyle &&
    canUseModes.value &&
    layout.mode !== "text" &&
    Boolean(previewChapterId.value),
);
function togglePaperStyle() {
  if (resolvedTheme.value !== "dark") return;
  void settings.setPreview({ paperStyle: !settings.preview.paperStyle });
}
```

Add `togglePaperStyle,` to the `useShortcuts({ … })` object. On `<StatusBar>` add `:preview-styled="previewStyled"` and `@show-original-preview="settings.setPreview({ paperStyle: false })"`.

- [ ] **Step 7: Template hint and README.** `custom.css.ts` — append inside the comment, before `*/`:

```
   Colours: most e-ink readers ignore them. Under the dark theme the preview
   uses a paper style; switch it off (Mod+Alt+P) to check your colours.
```

`README.md` → shortcuts table, add a row after "Find & replace in the chapter":

```
| Preview: paper style on / off | Mod+Alt+P                           |
```

Locale keys (group `preview`):

| key                    | en                                          | ru                                               | zh-CN                          |
| ---------------------- | ------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| `preview.styledNotice` | Styled preview — not how the book will look | Превью стилизовано — книга будет выглядеть иначе | 预览已套用样式——与成书外观不同 |
| `preview.showOriginal` | Show the original look                      | Показать оригинальный вид                        | 显示原始外观                   |

- [ ] **Step 8: Run** `pnpm check` and `pnpm test:e2e` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/layout/StatusBar.vue src/composables/use-shortcuts.ts src/views/EditorView.vue src/assets/epub/custom.css.ts README.md src/locales src/components/layout/__tests__/StatusBar.test.ts src/composables/__tests__/use-shortcuts.test.ts
git commit -m "feat(preview): status bar notice for the styled preview and Mod+Alt+P"
```

---

### Task 4: Tab in the CSS editor

**Files:**

- Modify: `src/components/editor/css-language.ts`
- Test: `src/components/editor/__tests__/css-language.test.ts`

**Interfaces:**

- Produces: in `cssEditingExtensions()` the keymap starts with `{ key: "Tab", run: acceptCompletion }`, then `indentWithTab`.

- [ ] **Step 1: Write the failing tests** — add to `css-language.test.ts`:

```ts
import { acceptCompletion } from "@codemirror/autocomplete";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";

function cssView(doc: string, cursor: number) {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: cssEditingExtensions(),
    }),
    parent: document.body,
  });
}

it("lets Tab accept a completion before anything else", () => {
  const view = cssView("p {}", 0);
  const tab = view.state
    .facet(keymap)
    .flat()
    .find((binding) => binding.key === "Tab");
  expect(tab?.run).toBe(acceptCompletion);
  view.destroy();
});

it("indents with Tab and outdents with Shift-Tab instead of leaving the editor", () => {
  const view = cssView("p {\ncolor: red;\n}", 5);
  runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Tab" }), "editor");
  expect(view.state.doc.line(2).text).toMatch(/^\s+color: red;$/);
  runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }), "editor");
  expect(view.state.doc.line(2).text).toBe("color: red;");
  view.destroy();
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/editor/__tests__/css-language.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `css-language.ts` import `acceptCompletion` from `@codemirror/autocomplete` and `indentWithTab` from `@codemirror/commands`; the keymap becomes:

```ts
    // Tab first accepts an open completion; otherwise it indents. Without these
    // the browser moves focus to the splitter. Esc then Tab still leaves the
    // editor from the keyboard (CodeMirror's tab-focus escape).
    keymap.of([
      { key: "Tab", run: acceptCompletion },
      indentWithTab,
      { key: "Mod-f", run: openSearchPanel },
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
    ]),
```

- [ ] **Step 4: Run** the file → PASS. `pnpm check` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/css-language.ts src/components/editor/__tests__/css-language.test.ts
git commit -m "fix(css-editor): Tab accepts completions and indents"
```

---

### Task 5: One matcher for chapter and book search; match counter

**Files:**

- Modify: `src/services/search/query.ts`
- Create: `src/components/editor/chapter-search.ts`
- Test: `src/components/editor/__tests__/chapter-search.test.ts` (new); existing `src/services/search` tests must stay green

**Interfaces:**

- Produces (`services/search/query.ts`): `querySource(query: SearchQuery): string` (regexp source with whole-word lookarounds, not validated); `compileQuery` uses it.
- Produces (`chapter-search.ts`):
  - `interface ChapterSearchInput extends SearchQuery { replace: string }`
  - `buildChapterQuery(input: ChapterSearchInput): { query: CmSearchQuery } | { error: "search.invalidRegex" }`
  - `MATCH_CAP = 1000`
  - `interface MatchCount { total: number; capped: boolean; current: number | null }`
  - `countMatches(state: EditorState, query: CmSearchQuery, cap?: number): MatchCount`
    (`CmSearchQuery` is `SearchQuery` from `@codemirror/search`, imported under that alias.)

- [ ] **Step 1: Write the failing tests** — create `chapter-search.test.ts`:

```ts
import { EditorState } from "@codemirror/state";
import { replaceAll, search, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createBook } from "@/services/book/create";
import { findInBook } from "@/services/search/find";
import {
  buildChapterQuery,
  countMatches,
  type ChapterSearchInput,
} from "@/components/editor/chapter-search";

const input = (patch: Partial<ChapterSearchInput>): ChapterSearchInput => ({
  text: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  replace: "",
  ...patch,
});

function matches(doc: string, query: ChapterSearchInput) {
  const built = buildChapterQuery(query);
  if ("error" in built) throw new Error(built.error);
  const cursor = built.query.getCursor(EditorState.create({ doc }));
  const found: string[] = [];
  for (let next = cursor.next(); !next.done; next = cursor.next())
    found.push(doc.slice(next.value.from, next.value.to));
  return found;
}

describe("chapter search query", () => {
  it("matches exactly what the book search matches", () => {
    const doc = "Кот котик кот-кот КОТ_ кот1 ёж Ёж";
    const book = createBook({
      locale: "en",
      now: "2026-01-01T00:00:00.000Z",
      newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
      newChapterId: () => "chapter1",
    });
    book.chapters[0]!.source = doc;
    for (const query of [
      input({ text: "кот", wholeWord: true }),
      input({ text: "кот", wholeWord: true, caseSensitive: true }),
      input({ text: "ёж" }),
      input({ text: "к.т", regex: true }),
    ]) {
      const inBook = findInBook(book, query);
      if ("error" in inBook) throw new Error(inBook.error);
      expect(matches(doc, query)).toEqual(inBook.map((result) => result.matched));
    }
  });

  it("treats metacharacters and $ literally outside regex mode", () => {
    const doc = "a.b axb (x) $1";
    expect(matches(doc, input({ text: "a.b" }))).toEqual(["a.b"]);
    expect(matches(doc, input({ text: "(x)" }))).toEqual(["(x)"]);
    const built = buildChapterQuery(input({ text: "a.b", replace: "$1\\n" }));
    if ("error" in built) throw new Error(built.error);
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [search()] }),
      parent: document.body,
    });
    view.dispatch({ effects: setSearchQuery.of(built.query) });
    replaceAll(view);
    expect(view.state.doc.toString()).toBe("$1\\n axb (x) $1");
    view.destroy();
  });

  it("reports an invalid regular expression", () => {
    expect(buildChapterQuery(input({ text: "(", regex: true }))).toEqual({
      error: "search.invalidRegex",
    });
  });
});

describe("countMatches", () => {
  const state = (doc: string, anchor = 0, head = anchor) =>
    EditorState.create({ doc, selection: { anchor, head } });
  const query = (text: string) => {
    const built = buildChapterQuery(input({ text }));
    if ("error" in built) throw new Error(built.error);
    return built.query;
  };

  it("counts all matches and knows which one is selected", () => {
    expect(countMatches(state("ab ab ab", 3, 5), query("ab"))).toEqual({
      total: 3,
      capped: false,
      current: 2,
    });
    expect(countMatches(state("ab ab ab", 1), query("ab")).current).toBeNull();
  });

  it("stops at the cap", () => {
    expect(countMatches(state("a".repeat(20)), query("a"), 5)).toEqual({
      total: 5,
      capped: true,
      current: null,
    });
  });

  it("counts nothing for an empty query", () => {
    expect(countMatches(state("abc"), query(""))).toEqual({
      total: 0,
      capped: false,
      current: null,
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/editor/__tests__/chapter-search.test.ts` → FAIL (module missing).

- [ ] **Step 3: Extract `querySource`** in `services/search/query.ts`:

```ts
/** The regexp source both searches use; whole-word means no letter, digit or _ around. */
export function querySource(query: SearchQuery): string {
  const source = query.regex ? query.text : escapeRegExp(query.text);
  return query.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])` : source;
}

/** Compile a query without leaking RegExp construction errors to callers. */
export function compileQuery(query: SearchQuery): RegExp | SearchError {
  if (!query.text) return new RegExp("(?!)", "gu");
  try {
    return new RegExp(querySource(query), `${query.caseSensitive ? "" : "i"}gu`);
  } catch {
    return { error: "search.invalidRegex" };
  }
}
```

- [ ] **Step 4: Create `src/components/editor/chapter-search.ts`**

```ts
import { SearchQuery as CmSearchQuery } from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import { compileQuery, querySource, type SearchQuery } from "@/services/search/query";

export interface ChapterSearchInput extends SearchQuery {
  replace: string;
}

/**
 * The chapter panel always hands CodeMirror a regexp built by the book
 * search's `querySource`, so Mod+F and Mod+Shift+F find the same matches.
 * Outside regex mode the replacement is literal: `$` is escaped and
 * `literal` stops CodeMirror from unquoting `\n`.
 */
export function buildChapterQuery(
  input: ChapterSearchInput,
): { query: CmSearchQuery } | { error: "search.invalidRegex" } {
  const compiled = compileQuery(input);
  if ("error" in compiled) return compiled;
  return {
    query: new CmSearchQuery({
      search: input.text ? querySource(input) : "",
      regexp: true,
      caseSensitive: input.caseSensitive,
      literal: !input.regex,
      replace: input.regex ? input.replace : input.replace.replace(/\$/g, "$$$$"),
    }),
  };
}

export const MATCH_CAP = 1000;

export interface MatchCount {
  total: number;
  capped: boolean;
  /** 1-based index of the match the main selection covers exactly. */
  current: number | null;
}

export function countMatches(
  state: EditorState,
  query: CmSearchQuery,
  cap = MATCH_CAP,
): MatchCount {
  if (!query.valid) return { total: 0, capped: false, current: null };
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current: number | null = null;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (total === cap) return { total, capped: true, current };
    total++;
    if (next.value.from === from && next.value.to === to) current = total;
  }
  return { total, capped: false, current };
}
```

- [ ] **Step 5: Run** `pnpm vitest run src/components/editor/__tests__/chapter-search.test.ts src/services/search` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/search/query.ts src/components/editor/chapter-search.ts src/components/editor/__tests__/chapter-search.test.ts
git commit -m "feat(search): share the regexp source between chapter and book search"
```

---

### Task 6: Chapter search panel

**Files:**

- Create: `src/components/editor/chapter-search-panel.ts`
- Modify: `src/components/editor/SourceEditor.vue`, `src/components/editor/CssEditor.vue`, `src/components/editor/editor-theme.ts`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/components/editor/__tests__/chapter-search-panel.test.ts` (new)

**Interfaces:**

- Consumes: `buildChapterQuery`, `countMatches`, `ChapterSearchInput` (Task 5).
- Produces:
  - `interface ChapterSearchLabels { search; replace; previous; next; matchCase; wholeWord; regex; replaceOne; replaceAll; close; noResults; invalidRegex: string; counter(count: MatchCount): string }`
  - `chapterSearch(labels: () => ChapterSearchLabels): Extension`
  - `searchPanelLabels(t: (key: string, fallback: string) => string): ChapterSearchLabels`

- [ ] **Step 1: Write the failing tests** — create `chapter-search-panel.test.ts`:

```ts
import { EditorState } from "@codemirror/state";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { chapterSearch, searchPanelLabels } from "@/components/editor/chapter-search-panel";

const labels = () => searchPanelLabels((_key, fallback) => fallback);
let view: EditorView | undefined;
afterEach(() => view?.destroy());

function open(doc: string, anchor = 0, head = anchor) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head },
      extensions: [chapterSearch(labels), keymap.of(searchKeymap)],
    }),
    parent: document.body,
  });
  openSearchPanel(view);
  const panel = view.dom.querySelector<HTMLElement>(".cm-chapter-search")!;
  const field = panel.querySelector<HTMLInputElement>("input[main-field]")!;
  const type = (value: string) => {
    field.value = value;
    field.dispatchEvent(new Event("input"));
  };
  const counter = () => panel.querySelector("[data-search-counter]")!.textContent;
  const button = (name: string) =>
    panel.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  return { panel, field, type, counter, button };
}

describe("chapter search panel", () => {
  it("counts matches live instead of offering 'select all'", () => {
    const { panel, type, counter } = open("cat cat dog cat");
    type("cat");
    expect(counter()).toBe("3 matches");
    expect(panel.querySelector('button[name="select"]')).toBeNull();
  });

  it("shows the position of the selected match", () => {
    const { field, type, counter } = open("cat cat dog cat");
    type("cat");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(counter()).toBe("1 of 3");
  });

  it("says when nothing matches and when the regexp is broken", () => {
    const { type, counter, button } = open("cat");
    type("dog");
    expect(counter()).toBe("No results");
    button("Regular expression").click();
    type("(");
    expect(counter()).toBe("Invalid regular expression");
  });

  it("applies whole-word with the book search's word boundaries", () => {
    const { type, counter, button } = open("кот котик кот-кот");
    button("Whole word").click();
    type("кот");
    expect(counter()).toBe("3 matches");
  });

  it("starts from the selected text", () => {
    const { field } = open("cat dog", 4, 7);
    expect(field.value).toBe("dog");
  });

  it("replaces all matches", () => {
    const { panel, type } = open("cat cat");
    type("cat");
    const replace = panel.querySelector<HTMLInputElement>('input[name="replace"]')!;
    replace.value = "dog";
    replace.dispatchEvent(new Event("input"));
    panel.querySelector<HTMLButtonElement>('button[name="replaceAll"]')!.click();
    expect(view!.state.doc.toString()).toBe("dog dog");
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/editor/__tests__/chapter-search-panel.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `src/components/editor/chapter-search-panel.ts`**

```ts
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

export function searchPanelLabels(
  t: (key: string, fallback: string) => string,
): ChapterSearchLabels {
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
    counter: ({ total, capped, current }) => {
      const shown = capped ? `${total}+` : String(total);
      return current === null
        ? t("search.counterTotal", "{total} matches").replace("{total}", shown)
        : t("search.counter", "{current} of {total}")
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
```

Notes for the implementer: `selectMatches` is kept on Alt+Enter only (no button), as decided. If Oxlint flags the `Object.entries` cast, replace the loop with three explicit `setAttribute` calls.

- [ ] **Step 4: Run** the panel tests → PASS. Every test types into the field before asserting, which commits synchronously, so the deferred `mount()` commit doesn't matter for them. Never dispatch from the constructor or synchronously from `mount()`/`update()`: CodeMirror throws "Calls to EditorView.update are not allowed while an update is in progress".

- [ ] **Step 5: Theme** — in `editor-theme.ts`, add to the theme object:

```ts
  ".cm-chapter-search": { display: "flex", flexDirection: "column", gap: "4px" },
  ".cm-chapter-search-row": { display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" },
  ".cm-panel .cm-button[aria-pressed=true]": {
    backgroundColor: "var(--accent)",
    borderColor: "var(--ring)",
  },
  ".cm-search-counter": { minWidth: "7em", color: "var(--muted-foreground)", fontSize: "0.85em" },
  ".cm-search-counter-empty": { color: "var(--destructive)" },
```

- [ ] **Step 6: Wire the editors.**
  - `SourceEditor.vue`: import `chapterSearch, searchPanelLabels` from `./chapter-search-panel`; in `editorExtensions()` add `chapterSearch(() => searchPanelLabels(t)),` right after `EditorView.lineWrapping,`. Keep `{ key: "Mod-f", run: openSearchPanel }` and `...searchKeymap`.
  - `CssEditor.vue`: import the same; add `chapterSearch(() => searchPanelLabels(t)),` after `...cssEditingExtensions(),`.
  - `useSafeI18n().t` takes `(key, fallback, params?)`; the 2-argument call matches.

- [ ] **Step 7: Locale keys** (group `search`, keep existing keys):

| key                   | en                   | ru                   | zh-CN                          |
| --------------------- | -------------------- | -------------------- | ------------------------------ |
| `search.previous`     | Previous match       | Предыдущее           | 上一个                         |
| `search.next`         | Next match           | Следующее            | 下一个                         |
| `search.close`        | Close                | Закрыть              | 关闭                           |
| `search.counter`      | {current} of {total} | {current} из {total} | 第 {current} 个，共 {total} 个 |
| `search.counterTotal` | {total} matches      | Совпадений: {total}  | {total} 个匹配                 |
| `search.noResults`    | No results           | Нет результатов      | 无结果                         |

- [ ] **Step 8: Run** `pnpm check` and `pnpm test:e2e` → PASS. Manually: `pnpm tauri dev`, Mod+F in a chapter: counter updates while typing and on ↑/↓, Esc closes, Alt+Enter selects all, labels are Russian under the RU UI.

- [ ] **Step 9: Commit**

```bash
git add src/components/editor/chapter-search-panel.ts src/components/editor/SourceEditor.vue src/components/editor/CssEditor.vue src/components/editor/editor-theme.ts src/locales src/components/editor/__tests__/chapter-search-panel.test.ts
git commit -m "feat(search): own chapter search panel with a live match counter"
```

---

### Task 7: Single-image rename without a number

**Files:**

- Modify: `src/services/book/rename-resources.ts`, `src/components/images/RenameImagesDialog.vue`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/services/book/__tests__/rename-resources.test.ts`, `src/components/images/__tests__/RenameImagesDialog.test.ts`

**Interfaces:**

- Produces: `renameTargets(selection: string[], name: string): string[]`; `planRename(book: Book, selection: string[], name: string): RenamePlan` (replaces `planBatchRename`; same `RenamePlan` type).

- [ ] **Step 1: Update and add service tests.** In `rename-resources.test.ts` replace every `planBatchRename` with `planRename`. In "rejects an empty name and a clash with an unselected image" change the clash case to the single-image rule:

```ts
expect(planRename(book(["images/a.png", "images/x.png"], []), ["images/a.png"], "x")).toEqual({
  error: "conflict",
  path: "images/x.png",
});
```

Add:

```ts
it("names a single image without a number", () => {
  expect(planRename(book(["images/a.jpg"], []), ["images/a.jpg"], "cover")).toEqual({
    renames: [{ from: "images/a.jpg", to: "images/cover.jpg" }],
  });
});

it("has nothing to do when a single image keeps its name", () => {
  expect(planRename(book(["images/a.jpg"], []), ["images/a.jpg"], "a")).toEqual({ renames: [] });
});

it("numbers only when there are several images", () => {
  expect(renameTargets(["images/a.png", "images/b.jpg"], "x")).toEqual([
    "images/x_1.png",
    "images/x_2.jpg",
  ]);
  expect(renameTargets(["images/a.png"], "x")).toEqual(["images/x.png"]);
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/services/book/__tests__/rename-resources.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `rename-resources.ts` (replace `planBatchRename`):

```ts
const extensionOf = (path: string) => path.slice(path.lastIndexOf("."));

/** One image keeps a plain name; several get `_NN`, padded to the count's width, in selection order. */
export function renameTargets(selection: string[], name: string): string[] {
  if (selection.length === 1) return [`images/${name}${extensionOf(selection[0]!)}`];
  const width = String(selection.length).length;
  return selection.map(
    (from, index) => `images/${name}_${String(index + 1).padStart(width, "0")}${extensionOf(from)}`,
  );
}

export function planRename(book: Book, selection: string[], name: string): RenamePlan {
  if (name === "") return { error: "empty" };
  const targets = renameTargets(selection, name);
  const selected = new Set(selection);
  const renames: ResourceRename[] = [];
  for (const [index, from] of selection.entries()) {
    const to = targets[index]!;
    if (book.resources.has(to) && !selected.has(to)) return { error: "conflict", path: to };
    if (to !== from) renames.push({ from, to });
  }
  return { renames };
}
```

- [ ] **Step 4: Run** the service tests → PASS.

- [ ] **Step 5: Dialog tests** — add to `RenameImagesDialog.test.ts` (reuse the file's book setup; extract it into a `setup(resources)` helper if convenient):

```ts
it("renames one image without a number, starting from its current name", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const book = createBook({
    locale: "en",
    now: new Date("2026-01-01"),
    newUuid: () => "550e8400-e29b-41d4-a716-446655440000",
    newChapterId: () => "chapter1",
  });
  useProjectStore().setBook({ ...book, resources: new Map([["images/a.png", png]]) });
  const { emitted } = render(RenameImagesDialog, {
    props: { open: true, paths: ["images/a.png"] },
    global: { plugins: [pinia] },
  });
  const field = await screen.findByRole("textbox", { name: /new name/i });
  expect(screen.getByRole("heading", { name: "Rename image" })).toBeTruthy();
  expect(field).toHaveValue("a");
  expect(screen.getByRole("button", { name: /^rename$/i })).toBeDisabled();

  await userEvent.clear(field);
  await userEvent.type(field, "cover");
  expect(screen.getByText("cover.png")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /^rename$/i }));
  expect(emitted("confirm")?.[0]).toEqual([[{ from: "images/a.png", to: "images/cover.png" }]]);
});
```

- [ ] **Step 6: Run** the dialog tests → FAIL.

- [ ] **Step 7: Implement the dialog.** Script:

```ts
import { planRename, renameTargets, type ResourceRename } from "@/services/book/rename-resources";

const single = computed(() => props.paths.length === 1);
const shortName = (path: string) => path.replace(/^images\//, "");
const stem = (path: string) => shortName(path).replace(/\.[^.]+$/, "");
watch(
  () => props.open,
  (open) => {
    if (open) name.value = single.value ? stem(props.paths[0]!) : "";
  },
  { immediate: true },
);

const plan = computed(() =>
  project.book ? planRename(project.book, props.paths, name.value) : { error: "empty" as const },
);
// The preview comes from the same naming rule as the plan.
const preview = computed(() => {
  const targets = name.value ? renameTargets(props.paths, name.value) : [];
  return props.paths.map((from, index) => ({
    from: shortName(from),
    to: targets[index] ? shortName(targets[index]) : "—",
  }));
});
const canConfirm = computed(() => "renames" in plan.value && plan.value.renames.length > 0);
function confirm() {
  if (canConfirm.value && "renames" in plan.value) emit("confirm", plan.value.renames);
}
```

Template: title `{{ single ? t("gallery.renameOneTitle", "Rename image") : t("gallery.renameTitle", "Rename images") }}`; description `{{ single ? t("gallery.renameOneHint", "Latin letters, digits, _ and - only.") : t("gallery.renameHint", …existing…) }}`; the `Input` gets `@focus="($event.target as HTMLInputElement).select()"`; the submit button `:disabled="!canConfirm"`.

Locale keys (group `gallery`):

| key                      | en                                   | ru                             | zh-CN                        |
| ------------------------ | ------------------------------------ | ------------------------------ | ---------------------------- |
| `gallery.renameOneTitle` | Rename image                         | Переименовать изображение      | 重命名图片                   |
| `gallery.renameOneHint`  | Latin letters, digits, _ and - only. | Только латиница, цифры, _ и -. | 仅限拉丁字母、数字、_ 和 -。 |

- [ ] **Step 8: Run** `pnpm check` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/book/rename-resources.ts src/components/images/RenameImagesDialog.vue src/locales src/services/book/__tests__/rename-resources.test.ts src/components/images/__tests__/RenameImagesDialog.test.ts
git commit -m "fix(images): rename a single image without a number suffix"
```

---

### Task 8: Choose the cover from the book's images

**Files:**

- Modify: `src/components/editor/ImagePickerPopover.vue`, `src/components/metadata/CoverPicker.vue`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/components/metadata/__tests__/CoverPicker.test.ts`

**Interfaces:**

- Produces: `ImagePickerPopover` props `selected?: string`, `variant?: "square" | "cover"` (default `"square"`; the format toolbar usage is unchanged).

- [ ] **Step 1: Write the failing tests** — add to `CoverPicker.test.ts` (import `setCover`-free; the component does it):

```ts
it("makes one of the book's images the cover without importing anything", async () => {
  useProjectStore().book!.resources.set("images/a.png", {
    mediaType: "image/png",
    bytes: png(10, 16),
  });
  const pick = vi.fn<() => Promise<void>>(async () => undefined);
  const wrapper = mount(CoverPicker, {
    props: { cover: null, onPick: pick },
    attachTo: document.body,
  });

  await wrapper.get("[data-cover-from-book]").trigger("click");
  await new Promise((resolve) => setTimeout(resolve));
  document.querySelector<HTMLButtonElement>('button[aria-label="images/a.png"]')!.click();

  expect(useProjectStore().book!.metadata.cover).toBe("images/a.png");
  expect(pick).not.toHaveBeenCalled();
  wrapper.unmount();
});

it("can't pick from the book when it has no images", () => {
  const wrapper = mount(CoverPicker, { props: { cover: null } });
  expect(wrapper.get("[data-cover-from-book]").attributes()).toHaveProperty("disabled");
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/components/metadata/__tests__/CoverPicker.test.ts` → FAIL.

- [ ] **Step 3: `ImagePickerPopover.vue`.**

```ts
const props = withDefaults(defineProps<{ selected?: string; variant?: "square" | "cover" }>(), {
  variant: "square",
});
```

Tile button: `:class="[variant === 'cover' ? 'aspect-[5/8]' : 'aspect-square', 'overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring', path === selected && 'ring-2 ring-primary']"`, `:aria-pressed="selected === undefined ? undefined : path === selected"`; image class `variant === 'cover' ? 'size-full object-contain' : 'size-full object-cover'`. Use `props.variant` / `props.selected` in script if needed.

- [ ] **Step 4: `CoverPicker.vue`.** Script additions:

```ts
import { ref } from "vue";
import { setCover } from "@/services/book/metadata";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ImagePickerPopover from "@/components/editor/ImagePickerPopover.vue";

const pickerOpen = ref(false);
const hasImages = computed(() => (project.book?.resources.size ?? 0) > 0);
function pickFromBook(path: string) {
  if (project.book) project.applyMutation(setCover(project.book, path));
  pickerOpen.value = false;
}
```

Buttons row (the file button stays first and keeps calling `choose`):

```vue
<div class="flex flex-wrap items-center gap-2">
  <Button type="button" variant="outline" size="sm" @click="choose">
    {{ t("metadata.coverFromFile", "From file…") }}
  </Button>
  <Popover v-model:open="pickerOpen">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="!hasImages"
        :title="hasImages ? undefined : t('format.noImages', 'The book has no images yet')"
        data-cover-from-book
      >
        {{ t("metadata.coverFromBook", "From book images…") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-2">
      <ImagePickerPopover :selected="cover ?? undefined" variant="cover" @pick="pickFromBook" />
    </PopoverContent>
  </Popover>
  <Button v-if="cover" type="button" variant="ghost" size="sm" @click="emit('remove')">
    {{ t("metadata.remove", "Remove") }}
  </Button>
</div>
```

Locale keys (group `metadata`):

| key                      | en                | ru                    | zh-CN       |
| ------------------------ | ----------------- | --------------------- | ----------- |
| `metadata.coverFromFile` | From file…        | Из файла…             | 从文件…     |
| `metadata.coverFromBook` | From book images… | Из изображений книги… | 从书中图片… |

Delete `metadata.choose` from all three locales only if `grep -rn "metadata.choose" src` finds no other use.

- [ ] **Step 5: Run** `pnpm vitest run src/components/metadata` → PASS (the existing test still clicks the first button = From file). `pnpm check` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/ImagePickerPopover.vue src/components/metadata/CoverPicker.vue src/locales src/components/metadata/__tests__/CoverPicker.test.ts
git commit -m "feat(metadata): choose the cover from the book's images"
```

---

### Task 9: "Set as cover" and "Rename…" on the image page and in the gallery bar

**Files:**

- Modify: `src/components/editor/ImageView.vue`, `src/components/images/ImageGallery.vue`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/components/editor/__tests__/ImageView.test.ts`, `src/components/images/__tests__/ImageGallery.test.ts`

**Interfaces:**

- Consumes: `RenameImagesDialog` single mode (Task 7); `useImageActions().renameImages`; `setCover`.

- [ ] **Step 1: Write the failing tests.** `ImageView.test.ts`:

```ts
it("makes the image the cover", async () => {
  openBook("# Chapter 1");
  renderImage();
  await userEvent.click(screen.getByRole("button", { name: "Set as cover" }));
  expect(useProjectStore().book!.metadata.cover).toBe("images/cover.png");
  expect(screen.getByRole("button", { name: "Set as cover" })).toBeDisabled();
});

it("renames the image and keeps showing it", async () => {
  openBook("# Chapter 1\n\n![](images/cover.png)");
  useLayoutStore().center = { kind: "image", path: "images/cover.png" };
  renderImage();
  await userEvent.click(screen.getByRole("button", { name: "Rename…" }));
  const field = await screen.findByRole("textbox", { name: /new name/i });
  await userEvent.clear(field);
  await userEvent.type(field, "front{Enter}");
  expect(useProjectStore().book!.resources.has("images/front.png")).toBe(true);
  expect(useLayoutStore().center).toEqual({ kind: "image", path: "images/front.png" });
});
```

`ImageGallery.test.ts`:

```ts
it("offers Set as cover only for a single selected image", async () => {
  const { container } = mountGallery();
  const user = userEvent.setup();
  await user.keyboard("{Meta>}");
  await user.click(screen.getByRole("gridcell", { name: /spare\.png/ }));
  await user.keyboard("{/Meta}");
  await user.click(container.querySelector<HTMLElement>("[data-selection-cover]")!);
  expect(useProjectStore().book!.metadata.cover).toBe("images/spare.png");

  await user.keyboard("{Meta>}");
  await user.click(screen.getByRole("gridcell", { name: /used\.png/ }));
  await user.keyboard("{/Meta}");
  expect(container.querySelector("[data-selection-cover]")).toBeNull();
});
```

- [ ] **Step 2: Run** both files → new tests FAIL.

- [ ] **Step 3: `ImageView.vue`.** Script additions:

```ts
import { ref } from "vue";
import { IconPencil, IconStar, IconStarFilled } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import RenameImagesDialog from "@/components/images/RenameImagesDialog.vue";
import { useImageActions } from "@/composables/use-image-actions";
import { setCover } from "@/services/book/metadata";
import type { ResourceRename } from "@/services/book/rename-resources";

const isCover = computed(() => project.book?.metadata.cover === props.path);
function makeCover() {
  if (project.book) project.applyMutation(setCover(project.book, props.path));
}
const { renameImages } = useImageActions();
const renaming = ref(false);
function confirmRename(renames: ResourceRename[]) {
  renameImages(renames);
  renaming.value = false;
  const renamed = renames[0];
  // The page is addressed by path; follow the image to its new name.
  if (renamed) layout.center = { kind: "image", path: renamed.to };
}
```

In `<CardHeader>`, after the badges `div`, add:

```vue
<div class="flex flex-wrap gap-2">
  <Badge v-if="isCover"><IconStarFilled aria-hidden="true" />{{ t("gallery.cover", "Cover") }}</Badge>
  <Button variant="outline" size="sm" :disabled="isCover" @click="makeCover">
    <IconStar aria-hidden="true" />{{ t("images.setCover", "Set as cover") }}
  </Button>
  <Button variant="outline" size="sm" @click="renaming = true">
    <IconPencil aria-hidden="true" />{{ t("gallery.rename", "Rename…") }}
  </Button>
</div>
```

and before `</section>`:

```vue
<RenameImagesDialog
  :open="renaming"
  :paths="[path]"
  @cancel="renaming = false"
  @confirm="confirmRename"
/>
```

- [ ] **Step 4: `ImageGallery.vue`** — in the selection bar, before the Rename button:

```vue
<Button
  v-if="selection.order.length === 1"
  variant="outline"
  size="sm"
  data-selection-cover
  @click="contextAction(selection.order[0]!, 'cover')"
>
  <IconStar aria-hidden="true" />{{ t("images.setCover", "Set as cover") }}
</Button>
```

Import `IconStar` from `@tabler/icons-vue`. No new locale keys (reuses `images.setCover`, `gallery.cover`, `gallery.rename`).

- [ ] **Step 5: Run** `pnpm vitest run src/components/editor src/components/images` → PASS. `pnpm check` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/ImageView.vue src/components/images/ImageGallery.vue src/components/editor/__tests__/ImageView.test.ts src/components/images/__tests__/ImageGallery.test.ts
git commit -m "feat(images): Set as cover and Rename on the image page and selection bar"
```

---

### Task 10: Block-quote style in the book theme

**Files:**

- Modify: `src/assets/epub/theme.css.ts`
- Create: `src/assets/epub/__tests__/theme.test.ts`
- Modify: `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md` (line ~675, theme.css bullets)

**Interfaces:**

- Produces: `themeCss` contains `blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 0.2em solid; }`.

- [ ] **Step 1: Write the failing test** — create `src/assets/epub/__tests__/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { themeCss } from "@/assets/epub/theme.css";

describe("book theme", () => {
  it("marks block quotes with a left rule in the text colour", () => {
    expect(themeCss).toContain(
      "blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 0.2em solid; }",
    );
  });

  it("sets no colours, so readers' night modes keep working", () => {
    expect(themeCss).not.toMatch(/(^|[\s;{])(color|background(-color)?)\s*:/);
    expect(themeCss).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/assets/epub/__tests__/theme.test.ts` → first test FAILS.

- [ ] **Step 3: Implement** — in `theme.css.ts` replace `blockquote { margin: 1em 2em; }` with `blockquote { margin: 1em 0 1em 1em; padding-left: 1em; border-left: 0.2em solid; }` (keep the single-line string format). No `blockquote + p` rule (decided: keep the indent).

- [ ] **Step 4: Run** the test and `pnpm vitest run src/services/epub` → PASS.

- [ ] **Step 5: Spec** — in the base spec, replace the bullet "`blockquote` with margins in `em`." with: "`blockquote` — left rule `border-left: 0.2em solid` without a colour (the border takes the text colour, so night modes invert it too), `padding-left: 1em`, no right margin."

- [ ] **Step 6: Run** `pnpm check` and `pnpm build:fixture-epubs` (epubcheck runs in CI; if Java is available locally, run the epubcheck script the CI uses). Commit:

```bash
git add src/assets/epub/theme.css.ts src/assets/epub/__tests__/theme.test.ts docs/superpowers/specs/2026-09-15-easy-digital-book-design.md
git commit -m "feat(epub): left rule for block quotes in the book theme"
```

---

### Task 11: Book title in the corner, title from the file name, Show in folder

**Files:**

- Modify: `src/services/book/create.ts`, `src/composables/use-project-files.ts`, `src/components/layout/FileMenu.vue`, `src/views/EditorView.vue`, `e2e/file-menu.spec.ts`, `src/locales/{ru,en,zh-CN}.json`
- Test: `src/services/book/__tests__/domain.test.ts`, `src/composables/__tests__/use-project-files.test.ts`, `src/components/layout/__tests__/FileMenu.test.ts`

**Interfaces:**

- Produces: `DEFAULT_TITLES: Record<"ru" | "en" | "zh-CN", string>`, `isDefaultTitle(title: string): boolean` in `services/book/create.ts`; `ProjectFilesController.reveal(): Promise<void>`; `FileMenu` prop `canReveal: boolean`, event `reveal`.

- [ ] **Step 1: Write the failing tests.**

`domain.test.ts` (add; import `isDefaultTitle`):

```ts
it("recognises the placeholder titles of a new book", () => {
  expect(isDefaultTitle("Без названия")).toBe(true);
  expect(isDefaultTitle(" Untitled ")).toBe(true);
  expect(isDefaultTitle("未命名")).toBe(true);
  expect(isDefaultTitle("")).toBe(true);
  expect(isDefaultTitle("Untitled Saga")).toBe(false);
});
```

`use-project-files.test.ts` (add; `readEdb` from `@/services/edb/read`):

```ts
it("names a never-saved untitled book after the file on first save", async () => {
  const services = createInMemoryPlatformServices();
  const project = useProjectStore();
  project.configure(services);
  project.setBook(makeBook(), null, { dirty: true });
  const files = createProjectFiles({ services, locale: "en" });

  await expect(files.saveAs("/books/My novel.edb")).resolves.toBe(true);

  expect(project.book?.metadata.title).toBe("My novel");
  const saved = await readEdb(await services.files.readFile("/books/My novel.edb"), {
    now: () => new Date("2026-01-03"),
  });
  expect(saved.book.metadata.title).toBe("My novel");
});

it("keeps a title the author typed, and never renames on later saves", async () => {
  const services = createInMemoryPlatformServices();
  const project = useProjectStore();
  project.configure(services);
  const book = makeBook();
  project.setBook({ ...book, metadata: { ...book.metadata, title: "Saga" } }, null, {
    dirty: true,
  });
  const files = createProjectFiles({ services, locale: "en" });
  await files.saveAs("/books/draft.edb");
  expect(project.book?.metadata.title).toBe("Saga");

  project.setBook(makeBook(), "/books/old.edb", { dirty: false });
  await files.saveAs("/books/copy.edb");
  expect(project.book?.metadata.title).toBe("Untitled");
});

it("leaves the title alone when the save dialog is cancelled", async () => {
  const services = createInMemoryPlatformServices();
  const project = useProjectStore();
  project.configure(services);
  project.setBook(makeBook(), null, { dirty: true });
  vi.spyOn(services.dialogs, "save").mockResolvedValue(null);
  const files = createProjectFiles({ services, locale: "en" });

  await expect(files.saveAs()).resolves.toBe(false);
  expect(project.book?.metadata.title).toBe("Untitled");
});

it("reveals the saved project file", async () => {
  const services = createInMemoryPlatformServices();
  const project = useProjectStore();
  project.configure(services);
  project.setBook(makeBook(), "/books/saga.edb", { dirty: false });
  const reveal = vi.spyOn(services.opener, "reveal").mockResolvedValue(undefined);
  const files = createProjectFiles({ services, locale: "en" });

  await files.reveal();

  expect(reveal).toHaveBeenCalledWith("/books/saga.edb");
});
```

`FileMenu.test.ts`: update the expected item list to

```ts
expect(items).toEqual([
  "New project Mod+N",
  "Open… Mod+O",
  "Save Mod+S",
  "Save as… Mod+Shift+S",
  "Show in folder",
  "Close project Mod+W",
]);
```

pass `canReveal: true` in every existing `render(FileMenu, { props: { … } })`, add `["Show in folder", "reveal"]` to the `it.each` table only if the matcher handles an item without a shortcut (its regex is `^${label} Mod`; for this row use a separate test):

```ts
it("shows the project in its folder, once it has been saved", async () => {
  const { emitted } = render(FileMenu, { props: { title: "Saga", dirty: false, canReveal: true } });
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
```

- [ ] **Step 2: Run** the three files → new tests FAIL.

- [ ] **Step 3: `create.ts`.**

```ts
export const DEFAULT_TITLES = { ru: "Без названия", en: "Untitled", "zh-CN": "未命名" } as const;

/** A title nobody typed: empty or a new book's placeholder in any UI language. */
export function isDefaultTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed === "" || Object.values(DEFAULT_TITLES).some((value) => value === trimmed);
}
```

and in `createBook`: `const title = language === "ru" ? DEFAULT_TITLES.ru : language === "zh-CN" ? DEFAULT_TITLES["zh-CN"] : DEFAULT_TITLES.en;`.

- [ ] **Step 4: `use-project-files.ts`.** Imports: `isDefaultTitle` from `@/services/book/create`, `updateMetadata` from `@/services/book/metadata`, `useNotificationsStore` from `@/stores/notifications`, `appErrorFromUnknown` from `@/types/errors` (if not already imported). Add a helper above `createProjectFiles`:

```ts
function fileStem(path: string): string {
  return (path.split(/[\\/]/).pop() ?? "").replace(/\.edb$/i, "").trim();
}
```

Replace `saveAs`:

```ts
async function saveAs(path?: string): Promise<boolean> {
  const neverSaved = project.filePath === null;
  const target =
    path ??
    (await services.dialogs.save({
      title: t("files.saveTitle", "Save project"),
      defaultPath: projectFileName(
        project.book?.metadata.title ?? t("files.untitled", "Untitled"),
        t("files.untitled", "Untitled"),
      ),
      filters: [{ name: t("files.openFilter", "Easy Digital Book"), extensions: ["edb"] }],
    }));
  if (!target) return false;
  // A book saved for the first time under a placeholder title is named after
  // its file, in the same write.
  const stem = fileStem(target);
  if (neverSaved && project.book && stem && isDefaultTitle(project.book.metadata.title))
    project.applyMutation(updateMetadata(project.book, { title: stem }));
  return project.save(target);
}

async function reveal(): Promise<void> {
  if (!project.filePath) return;
  try {
    await services.opener.reveal(project.filePath);
  } catch (error) {
    services.logger.warn("Could not reveal the project file", {
      code: appErrorFromUnknown(error, "platform.opener").code,
    });
    useNotificationsStore().add({
      kind: "error",
      message: t("fileMenu.revealFailed", "Could not open the folder"),
    });
  }
}
```

Add `reveal(): Promise<void>;` to `ProjectFilesController` (doc comment: "Shows the saved project file in the OS file manager.") and `reveal,` to the returned object. If vue-tsc reports other `ProjectFilesController` implementations (test fakes), add `reveal: async () => {}` there.

- [ ] **Step 5: `FileMenu.vue`.** Props: `defineProps<{ title: string; dirty: boolean; canReveal: boolean }>()` (assign to `const props`). Emits: add `reveal: []`. `Command` adds `"reveal"`. Groups — the save group becomes:

```ts
  [
    { command: "save", label: t("common.save", "Save"), shortcut: "Mod+S" },
    { command: "saveAs", label: t("fileMenu.saveAs", "Save as…"), shortcut: "Mod+Shift+S" },
    {
      command: "reveal",
      label: t("fileMenu.reveal", "Show in folder"),
      shortcut: "",
      disabled: !props.canReveal,
    },
  ],
```

(type the item as `{ command: Command; label: string; shortcut: string; disabled?: boolean }`). Template: `<DropdownMenuItem … :disabled="item.disabled" …>` and `<DropdownMenuShortcut v-if="item.shortcut">`. `run()`: add `else if (command === "reveal") emit("reveal");` before the final `else`.

- [ ] **Step 6: `EditorView.vue`.** `<FileMenu>`:

```vue
<FileMenu
  :title="project.book?.metadata.title.trim() || t('editor.unnamedBook', 'Untitled book')"
  :dirty="project.dirty"
  :can-reveal="Boolean(project.filePath)"
  @new="files?.newBook()"
  @open="files?.open()"
  @save="files?.save()"
  @save-as="files?.saveAs()"
  @reveal="files?.reveal()"
  @close="files?.close()"
/>
```

- [ ] **Step 7: e2e** — in `e2e/file-menu.spec.ts` replace both `{ name: /Untitled book/ }` with `{ name: /^Untitled/ }` (a new English book is titled "Untitled").

Locale keys (group `fileMenu`):

| key                     | en                        | ru                       | zh-CN          |
| ----------------------- | ------------------------- | ------------------------ | -------------- |
| `fileMenu.reveal`       | Show in folder            | Показать в папке         | 在文件夹中显示 |
| `fileMenu.revealFailed` | Could not open the folder | Не удалось открыть папку | 无法打开文件夹 |

- [ ] **Step 8: Run** `pnpm check` and `pnpm test:e2e` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/book/create.ts src/composables/use-project-files.ts src/components/layout/FileMenu.vue src/views/EditorView.vue e2e/file-menu.spec.ts src/locales src/services/book/__tests__/domain.test.ts src/composables/__tests__/use-project-files.test.ts src/components/layout/__tests__/FileMenu.test.ts
git commit -m "feat(files): book title in the file menu, title from file name, Show in folder"
```

---

### Task 12: Record the decisions and verify

**Files:**

- Modify: `docs/superpowers/notes/2026-10-04-issues.md`, `AGENTS.md`, `docs/superpowers/specs/2026-09-15-easy-digital-book-design.md`, `docs/release-checklist.md`

- [ ] **Step 1: Notes** — under the intro of `2026-10-04-issues.md` add: "Implemented by `docs/superpowers/plans/2026-10-04-improvements.md`. The spell checker is roadmap: `docs/superpowers/specs/2026-10-04-spell-checker-design.md`."

- [ ] **Step 2: Base spec** — §9.4 Gallery: replace "names become `<name>_<NN>.<ext>`…" with "one image → `<name>.<ext>` (the dialog starts from the current name); several → `<name>_<NN>.<ext>`, …" and the line "Rename is in scope since 2026-10-03 (batch only, see Gallery above)." with "Rename is in scope since 2026-10-03: single or batch, from the gallery bar, the tile menu and the image page." Add to the preview section: "Under the dark theme the preview uses a preview-only 'paper' layer derived from the app tokens, with toggles (paper style Mod+Alt+P, dim images) and a status-bar notice; `theme.css` stays colourless." Add to the file scenarios: "The file menu shows the book title; the first save of a book with a placeholder title takes the title from the file name; 'Show in folder' reveals the saved file." Add to the editor section: "Chapter search uses an own panel (`chapter-search-panel.ts`) with a live counter; matching shares `querySource()` with the book search."

- [ ] **Step 3: AGENTS.md** — add a status line under the existing ones:

```
**Статус (2026-10-04):** по отзывам пользователя: тёмное превью «старая
бумага» (только превью, переключатели + Mod+Alt+P, пометка в строке
статуса), Tab в CSS-редакторе, своя панель поиска по главе со счётчиком
(общий `querySource` с поиском по книге), отступы превью, обложка из
изображений книги, переименование одной картинки без номера, линия слева у
цитат в theme.css, название книги в меню файла и «Показать в папке». План —
`docs/superpowers/plans/2026-10-04-improvements.md`.
```

and in section 4b change "Имена `<имя>_<NN>.<расш>`…" to "Одна картинка — `<имя>.<расш>`, несколько — `<имя>_<NN>.<расш>`…"; in section 5 theme.css bullet add "цитата — линия слева без цвета (`border-left: 0.2em solid`)".

- [ ] **Step 4: Release checklist** — add manual checks to `docs/release-checklist.md`: "Dark theme: preview paper look, both toggles, Mod+Alt+P, status-bar notice; Mod+F counter; Tab in custom.css; cover from book images; single-image rename; Show in folder on each OS."

- [ ] **Step 5: Full verification** — `pnpm check`, `pnpm test:e2e`, `pnpm build`. Manual smoke in `pnpm tauri dev` on the dark theme: each of items 1–8 from the notes.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/2026-10-04-issues.md AGENTS.md docs/superpowers/specs/2026-09-15-easy-digital-book-design.md docs/release-checklist.md
git commit -m "docs: record the 2026-10-04 improvements"
```
