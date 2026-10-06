import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import zhCN from "@/locales/zh-CN.json";
import { expect, it } from "vitest";

function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object"
      ? keys(child as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

it("keeps every locale key aligned with English", () => {
  expect(keys(ru).sort()).toEqual(keys(en).sort());
  expect(keys(zhCN).sort()).toEqual(keys(en).sort());
});

it("contains the localized keys required by the final editor shell", () => {
  expect(keys(en)).toEqual(
    expect.arrayContaining([
      "breadcrumbs.metadata",
      "breadcrumbs.settings",
      "breadcrumbs.chapters",
      "breadcrumbs.fallback",
      "editor.unnamedBook",
      "editor.selectChapter",
      "editor.chooseChapter",
      "editor.status",
      "warnings.currentChapter",
      "warnings.book",
      "warnings.none",
      "warnings.count",
      "files.openTitle",
      "files.saveTitle",
      "files.importImage",
      "files.fileNotFound",
      "files.openFailed",
      "files.recoverTitle",
      "files.recoverMessage",
      "files.saveFailed",
      "export.format",
      "export.title",
      "export.saved",
      "export.progressAzw3",
      "export.filterName",
      "errors.export.failed",
      "errors.export.azw3Limit",
      "errors.export.azw3Link",
      "errors.export.azw3Resource",
    ]),
  );
});

it("keeps interpolation parameters aligned for format-aware export messages", () => {
  const interpolations = (value: string) =>
    [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  for (const key of ["export.title", "export.saved", "export.filterName"]) {
    const value = (locale: typeof en) =>
      key
        .split(".")
        .reduce<unknown>(
          (current, segment) => (current as Record<string, unknown>)[segment],
          locale,
        );
    expect(interpolations(value(ru) as string)).toEqual(interpolations(value(en) as string));
    expect(interpolations(value(zhCN) as string)).toEqual(interpolations(value(en) as string));
  }
});
